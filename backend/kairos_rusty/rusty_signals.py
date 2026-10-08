"""Native Rusty snapshots to causal option-entry candidates. No AI score."""
import hashlib
import math
import re
from datetime import date, timedelta

from rusty_engine import day, epoch, hm, integer, positive, stamp

MIN_DTE = 7
FLOWS = {
    'BULL': {'CE_DOWN_PE_UP', 'PE_OI_BUILD', 'CE_OI_SHARP_DROP', 'CE_OI_SURGE'},
    'BEAR': {'CE_UP_PE_DOWN', 'CE_OI_BUILD', 'PE_OI_SHARP_DROP', 'BOTH_LEGS_OI_WEAK'},
}


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def confirmed_row(row, side, cut):
    """Require the published label and its exact, completed cash candle."""
    try:
        if (side not in FLOWS or row.get('entry_confirmed') is not True
                or row.get('brk') is not True or row.get('conviction') != 'HIGH'
                or row.get('flow_type') not in FLOWS[side]):
            return False
        op, hi, lo, cl = (row[k] for k in ('c_open', 'c_high', 'c_low', 'c_close'))
        if not all(positive(v) for v in (op, hi, lo, cl)) or not lo <= min(op, cl) <= max(op, cl) <= hi or hi <= lo:
            return False
        body = abs(cl - op) / (hi - lo) * 100
        upper = (hi - max(op, cl)) / (hi - lo) * 100
        lower = (min(op, cl) - lo) / (hi - lo) * 100
        if body < 70 - 1e-7 or max(upper, lower) > 15 + 1e-7 or row.get('c_time') != hm(cut - 300)[:5]:
            return False
        if not all(finite(row.get(k)) for k in ('ce_pct', 'pe_pct', 'rusty_pct', 'mv')):
            return False
        if not integer(row.get('rusty_rank')) or abs(abs(row['rusty_pct']) - max(abs(row['ce_pct']), abs(row['pe_pct']))) > .05:
            return False
        return cl > op and row['mv'] > 0 if side == 'BULL' else cl < op and row['mv'] < 0
    except (KeyError, TypeError, ValueError, OverflowError):
        return False


def snapshot_events(docs, now, boot_at):
    """Use only the newest current-day cut; never revive an older good board."""
    snapshots = []
    for doc in docs:
        try:
            if (not isinstance(doc, dict) or doc.get('source') != 'rusty'
                    or doc.get('date') != day(now) or doc.get('sig_date') != day(now).replace('-', '')
                    or doc.get('degraded') or doc.get('replay') or doc.get('Recovered')
                    or not isinstance(doc.get('cut'), str)
                    or not re.fullmatch(r'\d{2}:\d{2}', doc['cut'])
                    or not finite(doc.get('ts'))):
                continue
            cut = epoch(doc['date'] + 'T' + doc['cut'] + ':00+05:30')
            issued = doc['ts']
            if int(cut) % 300 or not cut <= issued <= now:
                continue
            snapshots.append((cut, issued, doc))
        except (TypeError, ValueError, OverflowError):
            continue
    if not snapshots:
        return []
    cut, issued, doc = max(snapshots, key=lambda item: item[:2])
    if issued < boot_at or now - issued > 90 or now - cut > 180:
        return []
    boards = [doc.get('bull'), doc.get('bear')]
    if not all(isinstance(board, list) and len(board) <= 500 for board in boards):
        return []
    counts = {}
    for board in boards:
        for row in board:
            if isinstance(row, dict) and isinstance(row.get('s'), str):
                counts[row['s']] = counts.get(row['s'], 0) + 1
    events = []
    for side, board in zip(('BULL', 'BEAR'), boards):
        for row in board:
            if (not isinstance(row, dict) or not isinstance(row.get('s'), str)
                    or not row['s'] or counts[row['s']] != 1 or not confirmed_row(row, side, cut)):
                continue
            identity = f"rusty|{doc['date']}|{doc['cut']}|{side}|{row['s']}"
            events.append({**row, 'signal_source': 'rusty', 'Date': doc['date'],
                           'Symbol': row['s'], 'Side': side, 'Leg': 'CE' if side == 'BULL' else 'PE',
                           'Signal_Time': doc['cut'], 'Issued_At': stamp(issued),
                           'Event_ID': hashlib.sha256(identity.encode()).hexdigest()})
    return events


def contract_matches(contract, event):
    try:
        strike, spot = contract['strike'], event['c_close']
        return (contract['underlying'] == event['Symbol'] and contract['leg'] == event['Leg']
                and date.fromisoformat(contract['expiry']) >= date.fromisoformat(event['Date']) + timedelta(days=MIN_DTE)
                and positive(strike) and positive(spot)
                and (strike > spot if event['Leg'] == 'CE' else strike < spot)
                and isinstance(contract['key'], str) and contract['key'].startswith('NSE_FO|')
                and integer(contract['lot_size']) and integer(contract['minimum_lot'])
                and contract['minimum_lot'] % contract['lot_size'] == 0)
    except (KeyError, TypeError, ValueError):
        return False


def select_contract(rows, event, underlying_key):
    """Classic Kairos selection: first OTM strike, nearest expiry >=7 days."""
    matches = []
    for r in rows:
        try:
            if (r.get('segment') != 'NSE_FO' or r.get('underlying_key') != underlying_key
                    or r.get('underlying_symbol') != event['Symbol'] or r.get('instrument_type') != event['Leg']):
                continue
            contract = dict(underlying=event['Symbol'], key=r['instrument_key'], name=r['trading_symbol'],
                            expiry=r['expiry'], leg=r['instrument_type'], strike=float(r['strike_price']),
                            lot_size=r['lot_size'], minimum_lot=r.get('minimum_lot', r['lot_size']))
            if contract_matches(contract, event):
                matches.append(contract)
        except (KeyError, TypeError, ValueError):
            continue
    if not matches:
        raise ValueError('No exact OTM contract with at least seven days to expiry')
    matches.sort(key=lambda c: (c['expiry'], abs(c['strike'] - event['c_close'])))
    first = matches[0]
    if sum(c['expiry'] == first['expiry'] and c['strike'] == first['strike'] for c in matches) != 1:
        raise ValueError('Ambiguous option contract')
    return first
