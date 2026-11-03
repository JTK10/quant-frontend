"""Verify the packaged replay remains causal and matches key research examples."""
import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "oi-line-breaks"
manifest = json.loads((ROOT / "manifest.json").read_text())
assert len(manifest["sessions"]) == 28
assert [s["date"] for s in manifest["sessions"]] == sorted(s["date"] for s in manifest["sessions"])
largest_response = (0, "")

for session in manifest["sessions"]:
    day = session["date"]
    data = json.loads(gzip.decompress((ROOT / f"{day}.json.gz").read_bytes()))
    assert data["version"] == 1 and data["date"] == day
    assert set(data["setup"]) == set(data["move"])
    assert len(data["setup"]) == session["cuts"]
    assert max(data["setup"]) == session["last_cut"]
    assert day > data["prior_day"]
    for mode in ("setup", "move"):
        for cut, rows in data[mode].items():
            assert len(rows) <= 400
            assert [r[0] for r in rows] == list(range(1, len(rows) + 1))
            for row in rows:
                rank, side_rank, symbol, direction, strike, leg, break_cut, defended, built, fresh, movement, qualified, pdh, pdl = row
                assert break_cut <= cut, (day, cut, symbol, break_cut)
                assert (direction, leg) in (("BULL", "CE"), ("BEAR", "PE"))
                assert 0 <= built <= defended <= 3 and fresh >= 0
                assert not qualified or built >= 2
                assert f"{symbol}|{leg}|{strike:g}" in data["evidence"]
                assert movement is None or -100 <= movement <= 100
    last = max(data["setup"])
    latest = data["setup"][last] + data["move"][last]
    identities = {f"{r[2]}|{r[5]}|{r[4]:g}" for r in latest}
    request_bytes = len(json.dumps({"setup": data["setup"][last], "move": data["move"][last],
                                    "evidence": {k: data["evidence"][k] for k in identities}}).encode())
    largest_response = max(largest_response, (request_bytes, day))
    print(day, session["cuts"], session["coverage"])

nov = json.loads(gzip.decompress((ROOT / "2026-11-02.json.gz").read_bytes()))
assert nov["setup"]["10:00"][0][2:7] == ["DIXON", "BULL", 11500.0, "CE", "09:35"]
assert nov["setup"]["10:00"][0][9] == 35.079
oct6 = json.loads(gzip.decompress((ROOT / "2026-10-06.json.gz").read_bytes()))
assert any(row[2:7] == ["TIINDIA", "BULL", 2350.0, "CE", "10:00"]
           for row in oct6["setup"]["10:00"])
print("PASS: 28 sessions, causal cuts, exact-strike evidence, DIXON and TIINDIA")
print("largest packed-row/evidence bytes (API expands field names):", *largest_response)
