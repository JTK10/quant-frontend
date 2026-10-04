"""Small optional Ocelot output adapter. No network, database or broker calls."""
import json
import math
import os
import time
from pathlib import Path
from datetime import datetime


def export_cut(cut_ts, expiry, chain_rows, live, levels, candles, received, degraded,
               directory='/home/ubuntu/pallas/input'):
    target = Path(directory)
    target.mkdir(parents=True, exist_ok=True)
    chains = {}
    for r in chain_rows:
        # Same retained rows and denominator as the research capture.
        if r[6] is not None and not math.isfinite(float(r[6])):
            continue
        chains.setdefault(r[1], []).append([r[3], r[4], r[6], r[8], r[9], r[10]])
    bases = {}
    for sym, current in live.items():
        prior = levels.get(sym, {})
        if prior.get('pdh') and prior.get('pdl') and current[3] > 0:
            bases[sym] = dict(spot=current[0], pdh=prior['pdh'], pdl=prior['pdl'], open=current[3],
                              prior_day=prior.get('d'))
    exported = time.time()
    payload = dict(date=cut_ts.strftime('%Y-%m-%d'), cut=cut_ts.strftime('%H:%M:00'),
                   expiry=str(expiry), exported_at=exported, chain_received=received,
                   denominator='ocelot_retained_same_expiry', degraded=bool(degraded),
                   baselines=bases, chains=chains, candles=candles)
    path = target / (cut_ts.strftime('%Y%m%d-%H%M') + '.json')
    tmp = path.with_suffix('.tmp')
    data = json.dumps(payload, separators=(',', ':'), allow_nan=False)
    if len(data) > 4_000_000:
        raise ValueError('Pallas input exceeds bounded export budget')
    tmp.write_text(data, encoding='utf-8')
    os.replace(tmp, path)
    # Only this directory, only our dated JSON; ten calendar days of recovery.
    for old in target.glob('????????-????.json'):
        if exported - old.stat().st_mtime > 10 * 86400:
            old.unlink()
    return len(data)
