"""Package validated research rankings as compact, immutable server-side archives.

Usage: python scripts/package-oi-line-breaks.py --source PATH_TO/movement_all_days_20261103
Only derived ranks and compact evidence are included; raw chain/cash data stay out of Git.
"""
import argparse
import csv
import gzip
import json
from pathlib import Path


def records(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def key(row):
    return f"{row['symbol']}|{row['leg']}|{float(row['strike']):g}"


def pack_rows(rows, levels):
    cuts = {}
    for row in rows:
        level = levels[row["symbol"]]
        cut = row["cut"]
        # The order is part of the versioned archive schema, decoded by the API.
        cuts.setdefault(cut, []).append([
            int(row["rank"]), int(row["direction_rank"]), row["symbol"],
            row["direction"], float(row["strike"]), row["leg"], row["break_cut"],
            int(row["respected_days"]), int(row["trapped_buildup_days"]),
            float(row["fresh_oi_share_pct"]),
            float(row["directional_move_since_break_pct"]) if row["directional_move_since_break_pct"] else None,
            row["qualified_two_days"] == "True",
            bool(level["pdh_break_cut"] and level["pdh_break_cut"] <= cut),
            bool(level["pdl_break_cut"] and level["pdl_break_cut"] <= cut),
        ])
    return dict(sorted(cuts.items()))


def package(source, target):
    target.mkdir(parents=True, exist_ok=True)
    manifest = []
    for folder in sorted(source.glob("vm2_????????")):
        stamp = folder.name[4:]
        day = f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:]}"
        names = {
            "setup": folder / f"oi_line_setup_rank_every_5min_{stamp}.csv",
            "move": folder / f"oi_line_break_rank_every_5min_{stamp}.csv",
            "evidence": folder / f"oi_line_trap_evidence_{stamp}.csv",
            "levels": folder / f"pdh_pdl_breaks_{stamp}.csv",
        }
        if not all(path.is_file() for path in names.values()):
            raise ValueError(f"Incomplete board: {day}")
        levels = {r["symbol"]: r for r in records(names["levels"])}
        previous = {r["prior_day"] for r in levels.values()}
        if len(previous) != 1:
            raise ValueError(f"Mixed previous sessions: {day}")
        setup = pack_rows(records(names["setup"]), levels)
        move = pack_rows(records(names["move"]), levels)
        if set(setup) != set(move):
            raise ValueError(f"Mismatched cuts: {day}")
        used = {f"{r[2]}|{r[5]}|{r[4]:g}" for cuts in (setup, move) for rows in cuts.values() for r in rows}
        evidence = {}
        for row in records(names["evidence"]):
            identity = key(row)
            if identity in used:
                evidence[identity] = [row["respected_dates"], row["trapped_buildup_dates"],
                                      int(row["fresh_oi_on_respected_days"]),
                                      int(row["observed_net_oi_change"]), row["prior_day_evidence"],
                                      int(row["first_observed_oi"]), int(row["last_observed_oi"])]
        if used - evidence.keys():
            raise ValueError(f"Missing exact-strike evidence: {day}")
        coverage = "all_nearby_strikes" if ((folder / "full_strike_source.json").exists() or day == "2026-11-02") else "saved_chart_lines"
        payload = {"version": 1, "date": day, "prior_day": next(iter(previous)), "coverage": coverage,
                   "setup": setup, "move": move, "evidence": evidence}
        output = target / f"{day}.json.gz"
        with gzip.open(output, "wt", encoding="utf-8", compresslevel=9) as stream:
            json.dump(payload, stream, separators=(",", ":"), ensure_ascii=False)
        manifest.append({"date": day, "cuts": len(setup), "coverage": coverage,
                         "last_cut": max(setup), "bytes": output.stat().st_size})
        print(day, len(setup), coverage, output.stat().st_size)
    if not manifest:
        raise ValueError("No validated boards found")
    (target / "manifest.json").write_text(json.dumps({"version": 1, "sessions": manifest},
                                           separators=(",", ":")), encoding="utf-8")
    print("sessions", len(manifest), "archive_bytes", sum(r["bytes"] for r in manifest))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--target", type=Path, default=Path(__file__).resolve().parents[1] / "data" / "oi-line-breaks")
    args = parser.parse_args()
    package(args.source, args.target)
