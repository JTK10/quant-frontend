"""Isolated Aurum consumer using retained files, one Nifty stream and publication.

No broker data requests, order execution, live DuckDB readers or producer changes.
"""
import json
import asyncio
import math
import os
import time
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from aurum_engine import ENGINE, evaluate, number

IST = ZoneInfo('Asia/Kolkata')
ROOT = Path(os.environ.get('AURUM_ROOT', '/home/ubuntu/aurum'))
INPUT = Path(os.environ.get('AURUM_INPUT', '/home/ubuntu/pallas/input'))
CONTEXT = Path(os.environ.get('AURUM_CONTEXT', '/home/ubuntu/aurum/context'))


def stamp(now):
    return datetime.fromtimestamp(now, IST).isoformat()


def epoch(day, hm):
    return datetime.fromisoformat(day+'T'+hm[:5]+':00+05:30').timestamp()


def read(path, limit=4_000_000):
    if path.stat().st_size > limit:
        raise ValueError('Input exceeds bounded size')
    return json.loads(path.read_text(encoding='utf-8'))


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    os.replace(temp, path)


def validate_capture(p, day, now):
    cut = str(p.get('cut', ''))[:5]
    if p.get('date') != day or len(cut) != 5 or not '09:20' <= cut <= '15:30':
        raise ValueError('Wrong date or capture cut')
    instant = epoch(day, cut)
    exported = p.get('exported_at')
    if not number(exported) or not instant <= exported <= instant+180 or exported > now+2:
        raise ValueError('Invalid capture receipt boundary')
    for field in ('candles', 'chains', 'chain_received', 'baselines'):
        if not isinstance(p.get(field), dict):
            raise ValueError('Invalid capture '+field)
    expected = datetime.fromtimestamp(instant-300, IST).strftime('%H:%M')
    good = {}
    for symbol, b in p['candles'].items():
        if not isinstance(b, dict) or str(b.get('time'))[:5] != expected:
            continue
        if any(not number(b.get(k)) for k in ('open', 'high', 'low', 'close', 'volume')):
            continue
        if b['volume'] < 0 or not 0 < b['low'] <= min(b['open'], b['close']) <= max(b['open'], b['close']) <= b['high']:
            continue
        good[symbol] = dict(hm=expected, o=b['open'], h=b['high'], l=b['low'], c=b['close'], v=b['volume'])
    return cut, instant, good


def validate_context(aux, day, cut, now):
    if aux.get('date') != day or str(aux.get('cut', ''))[:5] != cut:
        raise ValueError('Context date/cut mismatch')
    nifty = aux.get('nifty')
    expected = datetime.fromtimestamp(epoch(day, cut)-300, IST).strftime('%H:%M')
    if not isinstance(nifty, dict) or nifty.get('bar_start') != expected:
        raise ValueError('Exact completed Nifty candle unavailable')
    observed = nifty.get('available_at')
    if observed is not None and (not number(observed) or observed > now+2 or observed < epoch(day, cut)):
        raise ValueError('Nifty receipt timestamp invalid')
    return nifty


class Worker:
    def __init__(self, root=ROOT, startup=None, calendar=None):
        self.root = Path(root)
        self.startup = time.time() if startup is None else startup
        self.history = read(self.root/'history.json', 16_000_000)
        if self.history.get('schema_version') != 1:
            raise ValueError('Cash-history seed schema unavailable')
        self.state = None
        self.error = None
        self.calendar = calendar
        self.publication = {'status':'PENDING'}

    def start(self, day):
        self.path = self.root/'state'/f'{day}.json'
        self.state = read(self.path, 12_000_000) if self.path.exists() else dict(date=day, bars={}, ingested=[], evaluated=[], signals=[], last_cut=None, coverage={})
        if self.state.get('date') != day:
            raise ValueError('Stored state date mismatch')
        self.error = None

    def persist(self):
        save(self.path, self.state)

    def ingest(self, p, aux, now):
        day = self.state['date']
        cut, instant, good = validate_capture(p, day, now)
        self.hydrate_prior_baselines(p['baselines'], day)
        if cut not in self.state['ingested']:
            for symbol, bar in good.items():
                existing = {b['hm']: b for b in self.state['bars'].get(symbol, [])}
                # First completed observation remains immutable across retries.
                existing.setdefault(bar['hm'], bar)
                self.state['bars'][symbol] = sorted(existing.values(), key=lambda b:b['hm'])
            self.state['ingested'].append(cut)
            self.state['last_cut'] = max(cut, self.state['last_cut'] or cut)
            self.persist()
        if not '09:35' <= cut <= '10:25' or cut in self.state['evaluated']:
            if cut == '15:30':
                self.advance_history(day)
            return
        if p.get('degraded'):
            raise ValueError('Degraded upstream chain capture; cash retained separately')
        nifty = validate_context(aux, day, cut, now)
        previous_signal = {s['symbol'] for s in self.state['signals']}
        coverage = dict(cash=len(good), evaluated=0, already_qualified=0,
                        missing_history=0, missing_chain=0, missing_cash=0)
        for symbol in sorted(good):
            if symbol in previous_signal:
                coverage['already_qualified'] += 1
                continue
            history = [h for h in self.history.get('symbols', {}).get(symbol, []) if h['date'] < day]
            baseline = p['baselines'].get(symbol, {})
            if (not history or history[-1]['date'] != baseline.get('prior_day') or
                (self.calendar is not None and not self.calendar.prior_date_valid(baseline.get('prior_day'), day))):
                coverage['missing_history'] += 1
                continue
            received = p['chain_received'].get(symbol)
            if symbol not in p['chains'] or not number(received) or not instant-5 <= received <= p['exported_at']:
                coverage['missing_chain'] += 1
                continue
            try:
                passed, f = evaluate(self.state['bars'][symbol], history, p['chains'][symbol], nifty)
            except ValueError as exc:
                key = 'missing_history' if any(x in str(exc) for x in ('history', 'sessions', 'volume', 'context')) else 'missing_cash'
                coverage[key] += 1
                continue
            coverage['evaluated'] += 1
            if not passed:
                continue
            rusty = (aux.get('rusty') or {}).get(symbol)
            matched = isinstance(rusty, dict) and all(number(rusty.get(k)) for k in ('ce_pct', 'pe_pct', 'oi_bias'))
            recovered = p['exported_at'] < self.startup or now-instant > 180 or bool(nifty.get('recovered'))
            self.state['signals'].append(dict(id=f'aurum-v1|{day}|{symbol}', symbol=symbol, side=f['direction'],
                bar_start=f['time_ist'], signal_time=cut, entry_time=cut, entry=None,
                reference_price=f['Close'], issued_at=stamp(now), recovered=recovered,
                ce_pct=rusty['ce_pct'] if matched else None, pe_pct=rusty['pe_pct'] if matched else None,
                oi_bias=rusty['oi_bias'] if matched else None,
                view=(rusty.get('flow_label') or rusty.get('view') or 'Unclassified flow') if matched else 'Rusty snapshot unavailable',
                flow_type=rusty.get('flow_type') if matched else None,
                rusty_status='exact_snapshot' if matched else 'unavailable', rusty_cut=cut if matched else None,
                bar_rvol=f['rvol_5m'], cum_rvol=f['rvol_cum'], pullback_confirmed=f['pullback_confirmed'],
                oi_dominance=f['oi_dom_contemp'], wall_breached=f['wall_breached'],
                ce_wall=f['ce_wall_strike'], pe_wall=f['pe_wall_strike']))
        self.state['evaluated'].append(cut)
        self.state['coverage'][cut] = coverage
        self.error = None
        self.persist()

    def hydrate_prior_baselines(self, baselines, day):
        """Use the existing next-session daily exporter, never partial-day extrema.

        Ocelot stops cash exports before the final session bar. Its following
        session's explicit daily PDH/PDL/PDC provides the missing full-day
        summary, while our earlier saved morning bars provide RVOL volumes.
        Holiday gaps resolve through the producer's actual prior_day value.
        """
        states = {}
        changed = False
        expected = [f'{m//60:02}:{m%60:02}' for m in range(555, 621, 5)]
        for symbol, baseline in baselines.items():
            prior_day = baseline.get('prior_day')
            if not isinstance(prior_day, str) or not prior_day < day:
                continue
            days = self.history.setdefault('symbols', {}).setdefault(symbol, [])
            existing = next((d for d in days if d['date'] == prior_day), None)
            if existing and existing.get('complete'):
                continue
            if any(not number(baseline.get(k)) for k in ('pdh', 'pdl', 'pdc')) or not 0 < baseline['pdl'] <= baseline['pdc'] <= baseline['pdh']:
                continue
            if prior_day not in states:
                path = self.root/'state'/f'{prior_day}.json'
                states[prior_day] = read(path, 12_000_000) if path.exists() else {}
            bars = [b for b in states[prior_day].get('bars', {}).get(symbol, []) if b['hm'] <= '10:20']
            if [b['hm'] for b in bars] != expected:
                continue
            cv = 0
            slots = []
            for b in bars:
                cv += b['v']
                if b['hm'] >= '09:30':
                    slots.append([b['hm'], b['v'], cv])
            record = dict(date=prior_day, bars=slots, high=baseline['pdh'], low=baseline['pdl'], close=baseline['pdc'],
                          complete=True, daily_source='existing_ocelot_next_session_daily_baseline',
                          volume_source='saved_completed_pallas_morning_cash', received_on=day)
            days[:] = sorted([d for d in days if d['date'] != prior_day]+[record], key=lambda d:d['date'])[-40:]
            changed = True
        if changed:
            self.history['through'] = max(d['date'] for days in self.history['symbols'].values() for d in days)
            save(self.root/'history.json', self.history)

    def advance_history(self, day):
        """Keep missing bars explicit; never treat partial close as full daily context."""
        expected = [f'{m//60:02}:{m%60:02}' for m in range(555, 926, 5)]
        updated = 0
        partial = 0
        for symbol, bars in self.state['bars'].items():
            if not bars:
                continue
            complete = [b['hm'] for b in bars] == expected
            cv = 0
            slots = []
            for b in bars:
                cv += b['v']
                if '09:30' <= b['hm'] <= '10:20':
                    slots.append([b['hm'], b['v'], cv])
            record = dict(date=day, bars=slots, high=max(b['h'] for b in bars), low=min(b['l'] for b in bars),
                          close=bars[-1]['c'], complete=complete)
            days = self.history.setdefault('symbols', {}).setdefault(symbol, [])
            previous = next((d for d in days if d['date'] == day), None)
            if previous is not None and previous.get('complete'):
                continue
            days[:] = sorted([d for d in days if d['date'] != day]+[record], key=lambda d:d['date'])[-40:]
            updated += int(complete)
            partial += int(not complete)
        self.history['through'] = day
        save(self.root/'history.json', self.history)
        self.state['history_rollover'] = dict(date=day, complete=updated, partial=partial)
        self.persist()

    def document(self, now):
        local = datetime.fromtimestamp(now, IST)
        regular = self.calendar.regular_day(local.date()) if self.calendar is not None else local.weekday() < 5
        closed = not regular or not '09:14' <= local.strftime('%H:%M') <= '10:30'
        minute = local.hour*60+local.minute
        overdue = []
        if regular and minute >= 578:
            latest_expected = min(625, ((minute-3)//5)*5)
            overdue = [f'{m//60:02}:{m%60:02}' for m in range(575, latest_expected+1, 5)
                       if f'{m//60:02}:{m%60:02}' not in self.state['evaluated']]
        error = self.error or ('Missing overdue completed cuts: '+', '.join(overdue) if overdue else None)
        status = 'ERROR' if error else 'CLOSED' if closed else 'READY' if self.state['evaluated'] else 'PENDING'
        latest = max(self.state['coverage'], default=None)
        coverage = self.state['coverage'].get(latest, {})
        covered = coverage.get('evaluated', 0)+coverage.get('already_qualified', 0)
        if not error and not closed and coverage.get('cash', 0) and covered < .9*coverage['cash']:
            status = 'DEGRADED'
        return dict(source='aurum', engine=ENGINE, date=self.state['date'], mode='live', status=status,
            asof=stamp(now), stale=bool(error), last_cut=self.state['last_cut'],
            signals=self.state['signals'], coverage=self.state['coverage'], error=error,
            missing_overdue_cuts=overdue,
            publication=self.publication,
            available_dates=[], price_note='Completed-candle references; no broker fills or orders')

    def output(self, now):
        doc = self.document(now)
        save(self.root/'snapshots'/f'{self.state["date"]}.json', doc)
        save(self.root/'health.json', {k:v for k,v in doc.items() if k not in ('signals', 'coverage', 'available_dates')})


async def run():
    import fcntl
    ROOT.mkdir(parents=True, exist_ok=True)
    lock = open(ROOT/'worker.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    from aurum_io import NiftyCache, Publisher, build_context
    sys.path.insert(0, '/home/ubuntu/market-calendar')
    import nse_calendar
    worker = Worker(calendar=nse_calendar)
    nifty_cache = NiftyCache(ROOT)
    publisher = Publisher(Path(os.environ.get('AURUM_ORDS_CONFIG', '/home/ubuntu/ocelot/ords.json')), ROOT)
    rusty_input = Path(os.environ.get('AURUM_RUSTY_INPUT', '/home/ubuntu/lupus/input'))
    stream_url = os.environ.get('AURUM_NIFTY_STREAM', 'wss://140.238.241.210.sslip.io')

    async def stream():
        import websockets
        delay = 5
        while True:
            local = datetime.now(IST)
            if not nse_calendar.regular_day(local.date()) or not '09:14' <= local.strftime('%H:%M') <= '10:30':
                await asyncio.sleep(30)
                continue
            try:
                connect = dict(max_size=400_000, max_queue=4, open_timeout=10, ping_interval=30, ping_timeout=20)
                if stream_url == 'wss://140.238.241.210.sslip.io':
                    # Existing verified VM1 endpoint, preserving TLS hostname
                    # verification even when VM2's DNS resolver is unavailable.
                    connect.update(host='140.238.241.210', server_hostname='140.238.241.210.sslip.io')
                async with websockets.connect(stream_url, **connect) as ws:
                    await ws.send(json.dumps(nifty_cache.subscription()))
                    delay = 5
                    while True:
                        local = datetime.now(IST)
                        if not nse_calendar.regular_day(local.date()) or not '09:14' <= local.strftime('%H:%M') <= '10:30':
                            break
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=30)
                        except TimeoutError:
                            continue
                        if isinstance(raw, str) and len(raw) <= 400_000:
                            nifty_cache.ingest_stream(json.loads(raw), time.time())
            except Exception as exc:
                print('Aurum Nifty stream unavailable:', type(exc).__name__, flush=True)
            await asyncio.sleep(delay)
            delay = min(60, delay*2)

    task = asyncio.create_task(stream())
    async def publish():
        while True:
            try:
                worker.publication = await asyncio.to_thread(publisher.flush_one, time.time())
            except Exception as exc:
                worker.publication = dict(status='ERROR', error=type(exc).__name__)
            await asyncio.sleep(15)
    publishing = asyncio.create_task(publish())
    failures = {}
    last_output = 0
    last_health = None
    while True:
        now = time.time()
        day = datetime.fromtimestamp(now, IST).date().isoformat()
        if worker.state is None or worker.state['date'] != day:
            worker.history = read(ROOT/'history.json', 16_000_000)
            worker.start(day)
            failures = {}
        for path in sorted(INPUT.glob(day.replace('-', '')+'-????.json')):
            cut = path.stem[-4:-2]+':'+path.stem[-2:]
            if not '09:20' <= cut <= '10:25' or not nse_calendar.regular_day(day):
                continue
            if cut in worker.state['ingested'] and (not '09:35' <= cut <= '10:25' or cut in worker.state['evaluated']):
                continue
            context = CONTEXT/path.name
            nifty_context = nifty_cache.context(day, cut) if '09:35' <= cut <= '10:25' else None
            key = (path.stat().st_mtime_ns, context.stat().st_mtime_ns if context.exists() else None,
                   nifty_context.get('available_at') if nifty_context else None)
            if failures.get(cut) == key:
                continue
            try:
                payload = read(path)
                aux = read(context, 512_000) if context.exists() else build_context(rusty_input, nifty_cache, day, cut)
                worker.ingest(payload, aux, now)
                failures.pop(cut, None)
            except (ValueError, KeyError, OSError, TypeError) as exc:
                worker.error = f'{cut}: {str(exc)[:140]}'
                failures[cut] = key
                print('Aurum input unavailable:', worker.error, flush=True)
        if now-last_output >= 60:
            worker.output(now)
            document = worker.document(now)
            latest = max(worker.state['evaluated'], default=None)
            if latest:
                publisher.enqueue_snapshot(document, latest)
            local = datetime.fromtimestamp(now, IST)
            morning = nse_calendar.regular_day(day) and '09:14' <= local.strftime('%H:%M') <= '10:30'
            health_key = (day, document['status'], int(now//900) if morning else 'outside-window')
            if health_key != last_health:
                publisher.enqueue_health(document, now)
                last_health = health_key
            last_output = now
        await asyncio.sleep(15)


if __name__ == '__main__':
    asyncio.run(run())
