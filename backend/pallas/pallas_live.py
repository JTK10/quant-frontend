"""Pallas VM2 worker: existing chart stream + atomic Ocelot exports, no broker/DB.

Early ticks and closed-candle decisions are separate immutable research alerts.
Broker premium remains a dated reference quote, never an asserted fill price.
"""
import asyncio
import base64
import json
import math
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent / 'deps'))
import httpx
import websockets
from pallas_engine import Scanner, minute, clock, VERSION, finite

IST = ZoneInfo('Asia/Kolkata')
ROOT = Path(os.environ.get('PALLAS_ROOT', '/home/ubuntu/pallas'))
STREAM = os.environ.get('PALLAS_STREAM_URL', 'wss://140.238.241.210.sslip.io')
CONFIG = Path(os.environ.get('PALLAS_ORDS_CONFIG', '/home/ubuntu/ocelot/ords.json'))
TICK_MAX_AGE = 10  # Transport freshness, not a trading filter.
CHAIN_MAX_AGE = 360  # One five-minute capture cycle plus export/publish allowance.


def iso(epoch):
    return datetime.fromtimestamp(epoch, IST).isoformat()


def save(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(payload, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    os.replace(temp, path)


def unpack(payload):
    return {sym: [dict(strike=r[0], leg=r[1], ltp=r[2], oi=r[3], prev_oi=r[4], vol=r[5], expiry=payload['expiry']) for r in rows]
            for sym, rows in payload['chains'].items()}


def structures(scanner):
    result = []
    for sym, bars in scanner.bars.items():
        base = scanner.baselines.get(sym)
        if not base or base.get('spot', 0) < 50 or any(not finite(base.get(k)) or base[k] <= 0 for k in ('open', 'pdh', 'pdl')):
            continue
        pole = [b for b in bars if b['hm'] <= '09:45:00']
        if len(pole) < 3:
            continue
        hi, lo = max(b['h'] for b in pole), min(b['l'] for b in pole)
        bm, sm = (hi / base['open'] - 1) * 100, (1 - lo / base['open']) * 100
        bd, sd = (hi / base['pdh'] - 1) * 100, (1 - lo / base['pdl']) * 100
        bull, bear = hi > base['pdh'] and bm >= 1, lo < base['pdl'] and sm >= 1
        if not (bull or bear):
            continue
        side = 'BULL' if bull and (not bear or bd > sd) else 'BEAR'
        extreme, move = (hi, bm) if side == 'BULL' else (lo, sm)
        pole_bar = next(b for b in pole if b['h' if side == 'BULL' else 'l'] == extreme)
        pb_bars = [b for b in bars if pole_bar['hm'] < b['hm'] <= '10:35:00']
        pb = ((extreme - min(b['l'] for b in pb_bars)) if side == 'BULL' else (max(b['h'] for b in pb_bars) - extreme)) / extreme * 100 if pb_bars else 0
        walls = scanner.prior_walls.get((sym, scanner.expiry), {})
        result.append(dict(symbol=sym, side=side, stage='flag' if pb_bars and .1 <= pb <= 2.2 else 'pole',
                           spot=bars[-1]['c'], pole_move_pct=round(move, 2), flag_pb_pct=round(pb, 2),
                           pole_extreme=extreme, prev_levels={'s1': walls.get('S1'), 'r1': walls.get('R1')}))
    return result


class State:
    def __init__(self, root=ROOT):
        self.root = root
        self.day = None
        self.scanner = None
        self.snapshots = []
        self.processed = set()
        self.prices = {}
        self.early = {}
        self.events = {}
        self.connected = False
        self.last_tick_at = None
        self.last_status = None
        self.last_health = 0
        self.last_published_health = 0
        self.generation = 0
        self.input_error = None

    def document(self, kind, payload, now=None):
        now = time.time() if now is None else now
        doc = dict(source='pallas', cap='PALLAS', name='', side='NEUTRAL', date=self.day,
                   sig_date=self.day.replace('-', ''), time=datetime.fromtimestamp(now, IST).strftime('%H:%M:%S'),
                   ts=now, available_at=iso(now), kind=kind, engine=VERSION, **payload)
        doc['Doc_ID'] = f"{self.day}|{kind}|{time.time_ns()}"
        save(self.root / 'outbox' / (str(time.time_ns()) + '.json'), doc)
        return doc

    def start_day(self, day):
        self.day = day
        self.scanner = None
        self.snapshots = []
        self.processed.clear()
        self.prices.clear()
        self.early.clear()
        self.events.clear()
        for path in sorted((self.root / 'events' / day).glob('*.json')):
            event = json.loads(path.read_text())
            self.events[event['Event_ID']] = event
            if event['Event_Type'] == 'EARLY_TICK':
                self.early[event['Symbol']] = event
        self.last_status = None
        self.input_error = None

    def accept_event(self, event, event_type, issued, chain_at, available_at, tick_at=None, recovered=False):
        event = dict(event)
        identifier = f"{event_type}|{self.day}|{event['Symbol']}|{event['Side']}|{event['Expiry']}|{event['Selected_Strike']}|{event['Breakout_Bar_Start']}"
        if identifier in self.events:
            return self.events[identifier]
        event.update(Event_ID=identifier, Event_Type=event_type, Issued_At=iso(issued),
                     Chain_Received_At=iso(chain_at), Chain_Available_At=iso(available_at),
                     Reference_Premium_At=iso(chain_at), OI_Age_Seconds=round(issued - chain_at, 2),
                     Ticks_At=iso(tick_at) if tick_at else None, Recovered=bool(recovered),
                     Confirmation_Status='PENDING_CLOSE' if event_type == 'EARLY_TICK' else 'CONFIRMED')
        self.events[identifier] = event
        save(self.root / 'events' / self.day / (identifier.replace('|', '_').replace(' ', '_').replace(':', '_') + '.json'), event)
        self.document('EARLY' if event_type == 'EARLY_TICK' else 'CONFIRMED', dict(signals=[event], status='Early tick breakout' if event_type == 'EARLY_TICK' else 'Completed candle confirmed'), issued)
        return event

    def early_tick(self, update, arrival, now):
        if not self.scanner or update.get('type') != 'candle' or update.get('kind') != 'update':
            return None
        recv, trade = update.get('recv_ts'), update.get('trade_ts')
        if not finite(recv) or not finite(trade) or not 0 <= now - recv <= TICK_MAX_AGE or not 0 <= recv - trade <= TICK_MAX_AGE:
            return None
        stamp = datetime.fromtimestamp(recv, IST)
        if stamp.date().isoformat() != self.day:
            return None
        hm = stamp.strftime('%H:%M:%S')
        bar_hm = clock(minute(hm) // 5 * 5)
        sym, current = update.get('symbol'), update.get('close')
        if not finite(current) or current <= 0 or sym not in self.scanner.baselines:
            return None
        previous = self.prices.get(sym)
        self.prices[sym] = (current, recv)
        if not '09:45:00' <= bar_hm <= '10:45:00':
            return None
        if previous is None or recv <= previous[1] or sym in self.early or sym in self.scanner.issued:
            return None
        # All completed input bars must be present through the previous interval.
        prior = [b for b in self.scanner.bars.get(sym, []) if b['hm'] < bar_hm]
        expected = [clock(t) for t in range(555, minute(bar_hm), 5)]
        if [b['hm'] for b in prior] != expected:
            return None
        # A chain arriving after this tick is never used to backdate an alert.
        snapshot = next((s for s in reversed(self.snapshots) if s['available_at'] <= arrival and s['received'].get(sym, math.inf) <= recv and not s['degraded']), None)
        if not snapshot:
            return None
        received = snapshot['received'].get(sym)
        if not finite(received) or not 0 <= recv - received <= CHAIN_MAX_AGE:
            return None
        trigger = dict(hm=bar_hm, o=update.get('open'), h=update.get('high'), l=update.get('low'), c=current)
        if not all(finite(trigger[k]) for k in ('o', 'h', 'l', 'c')):
            return None
        event = self.scanner.evaluate(sym, prior, trigger, snapshot['chains'].get(sym, []), hm)
        if not event:
            return None
        crossed = previous[0] <= event['Pole_Extreme'] < current if event['Side'] == 'BULL' else previous[0] >= event['Pole_Extreme'] > current
        if not crossed:
            return None
        event['Chain_Time'] = snapshot['cut'][:5]
        row = self.accept_event(event, 'EARLY_TICK', now, received, snapshot['available_at'], recv)
        self.early[sym] = row
        return row

    def ingest(self, payload, received_at, walls=None, recovered=False):
        if payload['date'] != self.day:
            self.start_day(payload['date'])
        cut = payload['cut']
        if cut in self.processed:
            return None
        chains = unpack(payload)
        available = max(received_at, payload['exported_at'])
        snapshot = dict(chains=chains, received=payload['chain_received'], available_at=available,
                        degraded=payload['degraded'], cut=cut)
        self.snapshots.append(snapshot)
        self.snapshots = self.snapshots[-2:]
        if cut == '09:15:00':
            self.scanner = Scanner(self.day, payload['baselines'], walls or {})
            self.scanner.expiry = payload['expiry']
        self.processed.add(cut)
        if not self.scanner:
            return None
        bars = {}
        for sym, candle in payload['candles'].items():
            start = candle['time'] + ':00'
            if minute(start) + 5 != minute(cut):
                continue
            bars[sym] = dict(hm=start, o=candle['open'], h=candle['high'], l=candle['low'], c=candle['close'])
        new = []
        if cut <= '11:30:00':
            # Missing/OI-late symbols can still accumulate valid cash history.
            decision_capture = payload['exported_at'] if recovered else available
            fresh = {sym: rows for sym, rows in chains.items() if not payload['degraded'] and finite(payload['chain_received'].get(sym)) and 0 <= decision_capture - payload['chain_received'][sym] <= CHAIN_MAX_AGE and [b['hm'] for b in self.scanner.bars.get(sym, [])] == [clock(t) for t in range(555, minute(cut)-5, 5)]}
            accepted = self.scanner.step(cut, bars, fresh)
            for event in accepted:
                sym = event['Symbol']
                new.append(self.accept_event(event, 'CONFIRMED_CLOSE', available, payload['chain_received'][sym], available, recovered=recovered))
        for sym, early in self.early.items():
            if early.get('Confirmation_Status') != 'PENDING_CLOSE' or sym not in bars or minute(bars[sym]['hm']) < minute(early['Breakout_Bar_Start']):
                continue
            exact = next((e for e in new if e['Symbol'] == sym and e['Side'] == early['Side'] and e['Breakout_Bar_Start'] == early['Breakout_Bar_Start']), None)
            early['Confirmation_Status'] = 'CONFIRMED' if exact else 'CLOSE_NOT_CONFIRMED'
            early['Confirmation_At'] = iso(available)
            save(self.root / 'events' / self.day / (early['Event_ID'].replace('|', '_').replace(' ', '_').replace(':', '_') + '.json'), early)
            self.document('EARLY_STATUS', dict(signals=[early], status=early['Confirmation_Status']), available)
        quotes = []
        seen = set()
        for event in self.events.values():
            key = (event['Symbol'], event['Expiry'], event['Strike'], event['Leg'])
            if key in seen:
                continue
            seen.add(key)
            quote = next((r for r in chains.get(key[0], []) if r['expiry'] == key[1] and r['strike'] == key[2] and r['leg'] == key[3] and finite(r['ltp']) and r['ltp'] > 0), None)
            if quote:
                quotes.append(dict(symbol=key[0], expiry=key[1], strike=key[2], leg=key[3], ltp=quote['ltp'], received_at=iso(payload['chain_received'][key[0]])))
        candidates = structures(self.scanner) if cut <= '10:50:00' else []
        for candidate in candidates:
            candidate['spot_at'] = iso(available)
        self.document('SNAPSHOT', dict(cut=cut[:5], status='Incomplete capture; alerts suppressed' if payload['degraded'] else 'Monitoring existing feeds',
                                     candidates=candidates, signals=[], quotes=quotes,
                                     bars=[[s, b['hm'][:5], b['o'], b['h'], b['l'], b['c'], available] for s,b in bars.items()] if cut <= '11:30:00' else [],
                                     coverage=dict(baselines=len(self.scanner.baselines), chains=len(chains), cash_bars=len(bars))), available)
        return new


class Publisher:
    def __init__(self):
        self.token, self.exp = None, 0
        self.cfg = json.loads(CONFIG.read_text())

    async def auth(self, client):
        if self.token and time.time() < self.exp:
            return self.token
        basic = base64.b64encode(f"{self.cfg['client_id']}:{self.cfg['client_secret']}".encode()).decode()
        response = await client.post(self.cfg['base'] + '/oauth/token', headers={'Authorization': 'Basic ' + basic}, data={'grant_type': 'client_credentials'})
        response.raise_for_status()
        data = response.json()
        self.token, self.exp = data['access_token'], time.time() + int(data.get('expires_in', 3600)) - 60
        return self.token

    async def prior_walls(self, client, payload):
        days = sorted({x['prior_day'] for x in payload['baselines'].values() if x.get('prior_day') and x['prior_day'] < payload['date']}, reverse=True)
        walls = {}
        for day in days[:2]:
            try:
                token = await self.auth(client)
                response = await client.get(self.cfg['base'] + self.cfg['path'], params={'src': 'chart_oi_close', 'sig_date': day.replace('-', '')}, headers={'Authorization':'Bearer ' + token})
                response.raise_for_status()
                if len(response.content) > 2_000_000:
                    continue
                docs = []
                for item in response.json().get('items', []):
                    doc = item.get('doc', item)
                    if isinstance(doc, str):
                        doc = json.loads(doc)
                    if doc.get('source') == 'chart_oi_close' and str(doc.get('sig_date')) == day.replace('-', '') and not doc.get('degraded'):
                        docs.append(doc)
                for doc in sorted(docs, key=lambda x:x.get('ts',0), reverse=True):
                    for row in doc.get('oi_levels', []):
                        sym, spot, expiry, supports, resistance = row
                        if expiry != payload['expiry'] or (sym, expiry) in walls or payload['baselines'].get(sym, {}).get('prior_day') != day:
                            continue
                        walls[(sym, expiry)] = dict(date=day, S1=supports[0][0] if supports else None, R1=resistance[0][0] if resistance else None)
            except Exception as exc:
                print('Prior walls unavailable:', type(exc).__name__, flush=True)
        return walls

    async def send(self, client, doc):
        token = await self.auth(client)
        response = await client.post(self.cfg['base'] + self.cfg['path'], content=json.dumps(doc, allow_nan=False), headers={'Authorization':'Bearer '+token, 'Content-Type':'application/json'})
        if response.status_code == 401:
            self.token = None
        response.raise_for_status()


async def receive_ticks(queue, state):
    while True:
        try:
            async with websockets.connect(STREAM, max_size=2_000_000, max_queue=32, ping_interval=20, open_timeout=15) as ws:
                state.connected = True
                state.generation += 1
                state.prices.clear()  # First print after a gap only establishes a baseline.
                await ws.send(json.dumps({'type':'subscribe', 'symbols':[], 'history':False}))
                async for message in ws:
                    update = json.loads(message)
                    now = time.time()
                    if update.get('type') == 'candle':
                        state.last_tick_at = now
                        try:
                            queue.put_nowait((update, now, state.generation))
                        except asyncio.QueueFull:
                            state.prices.clear()
                            raise RuntimeError('Tick consumer queue overflow')
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            state.connected = False
            state.generation += 1
            state.prices.clear()
            print('Tick stream reconnect:', type(exc).__name__, flush=True)
            await asyncio.sleep(3)


async def run():
    state, publisher, queue = State(), Publisher(), asyncio.Queue(maxsize=2048)
    state.start_day(datetime.now(IST).date().isoformat())
    ticker = asyncio.create_task(receive_ticks(queue, state))
    startup = time.time()
    pending_walls = None
    async with httpx.AsyncClient(timeout=12) as client:
        async def publish_loop():
            while True:
                for path in sorted((ROOT / 'outbox').glob('*.json'))[:100]:
                    try:
                        doc = json.loads(path.read_text())
                        await publisher.send(client, doc)
                        sent = ROOT / 'sent' / path.name
                        sent.parent.mkdir(exist_ok=True)
                        os.replace(path, sent)
                    except Exception as exc:
                        print('Pallas publish retry:', type(exc).__name__, flush=True)
                        break
                await asyncio.sleep(.5)
        publishing = asyncio.create_task(publish_loop())
        try:
            while True:
                now = time.time()
                day = datetime.fromtimestamp(now, IST).date().isoformat()
                if day != state.day:
                    state.start_day(day)
                    startup = now
                files = sorted((ROOT / 'input').glob(day.replace('-','') + '-????.json'))
                for path in files:
                    cut = path.stem[-4:]; cut = cut[:2] + ':' + cut[2:] + ':00'
                    if cut in state.processed:
                        continue
                    try:
                        if path.stat().st_size > 4_000_000:
                            raise ValueError('Input exceeds bounded size')
                        payload = json.loads(path.read_text())
                        assert payload['date'] == day and payload['cut'] == cut
                        for field in ('chains', 'chain_received', 'baselines', 'candles'):
                            assert isinstance(payload[field], dict)
                        assert finite(payload['exported_at'])
                    except (ValueError, KeyError, AssertionError) as exc:
                        state.input_error = f'Invalid input at {cut}: {type(exc).__name__}'
                        state.processed.add(cut)
                        print(state.input_error, flush=True)
                        continue
                    # Only current date. Recover durable input, never issue it as new live.
                    walls = await publisher.prior_walls(client, payload) if cut == '09:15:00' else None
                    state.ingest(payload, time.time(), walls, recovered=payload['exported_at'] < startup)
                try:
                    update, arrival, generation = await asyncio.wait_for(queue.get(), timeout=.5)
                    if state.connected and generation == state.generation:
                        state.early_tick(update, arrival, time.time())
                    # Drain a bounded burst; network producer remains independent.
                    for _ in range(127):
                        try:
                            update, arrival, generation = queue.get_nowait()
                        except asyncio.QueueEmpty:
                            break
                        if state.connected and generation == state.generation:
                            state.early_tick(update, arrival, time.time())
                except asyncio.TimeoutError:
                    pass
                if now - state.last_health >= 10:
                    clock_now = datetime.fromtimestamp(now, IST)
                    status = 'Market closed' if clock_now.weekday() >= 5 or not 555 <= clock_now.hour * 60 + clock_now.minute <= 930 else ('Waiting for opening capture' if not state.scanner else 'Monitoring existing feeds')
                    if state.input_error:
                        status = state.input_error
                    health = dict(date=day, status=status, checked_at=iso(now), tick_connected=state.connected,
                                  tick_received_at=iso(state.last_tick_at) if state.last_tick_at else None,
                                  last_cut=max(state.processed) if state.processed else None,
                                  events=len(state.events), early=len(state.early), engine=VERSION)
                    save(ROOT / 'health.json', health)
                    interval = 300 if status == 'Market closed' else 60
                    if status != state.last_status or now - state.last_published_health >= interval:
                        state.document('STATUS', dict(status=status, reason='No alerts issued from stale or unavailable inputs', health=health))
                        state.last_status = status
                        state.last_published_health = now
                    state.last_health = now
        finally:
            ticker.cancel(); publishing.cancel()


if __name__ == '__main__':
    asyncio.run(run())
