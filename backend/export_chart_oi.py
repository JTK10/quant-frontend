"""Read-only export from an idle/stable Ocelot DB into compact chart snapshots.

No authentication, signal publishing or service changes. Run with --db/--out.
"""
import argparse
import gzip
import json
import os
import shutil
import tempfile
import time
from datetime import datetime
from pathlib import Path
import duckdb
from chart_oi import build_levels


def export(db, output):
    sources = [Path(db)]
    if Path(db + ".wal").exists():
        sources.append(Path(db + ".wal"))
    def signature():
        return [(p.stat().st_size, p.stat().st_mtime_ns) for p in sources]
    with tempfile.TemporaryDirectory(prefix="chart_oi_export_") as folder:
        snapshot = str(Path(folder) / "snapshot.duckdb")
        for attempt in range(3):
            before = signature()
            shutil.copyfile(db, snapshot)
            if len(sources) > 1:
                shutil.copyfile(db + ".wal", snapshot + ".wal")
            if signature() == before:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Source DB is changing; retry the read-only export later")
        con = duckdb.connect(snapshot, read_only=True)
        con.execute("SET threads=1")
        con.execute("SET memory_limit='150MB'")
        dates = [r[0] for r in con.execute("select distinct cast(cut_ts as date) d from chain_5min order by d desc limit 4").fetchall()]
        docs = []
        for day in sorted(dates):
            cuts = [r[0] for r in con.execute("select distinct cut_ts from chain_5min where cast(cut_ts as date)=? and cast(cut_ts as time)<=time '15:25' order by cut_ts", [day]).fetchall()]
            for cut in cuts:
                rows = con.execute("select * from chain_5min where cut_ts=?", [cut]).fetchall()
                health = con.execute("select degraded from health where cut_ts=?", [cut]).fetchone()
                docs.append({"date": day.isoformat(), "cut": cut.strftime("%H:%M"), "source": "chart_oi", "sig_date": cut.strftime("%Y%m%d"), "ts": 0,
                             "oi_levels": build_levels(rows), "degraded": bool(health[0]) if health else True})
        con.close()
    with gzip.open(output, "wt") as f:
        json.dump(docs, f, separators=(",", ":"), allow_nan=False)
    print(json.dumps({"dates": [d.isoformat() for d in sorted(dates)], "snapshots": len(docs), "output_bytes": os.path.getsize(output)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    export(args.db, args.out)
