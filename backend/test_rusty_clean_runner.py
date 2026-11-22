import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from rusty_clean_runner import CleanRunnerStore


class CleanRunnerLiveTests(unittest.TestCase):
    def _build_seed(self, root: Path):
        # 5 prior days strictly < 2026-11-20 with tight PDH=101, PDL=99, prev_cl=100, and 5d fresh CE OI buildup
        daily = {
            "TEST": {
                "2026-11-13": [100.0, 101.2, 98.8, 100.0],
                "2026-11-16": [100.0, 101.1, 99.0, 100.1],
                "2026-11-17": [100.0, 101.0, 99.1, 100.0],
                "2026-11-18": [100.0, 101.0, 99.2, 100.0],
                "2026-11-19": [100.0, 101.0, 99.0, 100.0],
                "2026-11-20": [100.0, 999.0, 1.0, 999.0],   # Today must be excluded from prior stats!
                "2026-11-23": [100.0, 999.0, 1.0, 999.0],   # Future must be excluded!
            }
        }
        eod_chains = {
            "2026-11-13": {
                "TEST": {
                    "expiry": "2026-11-23", "spot": 100.0,
                    "CE": {"100.0": [50000, 2.0], "101.0": [50000, 1.5], "104.0": [200000, 1.0]},
                    "PE": {"99.0": [80000, 1.5], "100.0": [80000, 2.0]},
                }
            },
            "2026-11-19": {
                "TEST": {
                    "expiry": "2026-11-23", "spot": 100.0,
                    "CE": {"100.0": [200000, 2.5], "101.0": [300000, 2.0], "104.0": [250000, 1.2]},
                    "PE": {"99.0": [80000, 1.5], "100.0": [100000, 2.0]},
                }
            },
        }
        (root / "seed.json").write_text(json.dumps({"schema_version": 1, "daily": daily, "eod_chains": eod_chains}))

        rvol_root = root / "rvol"
        rvol_root.mkdir(parents=True, exist_ok=True)
        rvol_syms = {"TEST": {f"2026-11-{d:02d}": {"09:15": 1000, "09:20": 1000, "09:25": 1000} for d in range(10, 20)}}
        (rvol_root / "seed.json").write_text(json.dumps({"schema_version": 1, "symbols": rvol_syms}))
        return rvol_root

    def test_causal_trigger_sticky_persistence_and_no_future_leak(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rvol_root = self._build_seed(root)
            store = CleanRunnerStore(root=root, rvol_root=rvol_root, pallas_dir=root / "no_pallas")
            lv = {"TEST": {"pdh": 101.0, "pdl": 99.0, "pdc": 100.0}}

            # 1) At 09:20 cut (completed 09:15 bar still inside PDH=101.0 at close=100.4) -> NO trigger
            cut_0920 = datetime.fromisoformat("2026-11-20T09:20:00")
            candles_0920 = {
                "TEST": {"time": "09:15", "open": 100.0, "high": 100.5, "low": 99.9, "close": 100.4, "volume": 1500},
                "MKT1": {"time": "09:15", "open": 100.0, "high": 101.0, "low": 100.0, "close": 100.5, "volume": 1000},
                "MKT2": {"time": "09:15", "open": 100.0, "high": 101.0, "low": 100.0, "close": 100.6, "volume": 1000},
            }
            chains_0920 = [
                (cut_0920, "TEST", "2026-11-23", 100.0, "CE", 100.4, 2.6, 2.5, 200000, 200000, 1000),
                (cut_0920, "TEST", "2026-11-23", 101.0, "CE", 100.4, 2.1, 2.0, 300000, 300000, 1000),
                (cut_0920, "TEST", "2026-11-23", 104.0, "CE", 100.4, 1.3, 1.2, 250000, 250000, 1000),
                (cut_0920, "TEST", "2026-11-23", 100.0, "PE", 100.4, 1.8, 2.0, 100000, 100000, 1000),
            ]
            doc_0920 = {"bull": [{"s": "TEST"}], "bear": []}
            store.enrich(cut_0920, doc_0920, candles=candles_0920, chain_rows=chains_0920, lv=lv, expiry="2026-11-23")
            self.assertNotIn("cr_tier", doc_0920["bull"][0], "Must not trigger before PDH/Wall break")

            # 2) At 09:25 cut (completed 09:20 bar breaks PDH=101.0 -> close=101.35, high RVOL, CE 101 unwinding -6%, PE 100 building +10%)
            cut_0925 = datetime.fromisoformat("2026-11-20T09:25:00")
            candles_0925 = {
                "TEST": {"time": "09:20", "open": 100.4, "high": 101.4, "low": 100.4, "close": 101.35, "volume": 3000},
                "MKT1": {"time": "09:20", "open": 100.5, "high": 101.0, "low": 100.4, "close": 100.8, "volume": 1000},
                "MKT2": {"time": "09:20", "open": 100.6, "high": 101.0, "low": 100.5, "close": 100.9, "volume": 1000},
            }
            chains_0925 = [
                (cut_0925, "TEST", "2026-11-23", 100.0, "CE", 101.35, 3.1, 2.5, 185000, 200000, 5000),
                (cut_0925, "TEST", "2026-11-23", 101.0, "CE", 101.35, 2.6, 2.0, 275000, 300000, 8000),
                (cut_0925, "TEST", "2026-11-23", 104.0, "CE", 101.35, 1.6, 1.2, 240000, 250000, 4000),
                (cut_0925, "TEST", "2026-11-23", 100.0, "PE", 101.35, 1.4, 2.0, 112000, 100000, 6000),
            ]
            doc_0925 = {"bull": [{"s": "TEST"}], "bear": []}
            store.enrich(cut_0925, doc_0925, candles=candles_0925, chain_rows=chains_0925, lv=lv, expiry="2026-11-23")
            self.assertEqual(doc_0925["bull"][0].get("cr_tier"), 1)
            self.assertEqual(doc_0925["bull"][0].get("cr_cut"), "09:25")
            self.assertIsNotNone(doc_0925["bull"][0].get("cr_lane"))

            # 3) Simulate service restart at 10:15 cut -> sticky trigger from 09:25 must be preserved!
            restarted = CleanRunnerStore(root=root, rvol_root=rvol_root, pallas_dir=root / "no_pallas")
            cut_1015 = datetime.fromisoformat("2026-11-20T10:15:00")
            doc_1015 = {"bull": [{"s": "TEST"}], "bear": []}
            restarted.enrich(cut_1015, doc_1015, candles={}, chain_rows=[], lv=lv, expiry="2026-11-23")
            self.assertEqual(doc_1015["bull"][0].get("cr_tier"), 1)
            self.assertEqual(doc_1015["bull"][0].get("cr_cut"), "09:25")


if __name__ == "__main__":
    unittest.main()
