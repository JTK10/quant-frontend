"""Live exact-strike OI line scanner over existing completed VM2 captures.

No broker calls, DuckDB access, producer changes, or chart-stream subscriptions.
Each completed cut is stored locally before durable, source-isolated publication.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from inputs import MAX_CAPTURE, SLOTS, ingest_capture, prior_setup, rank_at_cut, read_json
from publish import Publisher, save

IST = timezone(timedelta(hours=5, minutes=30))
ROOT = Path(os.environ.get('OI_LINE_ROOT', '/home/ubuntu/oi-line-breaks'))
INPUT = Path(os.environ.get('OI_LINE_INPUT', '/home/ubuntu/pallas/input'))
RUSTY = Path(os.environ.get('OI_LINE_RUSTY', '/home/ubuntu/ocelot/rusty_oi_state.json'))
HISTORY = Path(os.environ.get('OI_LINE_HISTORY', '/home/ubuntu/aurum/history.json'))
ORDS = Path(os.environ.get('OI_LINE_ORDS', '/home/ubuntu/ocelot/ords.json'))
CUTS = tuple((datetime.strptime(hm, '%H:%M') + timedelta(minutes=5)).strftime('%H:%M') for hm in SLOTS)


def now_ist(now=None):
    return datetime.fromtimestamp(time.time() if now is None else now, IST)


class Worker:
    def __init__(self, root=ROOT, input_root=INPUT, rusty=RUSTY, history=HISTORY):
        self.root = Path(root)
        self.input = Path(input_root)
        self.rusty = Path(rusty)
        self.history = Path(history)
        self.state = None
        self.error = None
        self.last_published = None

    def start(self, day):
        path = self.root / 'state' / (day + '.json')
        if path.exists():
            state = read_json(path, 25_000_000)
            if state.get('day') != day or state.get('version') != 1:
                raise ValueError('Persisted scanner state date/version mismatch')
            self.state = state
            return
        lines, source_days, eligible = prior_setup(day, self.rusty, self.input, self.history)
        self.state = {'version': 1, 'day': day, 'source_days': source_days, 'eligible': eligible,
                      'lines': lines, 'bars': {}, 'extremes': {}, 'levels': {},
                      'processed': [], 'prior_day': source_days[0], 'last_cut': None,
                      'last_coverage': None, 'wicks_complete': True}
        save(path, self.state)

    def process(self, path, now, publisher, calendar):
        if self.state is None:
            raise ValueError('Scanner not initialized')
        day = self.state['day']
        cut = path.stem[-4:-2] + ':' + path.stem[-2:]
        if cut not in CUTS or cut in self.state['processed']:
            return False
        boundary = datetime.fromisoformat(day + 'T' + cut + ':00+05:30').timestamp()
        if now + 2 < boundary:
            return False
        payload = read_json(path, MAX_CAPTURE)
        if not isinstance(payload.get('exported_at'), (float, int)) or payload['exported_at'] > now + 2:
            raise ValueError('Capture availability is in the future')
        baselines = payload.get('baselines')
        if not isinstance(baselines, dict):
            raise ValueError('Capture baselines unavailable')
        prior_days = {base.get('prior_day') for base in baselines.values()
                      if isinstance(base, dict) and isinstance(base.get('prior_day'), str)}
        if len(prior_days) != 1:
            raise ValueError('Mixed previous-session baseline dates')
        prior_day = next(iter(prior_days))
        if prior_day != self.state['prior_day'] or not calendar.prior_date_valid(prior_day, day):
            raise ValueError('Previous-session baseline does not match OI source')
        updated = ingest_capture(payload, day, cut, self.state['bars'],
                                 self.state['extremes'], self.state['levels'], prior_day)
        if not updated:
            # The existing Pallas capture can stop carrying candles near the
            # close. Rusty retains completed Ocelot open/close bars. Use those
            # for ranks, and mark unobserved PDH/PDL wicks as unavailable.
            rusty = read_json(self.rusty, 4_000_000)
            if rusty.get('day') != day or not isinstance(rusty.get('bars'), dict):
                raise ValueError('Late completed Rusty cash bars unavailable')
            expected = (datetime.strptime(cut, '%H:%M') - timedelta(minutes=5)).strftime('%H:%M')
            for symbol, saved in rusty['bars'].items():
                pair = saved.get(expected) if isinstance(saved, dict) else None
                base = baselines.get(symbol)
                if not isinstance(pair, list) or len(pair) != 2 or not isinstance(base, dict):
                    continue
                op, close = pair
                pdh, pdl = base.get('pdh'), base.get('pdl')
                if (not all(isinstance(x, (int, float)) and x > 0 for x in (op, close, pdh, pdl))
                    or base.get('prior_day') != prior_day):
                    continue
                self.state['bars'].setdefault(symbol, {})[expected] = [float(op), float(close)]
                old_high, old_low = self.state['extremes'].get(symbol, [float('-inf'), float('inf')])
                self.state['extremes'][symbol] = [max(old_high, op, close), min(old_low, op, close)]
                self.state['levels'][symbol] = [float(pdh), float(pdl)]
                updated += 1
            if not updated:
                raise ValueError('No completed current cash bars from existing captures')
            self.state['wicks_complete'] = False
        ranked = rank_at_cut(self.state['lines'], self.state['bars'], self.state['extremes'],
                             self.state['levels'], cut, self.state['wicks_complete'])
        observed = len({symbol for symbol, candles in self.state['bars'].items()
                        if (datetime.strptime(cut, '%H:%M') - timedelta(minutes=5)).strftime('%H:%M') in candles})
        coverage = {'eligible': self.state['eligible'], 'cash': updated, 'ranked': len(ranked['setup']),
                    'wicks_complete': self.state['wicks_complete'],
                    'status': 'READY' if observed >= self.state['eligible'] * .8 and self.state['wicks_complete'] else 'DEGRADED'}
        body = {'version': 1, 'prior_day': prior_day, 'source_days': self.state['source_days'],
                'coverage': 'all_nearby_strikes', 'coverage_counts': coverage,
                'recovered': now > boundary + 180, **ranked}
        publisher.enqueue(day, cut, 'SNAPSHOT', body, now)
        publisher.enqueue(day, cut, 'INDEX', {'version': 1, 'prior_day': prior_day,
                          'coverage': 'all_nearby_strikes', 'coverage_counts': coverage,
                          'recovered': now > boundary + 180}, now)
        # Durable outbox first. If the state write fails, replay the same
        # capture after restart; the stable source/date/cut ID cannot duplicate.
        self.state['processed'].append(cut)
        self.state['last_cut'] = cut
        self.state['last_coverage'] = coverage
        save(self.root / 'state' / (day + '.json'), self.state)
        self.error = None
        return True

    def health(self, day, publication, now):
        state = self.state if self.state and self.state.get('day') == day else None
        save(self.root / 'health.json', {'date': day, 'checked_at': now_ist(now).isoformat(),
             'status': 'ERROR' if self.error else 'READY' if state and state.get('last_cut') else 'PENDING',
             'last_cut': state.get('last_cut') if state else None,
             'last_coverage': state.get('last_coverage') if state else None,
             'publication': publication, 'error': self.error})


def run():
    import fcntl
    ROOT.mkdir(parents=True, exist_ok=True)
    with (ROOT / 'worker.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        sys.path.insert(0, '/home/ubuntu/market-calendar')
        import nse_calendar
        publisher = Publisher(ORDS, ROOT)
        worker = Worker()
        health_at = 0
        publication = {'status': 'IDLE'}
        while True:
            now = time.time()
            local = now_ist(now)
            day = local.date().isoformat()
            if nse_calendar.regular_day(day) and '09:14' <= local.strftime('%H:%M') <= '15:40':
                try:
                    if worker.state is None or worker.state['day'] != day:
                        worker.start(day)
                    candidates = sorted(INPUT.glob(day.replace('-', '') + '-????.json'))
                    completed = 0
                    for path in candidates:
                        cut = path.stem[-4:-2] + ':' + path.stem[-2:]
                        if cut not in CUTS or cut in worker.state['processed']:
                            continue
                        if worker.process(path, now, publisher, nse_calendar):
                            completed += 1
                        if completed >= 2:
                            break
                except Exception as error:
                    worker.error = type(error).__name__ + ': ' + str(error)[:120]
                    if now - health_at >= 60:
                        print('OI line input unavailable:', worker.error, flush=True)
            try:
                publication = publisher.flush_one(now)
                if publication['status'] == 'RETRY' and now - health_at >= 60:
                    print('OI line publication retry:', publication, flush=True)
            except Exception as error:
                publication = {'status': 'RETRY', 'error': type(error).__name__}
            if now - health_at >= 60:
                worker.health(day, publication, now)
                health_at = now
            time.sleep(10)


if __name__ == '__main__':
    run()
