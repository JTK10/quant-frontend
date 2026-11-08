"""Same-slot RVOL enrichment from existing completed Rusty candles. No network.

Seed: last 20 cash sessions per symbol. New sessions are recorded atomically
in this feature's own directory; original cash/chain files are never changed.
"""
import json
import math
import os
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).with_name('rusty_rvol_data')
_store = None


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def read(path, limit):
    if path.stat().st_size > limit:
        raise ValueError('RVOL input exceeds bound')
    return json.loads(path.read_text())


class Store:
    def __init__(self, root=ROOT):
        self.root = Path(root)
        self.day = None
        self.history = {}
        self.today = {}

    def start(self, day):
        if self.day == day:
            return
        seed = read(self.root / 'seed.json', 16_000_000)
        if seed.get('schema_version') != 1:
            raise ValueError('RVOL seed schema unavailable')
        history = seed['symbols']
        # At most 20 recent recorded sessions, each bounded to one cash day.
        paths = sorted(self.root.glob('????-??-??.json'))
        for path in [p for p in paths if p.stem < day][-20:]:
            saved = read(path, 500_000)
            if saved.get('date') != path.stem:
                raise ValueError('RVOL session date mismatch')
            for symbol, bars in saved['symbols'].items():
                history.setdefault(symbol, {})[path.stem] = bars
        self.history = {s: {d: days[d] for d in sorted(days) if d < day}
                        for s, days in history.items()}
        self.history = {s: dict(list(days.items())[-20:]) for s, days in self.history.items()}
        path = self.root / (day + '.json')
        self.today = read(path, 500_000)['symbols'] if path.exists() else {}
        self.day = day

    def enrich(self, cut, doc, candles):
        day, clock = cut.strftime('%Y-%m-%d'), cut.strftime('%H:%M')
        self.start(day)
        expected = (cut - timedelta(minutes=5)).strftime('%H:%M')
        changed = False
        for symbol, candle in candles.items():
            volume = candle.get('volume')
            if candle.get('time') != expected or not '09:15' <= expected <= '15:25' or not finite(volume) or volume < 0:
                continue
            bars = self.today.setdefault(symbol, {})
            if bars.get(expected) != volume:
                bars[expected] = volume
                changed = True
        if changed:
            self.root.mkdir(parents=True, exist_ok=True)
            path = self.root / (day + '.json')
            tmp = path.with_suffix('.tmp')
            tmp.write_text(json.dumps(dict(date=day, symbols=self.today), separators=(',', ':'), allow_nan=False))
            os.replace(tmp, path)
        for side in ('bull', 'bear'):
            for row in doc.get(side, []):
                row['c_rvol'], row['c_rvol_samples'] = None, 0
                symbol = row['s']
                if row.get('c_time') != expected or expected >= clock:
                    continue
                volume = self.today.get(symbol, {}).get(expected)
                if not finite(volume):
                    continue
                samples = [bars[expected] for bars in self.history.get(symbol, {}).values()
                           if finite(bars.get(expected)) and bars[expected] >= 0]
                row['c_rvol_samples'] = len(samples)
                if samples and sum(samples) > 0:
                    row['c_rvol'] = round(volume / (sum(samples) / len(samples)), 2)
        return doc


def enrich(cut, doc, candles):
    global _store
    if _store is None:
        _store = Store()
    return _store.enrich(cut, doc, candles or {})
