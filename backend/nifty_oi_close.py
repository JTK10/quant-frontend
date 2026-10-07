"""Small independent Nifty after-close capture; never opens the scanner DB."""
import argparse
import base64
import hashlib
import json
import math
import os
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')
KEY = 'NSE_INDEX|Nifty 50'
SOURCE = 'nifty_oi_close'


def request_json(url, headers, body=None):
    headers = {'User-Agent':'Quant-Radar-Nifty-Close/1.0', **headers}
    try:
        with urlopen(Request(url, headers=headers, data=body), timeout=20) as response:
            payload = response.read()
            return json.loads(payload) if payload.strip() else {}
    except HTTPError as exc:
        code = ''
        try:
            code = ','.join(str(e.get('error_code','')) for e in json.loads(exc.read()).get('errors', []))
        except Exception:
            pass
        raise RuntimeError(f'API HTTP {exc.code} {code}') from None
    except (URLError, TimeoutError):
        raise RuntimeError('API transport unavailable') from None


def read_token(file):
    value = json.loads(Path(file).read_text())
    if isinstance(value, list):
        value = value[0]
    if isinstance(value, dict):
        value = value.get('access_token') or value.get('token')
    if not isinstance(value, str) or not value:
        raise ValueError('Broker credential unavailable')
    return value


def rank_walls(chain, spot):
    walls = {}
    for leg, field in [('PE', 'put_options'), ('CE', 'call_options')]:
        candidates = {}
        for row in chain:
            strike = float(row['strike_price'])
            if not math.isfinite(strike) or not (0 <= (spot-strike if leg == 'PE' else strike-spot) <= 200):
                continue
            market = (row.get(field) or {}).get('market_data') or {}
            oi, prev = market.get('oi'), market.get('prev_oi')
            if not isinstance(oi, (int, float)) or not math.isfinite(oi) or oi <= 0:
                continue
            delta = oi-prev if isinstance(prev, (int, float)) and math.isfinite(prev) and prev > 0 else None
            candidates[strike] = [strike, oi, delta]
        walls[leg] = sorted(candidates.values(), key=lambda w: (-w[1], abs(w[0]-spot), w[0]))[:2]
    if len(walls['PE']) < 2 or len(walls['CE']) < 2:
        raise ValueError('Closing option-chain coverage incomplete')
    return walls['PE'], walls['CE']


def verified_close(candles, day, end_epoch):
    today = [b for b in candles if b[0].startswith(day)]
    if not today:
        raise ValueError('No index candles for this trading date')
    last = max(today, key=lambda b: b[0])
    stamp = datetime.fromisoformat(last[0]).timestamp()
    if not end_epoch-300 <= stamp < end_epoch:
        raise ValueError('Closing index candle is not available yet')
    spot = float(last[4])
    if not math.isfinite(spot) or spot <= 0:
        raise ValueError('Invalid closing index price')
    return spot


def closing_boundaries(timings):
    """Cash candles end at NSE close; option capture waits for both sessions."""
    cash = [r['end_time']/1000 for r in timings if r.get('exchange') == 'NSE']
    futures = [r['end_time']/1000 for r in timings if r.get('exchange') == 'NFO']
    return max(cash, default=0), max(cash+futures, default=0)


def make_doc(day, cut, levels, provenance):
    digest = hashlib.sha256(json.dumps([day, levels], sort_keys=True).encode()).hexdigest()
    return {'source':SOURCE, 'cap':'NIFTY_OI_CLOSE', 'name':'NIFTY 50',
            'side':'NEUTRAL', 'ts':time.time(), 'sig_date':day.replace('-', ''),
            'date':day, 'cut':cut, 'time':cut+':00', 'degraded':False,
            'oi_levels':levels, 'capture_id':digest, 'provenance':provenance}


def publish(doc, config_file):
    cfg = json.loads(Path(config_file).read_text())
    basic = base64.b64encode(f"{cfg['client_id']}:{cfg['client_secret']}".encode()).decode()
    auth = request_json(cfg['base']+'/oauth/token',
                        {'Authorization':'Basic '+basic, 'Content-Type':'application/x-www-form-urlencoded'},
                        b'grant_type=client_credentials')['access_token']
    headers = {'Authorization':'Bearer '+auth, 'Content-Type':'application/json'}
    endpoint = cfg['base']+cfg['path']
    existing = request_json(endpoint+'?'+urlencode({'src':SOURCE, 'sig_date':doc['sig_date']}), headers)
    for item in existing.get('items', []):
        other = item.get('doc', item)
        if isinstance(other, str):
            other = json.loads(other)
        if other.get('capture_id') == doc['capture_id']:
            return 'already published'
    request_json(endpoint, headers, json.dumps(doc, allow_nan=False).encode())
    # Verify through the same read endpoint used by the frontend.
    check = request_json(endpoint+'?'+urlencode({'src':SOURCE, 'sig_date':doc['sig_date']}), headers)
    for item in check.get('items', []):
        other = item.get('doc', item)
        if isinstance(other, str):
            other = json.loads(other)
        if other.get('capture_id') == doc['capture_id']:
            return 'published and read-back verified'
    raise RuntimeError('Closing snapshot read-back verification failed')


def main(args):
    now = datetime.now(IST)
    day = now.date().isoformat()
    store = Path(args.output)
    saved = store/(day+'.json')
    if not args.probe and store.exists():
        # Recover a saved snapshot whose publication was interrupted, retaining
        # its actual trading date instead of relabelling it as today.
        for pending in sorted(store.glob('*.json'))[-4:]:
            state = json.loads(pending.read_text())
            if pending != saved and not state.get('published'):
                publish(state['doc'], args.config)
                state['published'] = True
                pending.write_text(json.dumps(state))
    if not args.probe and saved.exists():
        state = json.loads(saved.read_text())
        if state.get('published'):
            print(json.dumps({'date':day, 'status':'already complete'}))
            return
        status = publish(state['doc'], args.config)
        state['published'] = True
        saved.write_text(json.dumps(state))
        print(json.dumps({'date':day, 'status':status}))
        return
    token = read_token(args.token_file)
    headers = {'Authorization':'Bearer '+token, 'Accept':'application/json'}
    def get(route, params=None):
        try:
            return request_json('https://api.upstox.com'+route+('?' + urlencode(params) if params else ''), headers)
        except RuntimeError as exc:
            raise RuntimeError(f'Broker {route}: {exc}') from None
    timings = get('/v2/market/timings/'+day).get('data', [])
    cash = [r for r in timings if r.get('exchange') == 'NSE']
    futures = [r for r in timings if r.get('exchange') == 'NFO']
    if not args.probe and (not cash or not futures):
        print(json.dumps({'date':day, 'status':'market holiday; no capture'}))
        return
    cash_close, capture_close = closing_boundaries(timings)
    if not args.probe and now.timestamp() < capture_close+300:
        print(json.dumps({'date':day, 'status':'session has not closed; no capture'}))
        return
    contracts = get('/v2/option/contract', {'instrument_key':KEY}).get('data', [])
    # Tomorrow cannot use contracts expiring today. Save the nearest two future
    # expiries, with the date/expiry always explicit.
    expiries = sorted({r['expiry'] for r in contracts if r.get('expiry', '') > day})[:2]
    if len(expiries) < 2:
        raise ValueError('Future Nifty expiries unavailable')
    candles = get('/v3/historical-candle/intraday/'+quote(KEY, safe='')+'/minutes/5').get('data', {}).get('candles', [])
    if args.probe:
        spot = max(candles, key=lambda b:b[0])[4] if candles else None
        if spot is None:
            # Probe is read-only and may run on a holiday. Its price is not
            # dated/published as today's data.
            chain = get('/v2/option/chain', {'instrument_key':KEY, 'expiry_date':expiries[0]}).get('data', [])
            spot = chain[0]['underlying_spot_price'] if chain else None
    else:
        spot = verified_close(candles, day, cash_close)
    if not isinstance(spot, (int, float)) or not math.isfinite(spot) or spot <= 0:
        raise ValueError('Closing spot unavailable')
    levels, counts, raw_chains = [], [], {}
    for expiry in expiries:
        chain = get('/v2/option/chain', {'instrument_key':KEY, 'expiry_date':expiry}).get('data', [])
        if any(r.get('expiry') != expiry or r.get('underlying_key') != KEY for r in chain):
            raise ValueError('Option-chain expiry or underlying mismatch')
        support, resistance = rank_walls(chain, spot)
        levels.append(['NIFTY 50', spot, expiry, support, resistance])
        counts.append(len(chain))
        raw_chains[expiry] = chain
    if args.probe:
        print(json.dumps({'status':'read-only broker probe passed', 'date':day, 'market_open_date':bool(cash and futures), 'expiries':expiries, 'chain_rows':counts, 'published':False}))
        return
    doc = make_doc(day, now.strftime('%H:%M'), levels, 'after-close option-chain capture; index closing candle verified')
    store.mkdir(parents=True, exist_ok=True, mode=0o700)
    state = {'doc':doc, 'chain_by_expiry':raw_chains, 'published':False}
    temporary = saved.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, allow_nan=False))
    os.chmod(temporary, 0o600)
    temporary.replace(saved)
    status = publish(doc, args.config)
    state['published'] = True
    temporary.write_text(json.dumps(state, allow_nan=False))
    os.chmod(temporary, 0o600)
    temporary.replace(saved)
    print(json.dumps({'date':day, 'status':status, 'expiries':expiries, 'chain_rows':counts}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--token-file', default='/home/ubuntu/ocelot/tokens.json')
    parser.add_argument('--config', default='/home/ubuntu/ocelot/ords.json')
    parser.add_argument('--output', default='/home/ubuntu/nifty-oi-close/data')
    parser.add_argument('--probe', action='store_true')
    try:
        main(parser.parse_args())
    except Exception as exc:
        # Never include API bodies, credentials, request URLs, or traceback locals.
        print(json.dumps({'status':'failed', 'error':type(exc).__name__, 'reason':str(exc) if isinstance(exc, (ValueError, RuntimeError)) else 'capture or publishing unavailable'}))
        raise SystemExit(1)
