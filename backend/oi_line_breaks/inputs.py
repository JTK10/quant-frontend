"""Bounded readers for the existing VM2 capture and cash/Chart OI state."""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ranker import build_candidates, cumulative_board, first_breaks

IST = timezone(timedelta(hours=5, minutes=30))
MAX_CAPTURE = 2_500_000
MAX_RUSTY = 4_000_000
MAX_HISTORY = 16_000_000
MAX_LINES = 20_000


def read_json(path, maximum):
    with Path(path).open('rb') as handle:
        blob = handle.read(maximum + 1)
    if len(blob) > maximum:
        raise ValueError('Input exceeds byte budget: ' + Path(path).name)
    result = json.loads(blob)
    if not isinstance(result, dict):
        raise ValueError('Expected object: ' + Path(path).name)
    return result


def valid_number(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def slot_times():
    return tuple(f'{minute//60:02}:{minute%60:02}' for minute in range(555, 926, 5))


SLOTS = slot_times()


def prior_cash(days, target_day, history_path, input_root):
    history = read_json(history_path, MAX_HISTORY)
    if not isinstance(history.get('symbols'), dict):
        raise ValueError('Cash history symbols unavailable')
    daily = {}
    for symbol, entries in history['symbols'].items():
        for entry in entries:
            day = entry.get('date')
            if day in days and entry.get('complete') and valid_number(entry.get('high')) and valid_number(entry.get('low')):
                daily[day, symbol] = (float(entry['high']), float(entry['low']))
    ordered = sorted([*days, target_day])
    for day in days:
        if any(source == day for source, _ in daily):
            continue
        following = ordered[ordered.index(day) + 1]
        path = Path(input_root) / (following.replace('-', '') + '-0920.json')
        capture = read_json(path, MAX_CAPTURE)
        if capture.get('date') != following or str(capture.get('cut', ''))[:5] != '09:20':
            raise ValueError('Next-session cash baseline capture unavailable')
        for symbol, base in capture.get('baselines', {}).items():
            if (isinstance(base, dict) and base.get('prior_day') == day and
                valid_number(base.get('pdh')) and valid_number(base.get('pdl')) and
                0 < base['pdl'] <= base['pdh']):
                daily[day, symbol] = (float(base['pdh']), float(base['pdl']))
    return {(day, symbol): [{'h': high, 'l': low}] for (day, symbol), (high, low) in daily.items()}


def prior_setup(day, rusty_path, input_root, history_path):
    rusty = read_json(rusty_path, MAX_RUSTY)
    if rusty.get('day') != day or not isinstance(rusty.get('sessions'), dict):
        raise ValueError('Rusty OI state for current day unavailable')
    source_days = sorted((d for d, rows in rusty['sessions'].items()
                          if d < day and rows and 0 < (datetime.fromisoformat(day) - datetime.fromisoformat(d)).days <= 10),
                         reverse=True)[:3]
    if len(source_days) != 3:
        raise ValueError('Three prior Chart OI close sessions unavailable')
    cash = prior_cash(source_days, day, history_path, input_root)
    sessions = {}
    for source in source_days:
        chart = rusty['sessions'][source]
        path = Path(input_root) / (source.replace('-', '') + '-1525.json')
        capture = read_json(path, MAX_CAPTURE)
        if capture.get('date') != source or str(capture.get('cut', ''))[:5] != '15:25' or not isinstance(capture.get('chains'), dict):
            raise ValueError('Prior chain-close capture unavailable')
        selected = {}
        for symbol, original in chart.items():
            if not isinstance(original, list) or len(original) < 5 or symbol not in capture['chains']:
                continue
            spot, expiry = float(original[1]), original[2]
            if expiry != capture.get('expiry') or not valid_number(spot) or spot <= 0:
                continue
            denominator = sum(int(w[1]) for group in original[3:5] for w in group)
            if denominator <= 0:
                continue
            pe, ce = [], []
            for quote in capture['chains'][symbol]:
                if not isinstance(quote, list) or len(quote) < 5:
                    continue
                strike, leg, oi, previous = quote[0], quote[1], quote[3], quote[4]
                if not all(valid_number(n) for n in (strike, oi)) or oi <= 0 or leg not in ('CE', 'PE'):
                    continue
                if not (spot <= strike <= spot * 1.06 if leg == 'CE' else spot * .94 <= strike <= spot):
                    continue
                delta = int(oi - previous) if valid_number(previous) and previous > 0 else None
                (ce if leg == 'CE' else pe).append([float(strike), int(oi), delta])
            if pe or ce:
                selected[symbol] = [symbol, spot, expiry, pe, ce, denominator]
        sessions[source] = selected
    eligible = set.intersection(*(set(rows) for rows in sessions.values()))
    eligible = {symbol for symbol in eligible if all((source, symbol) in cash for source in source_days)}
    if not eligible:
        raise ValueError('No symbols have three complete prior cash/OI sessions')
    sessions = {source: {symbol: row for symbol, row in rows.items() if symbol in eligible}
                for source, rows in sessions.items()}
    state = {'sessions': sessions, 'bars': {}}
    lines = build_candidates(state, cash, day)
    if not lines or len(lines) > MAX_LINES:
        raise ValueError('Candidate line budget exceeded or empty')
    return lines, source_days, len(eligible)


def pack(row):
    return [row['rank'], row['direction_rank'], row['symbol'], row['direction'], float(row['strike']), row['leg'],
            row['break_cut'], row['respected_days'], row['trapped_buildup_days'], float(row['fresh_oi_share_pct']),
            row['directional_move_since_break_pct'], bool(row['qualified_two_days']),
            row['pdh_broken'], row['pdl_broken']]


def rank_at_cut(lines, bars, extremes, levels, cut, wicks_complete=True):
    state = {'bars': bars}
    first_breaks(lines, state)
    current_hm = (datetime.strptime(cut, '%H:%M') - timedelta(minutes=5)).strftime('%H:%M')
    required = tuple(hm for hm in SLOTS if hm <= current_hm)
    current = [line for line in lines if all(hm in bars.get(line['symbol'], {}) for hm in required)]
    setup, _ = cumulative_board(current, [cut], state, rank_mode='oi')
    movement, _ = cumulative_board(current, [cut], state, rank_mode='movement')
    for row in setup + movement:
        symbol = row['symbol']
        current = extremes.get(symbol)
        prior = levels.get(symbol)
        if current and prior:
            row['pdh_broken'] = True if current[0] > prior[0] else False if wicks_complete else None
            row['pdl_broken'] = True if current[1] < prior[1] else False if wicks_complete else None
        else:
            row['pdh_broken'] = row['pdl_broken'] = None
    used = {(r['symbol'], r['leg'], float(r['strike'])) for r in setup + movement}
    evidence = {}
    for line in lines:
        identity = (line['symbol'], line['leg'], float(line['strike']))
        if identity in used:
            key = f"{identity[0]}|{identity[1]}|{identity[2]:g}"
            evidence[key] = [line['respected_dates'], line['trapped_buildup_dates'],
                             line['fresh_oi_on_respected_days'], line['observed_net_oi_change'],
                             line['prior_day_evidence'], line['first_observed_oi'], line['last_observed_oi']]
    if len(setup) > 400 or len(movement) > 400:
        raise ValueError('Live board row budget exceeded')
    return {'setup': [pack(row) for row in setup], 'move': [pack(row) for row in movement], 'evidence': evidence}


def ingest_capture(payload, day, cut, bars, extremes, levels, prior_day):
    if payload.get('date') != day or str(payload.get('cut', ''))[:5] != cut:
        raise ValueError('Current capture date/cut mismatch')
    exported = payload.get('exported_at')
    boundary = datetime.fromisoformat(day + 'T' + cut + ':00+05:30').timestamp()
    if not valid_number(exported) or not boundary <= exported <= boundary + 180:
        raise ValueError('Current capture was not published after candle completion')
    candles, baselines = payload.get('candles'), payload.get('baselines')
    if not isinstance(candles, dict) or not isinstance(baselines, dict):
        raise ValueError('Current capture lacks cash/baseline maps')
    expected = (datetime.fromisoformat(day + 'T' + cut) - timedelta(minutes=5)).strftime('%H:%M')
    updated = 0
    for symbol, candle in candles.items():
        base = baselines.get(symbol)
        if not isinstance(candle, dict) or not isinstance(base, dict) or candle.get('time') != expected:
            continue
        values = [candle.get(field) for field in ('open', 'high', 'low', 'close')]
        if not all(valid_number(value) and value > 0 for value in values):
            continue
        op, high, low, close = values
        if not low <= min(op, close) <= max(op, close) <= high:
            continue
        pdh, pdl = base.get('pdh'), base.get('pdl')
        if not valid_number(pdh) or not valid_number(pdl) or base.get('prior_day') != prior_day or not 0 < pdl <= pdh:
            continue
        bars.setdefault(symbol, {})[expected] = [float(op), float(close)]
        old_high, old_low = extremes.get(symbol, [float('-inf'), float('inf')])
        extremes[symbol] = [max(old_high, high), min(old_low, low)]
        levels[symbol] = [float(pdh), float(pdl)]
        updated += 1
    return updated
