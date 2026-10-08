"""Replay saved Oracle boards for signal eligibility, never simulated fills."""
import argparse
import csv
import gzip
import json
import tempfile
from pathlib import Path

from rusty_engine import Trader, epoch, hm
from rusty_signals import snapshot_events


def replay(path):
    opener = gzip.open if str(path).endswith('.gz') else open
    with opener(path, 'rt', encoding='utf-8') as stream:
        docs = json.load(stream)
    records, labels, morning_labels = [], 0, 0
    date = docs[0]['date']
    opening = epoch(date + 'T09:15:00+05:30')
    closing = epoch(date + 'T15:30:00+05:30')
    with tempfile.TemporaryDirectory() as root:
        trader = Trader(root, opening - 900)
        for d in sorted(docs, key=lambda d: (d['cut'], d['ts'])):
            count = sum(r.get('entry_confirmed') is True for board in ('bull', 'bear') for r in d.get(board, []))
            labels += count
            if '09:20' <= d['cut'] < '11:30':
                morning_labels += count
            # Original publisher timestamp +1s is an eligibility check. The
            # real worker polls every 15s, then requests contracts and quotes.
            now = d['ts'] + 1
            choices = trader.candidates(snapshot_events([d], now, opening-900), now, opening, closing)
            for priority, e in enumerate(choices, 1):
                records.append(dict(date=date, cut=e['Signal_Time'], published_ist=hm(d['ts']),
                                    symbol=e['Symbol'], side=e['Side'], leg=e['Leg'],
                                    priority_at_cut=priority, rusty_pct=e['rusty_pct'], rusty_rank=e['rusty_rank'],
                                    ce_pct=e['ce_pct'], pe_pct=e['pe_pct'], flow_type=e['flow_type'],
                                    candle_tier=e.get('candle_tier'), candle_start=e['c_time'],
                                    cash_close=e['c_close'], signal_id=e['Event_ID']))
    return records, dict(date=date, snapshots=len(docs), confirmed_labels_all_day=labels,
                         confirmed_labels_entry_window=morning_labels, eligible_candidates=len(records),
                         first_signal_candidate=records[0] if records else None,
                         execution_verified=False,
                         limitation='Signal eligibility only. Contract availability, budget and current depth may change actual selection.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshots', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    summaries = []
    for path in args.snapshots:
        records, summary = replay(path)
        summaries.append(summary)
        if records:
            with (args.output / (summary['date'] + '_eligible.csv')).open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=list(records[0]))
                writer.writeheader(); writer.writerows(records)
    (args.output / 'summary.json').write_text(json.dumps(summaries, indent=2), encoding='utf-8')
    print(json.dumps(summaries, indent=2))
