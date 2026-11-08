"""Package already-validated offline RVOL into compact historical lookup files.

No network or VM access. Exact values/mismatch flags are preserved except six
new-symbol overlays with duplicated cash history, repaired locally with DuckDB.
DuckDB is a build-only dependency, never a deployed runtime dependency.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import re


PROJECT = Path(__file__).resolve().parents[4]
APP = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / 'rusty-research/rusty-bulls-bears-local'
OUTPUT = APP / 'data/sol-rvol'
CASH = SOURCE / 'rvol-source/combined_normalized_cash.parquet'
CORRECT_SYMBOLS = {'SYRMA', 'NAVINFLUOR', 'CUB', 'KARURVYSYA', 'DATAPATTNS', 'COROMANDEL'}


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def corrected_history(cash: Path) -> tuple[dict, dict]:
    """Collapse only exact OHLCV copies; fail closed on conflicting duplicates."""
    import duckdb
    con = duckdb.connect()
    names = sorted(CORRECT_SYMBOLS)
    placeholders = ','.join('?' for _ in names)
    conflict = con.execute(f'''
        SELECT count(*) FROM (
          SELECT symbol,date,hm FROM read_parquet(?) WHERE symbol IN ({placeholders})
          GROUP BY symbol,date,hm HAVING count(DISTINCT (o,h,l,c,v))>1)
    ''', [str(cash), *names]).fetchone()[0]
    if conflict:
        raise ValueError('Conflicting corrected-symbol cash bars; manual source selection required')
    duplicate_keys, extra = con.execute(f'''
        SELECT count(*), coalesce(sum(n-1),0) FROM (
          SELECT count(*) n FROM read_parquet(?) WHERE symbol IN ({placeholders})
          GROUP BY symbol,date,hm HAVING count(*)>1)
    ''', [str(cash), *names]).fetchone()
    rows = con.execute(f'''
        WITH dedup AS (
          SELECT DISTINCT symbol,date,hm,o,h,l,c,v FROM read_parquet(?)
          WHERE symbol IN ({placeholders})
        ), ranked AS (
          SELECT *,dense_rank() OVER (PARTITION BY symbol ORDER BY date) sid FROM dedup
        )
        SELECT symbol,date,hm,v,
          avg(CASE WHEN v>=0 THEN v END) OVER w,
          count(CASE WHEN v>=0 THEN v END) OVER w
        FROM ranked
        WINDOW w AS (PARTITION BY symbol,hm ORDER BY sid
                     RANGE BETWEEN 20 PRECEDING AND 1 PRECEDING)
    ''', [str(cash), *names]).fetchall()
    lookup = {}
    for symbol, day, hm, volume, mean, samples in rows:
        value = volume/mean if mean is not None and mean>0 and volume is not None and volume>=0 else None
        lookup[(symbol, day, hm)] = (value, samples, volume)
    return lookup, dict(cash_source_sha256=sha(cash.read_bytes()),
                        duplicate_keys=duplicate_keys, identical_extra_rows=extra,
                        conflicting_keys=conflict, symbols=names,
                        definition='Exact identical OHLCV rows collapsed, then same-slot mean within previous20 distinct stock sessions; current session excluded')


def pack(source: Path, output: Path, cash: Path) -> dict:
    source_manifest = source / 'data/rvol-manifest.json'
    manifest_bytes = source_manifest.read_bytes()
    original = json.loads(manifest_bytes)
    output.mkdir(parents=True, exist_ok=True)
    sessions = []
    dates = set()
    corrections, correction_provenance = corrected_history(cash)
    for session in original['sessions']:
        day = session['date']
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) or day in dates:
            raise ValueError('Invalid/duplicate source session date')
        dates.add(day)
        path = (source / session['file']).resolve()
        if not path.is_relative_to((source / 'data').resolve()):
            raise ValueError('Source must remain in data directory')
        blob = path.read_bytes()
        if sha(blob) != session['sha256']:
            raise ValueError('RVOL source SHA mismatch: ' + day)
        payload = json.loads(blob)
        if payload['date'] != day:
            raise ValueError('RVOL source date mismatch')
        points = {}
        total = available = mismatch = corrected = 0
        for hm, symbols in payload['points'].items():
            if not re.fullmatch(r'\d{2}:\d{2}', hm) or not '09:15' <= hm <= '15:25':
                raise ValueError('Invalid candle slot')
            target = {}
            for symbol, row in symbols.items():
                total += 1
                value = row.get('value')
                if value is None:
                    continue
                if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or value < 0:
                    raise ValueError('Invalid RVOL value')
                samples = row['samples']
                match = row.get('ohlc_match')
                if day >= '2026-11-02' and symbol in CORRECT_SYMBOLS:
                    corrected_value, samples, volume = corrections[(symbol, day, hm)]
                    if volume != row.get('volume'):
                        raise ValueError('Corrected current volume differs from source: ' + day + '/' + symbol)
                    if corrected_value is None:
                        raise ValueError('Original finite value has no valid corrected denominator')
                    value = corrected_value
                    corrected += 1
                if isinstance(samples, bool) or not isinstance(samples, int) or not 1 <= samples <= 20:
                    raise ValueError('Invalid sample coverage')
                if match is not None and not isinstance(match, bool):
                    raise ValueError('Invalid OHLC match flag')
                if row.get('bar_time', hm) != hm:
                    raise ValueError('Candle slot mismatch')
                # Every available denominator uses sessions strictly before day.
                if row.get('history_last') and row['history_last'] >= day:
                    raise ValueError('Current/future denominator history')
                target[symbol] = [value, samples, match]
                available += 1
                mismatch += match is False
            if target:
                points[hm] = target
        if session.get('points') != total:
            raise ValueError('Source point count mismatch: ' + day)
        if session.get('counts', {}).get('available', available) != available:
            raise ValueError('Source available count mismatch: ' + day)
        result = dict(version=1, date=day, points=points)
        raw = json.dumps(result, separators=(',', ':'), allow_nan=False).encode('utf8')
        compressed = gzip.compress(raw, compresslevel=9, mtime=0)
        file = day + '.json.gz'
        (output / file).write_bytes(compressed)
        # Re-read verifies saved compact shape/values, not just encoder success.
        if json.loads(gzip.decompress((output / file).read_bytes())) != result:
            raise ValueError('Saved overlay verification failed')
        sessions.append(dict(date=day, file=file, sha256=sha(compressed),
                             source_sha256=sha(blob), source_points=total,
                             available=available, ohlc_mismatch=mismatch,
                             corrected_points=corrected,
                             raw_bytes=len(raw), bytes=len(compressed)))
    manifest = dict(version=1, kind='HISTORICAL_RECONSTRUCTED_CASH_RVOL',
                    definition=original['definition'],
                    volume_provenance=original['volume_provenance'],
                    source_manifest_sha256=sha(manifest_bytes),
                    point_schema=['value', 'prior_session_samples', 'published_ohlc_match'],
                    lookback=20, correction=correction_provenance,
                    sessions=sorted(sessions, key=lambda x: x['date']))
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--cash', type=Path, default=CASH)
    args = parser.parse_args()
    manifest = pack(args.source, args.output, args.cash)
    sessions = manifest['sessions']
    print(json.dumps(dict(dates=len(sessions),
                          compressed_bytes=sum(s['bytes'] for s in sessions),
                          max_compressed_bytes=max(s['bytes'] for s in sessions),
                          max_raw_bytes=max(s['raw_bytes'] for s in sessions),
                          november6=next(s for s in sessions if s['date'] == '2026-11-06'))))
