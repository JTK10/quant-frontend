"""Kairos 2.0 PAPER service. GET-only broker transport; no order API."""
import argparse
import asyncio
import base64
import json
import os
import time
from pathlib import Path

import httpx
from kairos2_engine import Trader, day, hm, epoch, positive, stamp

ROOT = Path(os.environ.get('KAIROS2_ROOT', '/home/ubuntu/kairos2'))
PALLAS = Path(os.environ.get('KAIROS2_PALLAS', '/home/ubuntu/pallas'))
OC = Path('/home/ubuntu/ocelot')
BROKER_BASE = 'https://api.upstox.com/v2'


def read_json(path, limit=2_000_000):
    if path.stat().st_size > limit:
        raise ValueError('JSON exceeds size bound')
    return json.loads(path.read_text())


def token():
    data = read_json(OC / 'tokens.json', 16000)
    if isinstance(data, list):
        data = data[0]
    if isinstance(data, dict):
        data = data.get('access_token') or data.get('token')
    if not isinstance(data, str) or not data:
        raise ValueError('Broker credential unavailable')
    return data


async def bounded_response(client, method, url, **kwargs):
    async with client.stream(method, url, **kwargs) as response:
        if response.status_code >= 400:
            # Do not include headers, response body, URL or credentials in errors.
            raise RuntimeError('HTTP ' + str(response.status_code))
        content = bytearray()
        async for chunk in response.aiter_bytes():
            content.extend(chunk)
            if len(content) > 2_000_000:
                raise ValueError('Response exceeds size bound')
        return json.loads(content) if content else {}


class Broker:
    def __init__(self, client):
        self.client = client
        self.cooldown = 0
        self.next_request = 0
        self.market = None
        self.market_day = None
        self.market_checked = 0
        self.contract_cache = {}

    async def get(self, path, params=None):
        if not (path.startswith('/market/timings/') or path in ('/option/contract', '/market-quote/quotes')):
            raise ValueError('Broker endpoint not permitted')
        now = time.time()
        if now < self.cooldown:
            raise RuntimeError('Broker retry cooldown')
        await asyncio.sleep(max(0, self.next_request - now))
        self.next_request = time.time() + .5  # At most two requests/second, no bursts.
        try:
            result = await bounded_response(self.client, 'GET', BROKER_BASE + path, params=params,
                headers={'Accept': 'application/json', 'Authorization': 'Bearer ' + token()})
            if result.get('status') != 'success':
                raise ValueError('Broker response not successful')
            return result['data']
        except RuntimeError as exc:
            if str(exc) == 'HTTP 429':
                self.cooldown = time.time() + 60
            raise

    async def timings(self, now):
        if self.market_day != day(now):
            self.market, self.market_day, self.market_checked = None, day(now), 0
            self.contract_cache.clear()
        if self.market is None and now - self.market_checked >= 300:
            self.market_checked = now
            rows = await self.get('/market/timings/' + day(now))
            sessions = [(epoch(r['start_time']), epoch(r['end_time'])) for r in rows
                        if r.get('exchange') == 'NSE']
            if len(sessions) > 1:
                raise ValueError('Multiple NSE sessions require review')
            self.market = sessions or []
        return self.market

    async def contract(self, event):
        universe = read_json(OC / 'universe.json')
        if universe.get('day') != event['Date']:
            raise ValueError('Underlying mapping is not current')
        underlying_key = universe['eq'][event['Symbol']]
        cache_key = (underlying_key, event['Expiry'])
        if cache_key not in self.contract_cache:
            self.contract_cache[cache_key] = await self.get('/option/contract',
                {'instrument_key': underlying_key, 'expiry_date': event['Expiry']})
        matches = [r for r in self.contract_cache[cache_key]
                   if r.get('underlying_key') == underlying_key and r.get('underlying_symbol') == event['Symbol']
                   and r.get('expiry') == event['Expiry'] and r.get('instrument_type') == event['Leg']
                   and float(r.get('strike_price', 0)) == event['Strike'] and r.get('segment') == 'NSE_FO']
        if len(matches) != 1:
            raise ValueError('Exact option contract not available')
        r = matches[0]
        return dict(underlying=event['Symbol'], key=r['instrument_key'], name=r['trading_symbol'],
                    expiry=r['expiry'], leg=r['instrument_type'], strike=float(r['strike_price']),
                    lot_size=r['lot_size'], minimum_lot=r.get('minimum_lot', r['lot_size']))

    async def quote(self, key):
        rows = await self.get('/market-quote/quotes', {'instrument_key': key})
        matches = [r for r in rows.values() if r.get('instrument_token') == key]
        if len(matches) != 1:
            raise ValueError('Quote instrument mismatch')
        r = matches[0]
        received = time.time()
        return dict(key=key, quote_at=epoch(r['timestamp']), received_at=received,
                    bids=r.get('depth', {}).get('buy', []), asks=r.get('depth', {}).get('sell', []),
                    last_trade_at=epoch(r['last_trade_time']) if r.get('last_trade_time') else None)


class Publisher:
    def __init__(self, client):
        self.client = client
        self.cfg = read_json(OC / 'ords.json', 32000)
        self.access, self.expires = None, 0

    async def headers(self):
        if not self.access or time.time() >= self.expires:
            basic = base64.b64encode((self.cfg['client_id'] + ':' + self.cfg['client_secret']).encode()).decode()
            r = await bounded_response(self.client, 'POST', self.cfg['base'] + '/oauth/token',
                headers={'Authorization': 'Basic ' + basic}, data={'grant_type': 'client_credentials'})
            self.access, self.expires = r['access_token'], time.time() + int(r.get('expires_in', 3600)) - 60
        return {'Authorization': 'Bearer ' + self.access, 'Content-Type': 'application/json'}

    async def read(self, date):
        rows = await bounded_response(self.client, 'GET', self.cfg['base'] + self.cfg['path'],
            params={'src': 'kairos2', 'sig_date': date.replace('-', '')}, headers=await self.headers())
        docs = []
        for item in rows.get('items', []):
            value = item.get('doc', item)
            doc = json.loads(value) if isinstance(value, str) else value
            if doc.get('source') == 'kairos2' and doc.get('sig_date') == date.replace('-', ''):
                docs.append(doc)
        return docs

    async def send(self, doc):
        # Verify an uncertain/previous post before retry; do not duplicate entries.
        existing = await self.read(doc['date'])
        if any(d.get('Doc_ID') == doc['Doc_ID'] for d in existing):
            return
        await bounded_response(self.client, 'POST', self.cfg['base'] + self.cfg['path'],
            headers=await self.headers(), content=json.dumps(doc, allow_nan=False))


def events(date):
    rows = []
    for path in sorted((PALLAS / 'events' / date).glob('CONFIRMED_CLOSE_*.json'))[:300]:
        try:
            value = read_json(path, 32000)
            if value.get('Event_Type') == 'CONFIRMED_CLOSE':
                rows.append(value)
        except (OSError, ValueError, TypeError):
            continue
    return rows


async def monitor_position(trader, broker, sessions, now, next_quote):
    """Monitor exits within the verified session; never fabricate a closed-market fill."""
    if not sessions or not sessions[0][0] <= now < sessions[0][1]:
        trader.state['status'] = 'Exit pending: NSE closed; open paper position retained'
        return next_quote
    if now < next_quote:
        return next_quote
    q = await broker.quote(trader.state['position']['opt_key'])
    trader.mark(q, time.time())
    return time.time() + 5


async def run():
    import fcntl
    ROOT.mkdir(parents=True, exist_ok=True)
    lock = (ROOT / 'service.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)  # Never run two paper workers.
    trader = Trader(ROOT, time.time())
    timeout = httpx.Timeout(8., connect=5.)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        broker, publisher = Broker(client), Publisher(client)
        publishing_error = None

        async def publishing():
            nonlocal publishing_error
            while True:
                if trader.state['pending']:
                    doc = trader.state['pending'][0]
                    try:
                        await publisher.send(doc)
                        trader.state['pending'] = [d for d in trader.state['pending'] if d['Doc_ID'] != doc['Doc_ID']]
                        trader.save()
                        publishing_error = None
                    except (httpx.HTTPError, RuntimeError, OSError, ValueError, KeyError) as exc:
                        publishing_error = type(exc).__name__
                        print('Kairos2 publish retry:', publishing_error, flush=True)
                        await asyncio.sleep(15)
                await asyncio.sleep(1)

        publishing_task = asyncio.create_task(publishing())
        next_quote = 0
        try:
            while True:
                now, error = time.time(), None
                trader.roll(now)
                try:
                    sessions = await broker.timings(now)
                    now = time.time()
                    if trader.state['position']:
                        next_quote = await monitor_position(trader, broker, sessions, now, next_quote)
                    elif sessions:
                        opening, closing = sessions[0]
                        if opening <= now < min(closing, epoch(day(now) + 'T11:30:00+05:30')):
                            if not trader.state['taken']:
                                choices = trader.candidates(events(day(now)), now, opening, closing)
                                trader.state['status'] = 'Waiting for confirmed AI >=70 signal'
                                for event in choices if now >= next_quote else []:
                                    contract = await broker.contract(event)
                                    q = await broker.quote(contract['key'])
                                    entered = trader.enter(event, contract, q, time.time(), opening, closing)
                                    next_quote = time.time() + 5
                                    if entered:
                                        break
                                    if event['Event_ID'] not in trader.state['seen']:
                                        break  # Wait for the first eligible event's fresh depth.
                        elif now < opening:
                            trader.state['status'] = 'Market closed; starts at ' + hm(opening)[:5] + ' IST'
                        else:
                            trader.state['status'] = 'Daily paper trade complete' if trader.state['taken'] else 'No qualifying trade this session'
                    elif sessions is None:
                        trader.state['status'] = 'Waiting for verified market schedule'
                    else:
                        trader.state['status'] = 'NSE holiday; no entries'
                except (httpx.HTTPError, RuntimeError, OSError, KeyError, ValueError, TypeError) as exc:
                    error = type(exc).__name__
                    trader.state['status'] = 'Option data unavailable; position retained' if trader.state['position'] else 'Waiting for required market data'
                    next_quote = time.time() + 5
                    # Exception type only: broker/credential payloads remain private.
                    print('Kairos2 data retry:', error, flush=True)
                trader.health(time.time(), extra=dict(data_error=error, publish_error=publishing_error,
                    pallas_health_available=(PALLAS / 'health.json').is_file()))
                await asyncio.sleep(1)
        finally:
            publishing_task.cancel()
            trader.save()


async def probe():
    """Read-only broker and ORDS connectivity, no state or trades generated."""
    async with httpx.AsyncClient(timeout=8., follow_redirects=False) as client:
        broker, publisher = Broker(client), Publisher(client)
        now = time.time()
        timings = await broker.timings(now)
        universe = read_json(OC / 'universe.json')
        key = universe['eq'].get('RELIANCE')
        if not key:
            raise ValueError('Reference underlying unavailable')
        rows = await broker.get('/option/contract', {'instrument_key': key})
        matching = [r for r in rows if r.get('expiry') >= day(now) and r.get('instrument_type') == 'CE'
                    and r.get('lot_size', 0) > 0 and r.get('underlying_symbol') == 'RELIANCE']
        if not matching:
            raise ValueError('No verifiable current contracts')
        q = await broker.quote(matching[0]['instrument_key'])
        docs = await publisher.read(day(now))
        print(json.dumps(dict(date=day(now), nse_sessions=timings, verified_contracts=len(matching),
            lot_size=matching[0]['lot_size'], quote_timestamp=stamp(q['quote_at']),
            quote_age_seconds=round(time.time() - q['quote_at'], 1), ords_read=True,
            existing_kairos2_documents=len(docs), market_open=bool(timings and timings[0][0] <= now < timings[0][1]))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true')
    args = parser.parse_args()
    asyncio.run(probe() if args.probe else run())
