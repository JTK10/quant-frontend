"""Unit & Causal Regression Tests for Kairos Clean Runner (kairos_cr_live.py)."""
import shutil
import tempfile
import unittest
from pathlib import Path

from kairos_cr_live import (
    KairosCleanRunnerEngine,
    LotSizeStore,
    calc_nse_option_charges,
)


def make_chain_row(sym, expiry, strike, leg, spot, ltp, oi=50000, vol=10000, bid=None, ask=None):
    return (
        "2026-11-23 09:20:00", sym, expiry, strike, leg, spot, ltp, ltp,
        oi, oi, vol, bid, ask, 1000, 1000, 0.5, 25.0,
    )


class TestKairosCleanRunner(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="kairos_cr_test_"))
        self.lots = LotSizeStore(self.tmp)
        self.lots.day = "2026-11-23"
        self.lots.lots = {
            "SBIN|2026-12-29": 750,
            "RELIANCE|2026-12-29": 500,
            "TITAN|2026-12-29": 175,
            "ICICIBANK|2026-12-29": 700,
        }
        self.eng = KairosCleanRunnerEngine(self.tmp, self.lots)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_chronological_3_trade_cap_and_be5_trail_state_machine(self):
        day = "2026-11-23"
        exp = "2026-12-29"
        doc_0920 = {
            "bull": [
                {"n": "SBIN", "cr_tier": 1, "cr_lane": "MA2_5D_TRAP_UNW", "cr_cut": "09:20", "cr_score": 21.0, "spot": 802.0},
                {"n": "RELIANCE", "cr_tier": 1, "cr_lane": "T1_L2_WALL_SMASH", "cr_cut": "09:20", "cr_score": 17.5, "spot": 1300.0},
                {"n": "TITAN", "cr_tier": 2, "cr_lane": "MA1_PD_ACCEPT", "cr_cut": "09:20", "cr_score": 15.5, "spot": 3500.0},
                {"n": "ICICIBANK", "cr_tier": 2, "cr_lane": "MA1_PD_ACCEPT", "cr_cut": "09:20", "cr_score": 14.8, "spot": 1300.0},
            ],
            "bear": [],
        }
        chain_0920 = [
            make_chain_row("SBIN", exp, 800.0, "CE", 802.0, 20.0, bid=19.9, ask=20.2),
            make_chain_row("RELIANCE", exp, 1300.0, "CE", 1300.0, 30.0, bid=29.8, ask=30.2),
            make_chain_row("TITAN", exp, 3500.0, "CE", 3500.0, 80.0, bid=79.5, ask=80.5),
            make_chain_row("ICICIBANK", exp, 1300.0, "CE", 1300.0, 25.0, bid=24.8, ask=25.2),
        ]
        lv = {
            "SBIN": {"pdh": 800.0, "pdl": 780.0},
            "RELIANCE": {"pdh": 1295.0, "pdl": 1270.0},
            "TITAN": {"pdh": 3490.0, "pdl": 3400.0},
        }
        self.eng.process_cut(day, "09:20", 1000.0, doc_0920, chain_0920, lv, exp)
        self.assertEqual(len(self.eng.state["positions"]), 3)
        self.assertEqual([p["underlying"] for p in self.eng.state["positions"]], ["SBIN", "RELIANCE", "TITAN"])
        # 4th signal ICICIBANK must emit SKIP
        skips = [d for d in self.eng.state["pending"] if d["kind"] == "SKIP"]
        self.assertEqual(len(skips), 1)
        self.assertEqual(skips[0]["underlying"], "ICICIBANK")

        # Duplicate cut 09:20 must be ignored completely (restart/duplicate safety)
        n_before = len(self.eng.state["pending"])
        res_dup = self.eng.process_cut(day, "09:20", 1005.0, doc_0920, chain_0920, lv, exp)
        self.assertIn("skipped_duplicate_cut", res_dup)
        self.assertEqual(len(self.eng.state["pending"]), n_before)

        # Cut 09:25:
        #   SBIN hits +35% (27.0) -> arms BE_ARMED (+5% floor = 21.0)
        #   RELIANCE hits -31% (20.7) -> exits STOP_LOSS immediately
        #   TITAN hits +70% (136.0) -> arms TRAILING (25% below 136 = 102.0)
        chain_0925 = [
            make_chain_row("SBIN", exp, 800.0, "CE", 815.0, 27.0, bid=26.9, ask=27.2),
            make_chain_row("RELIANCE", exp, 1300.0, "CE", 1280.0, 20.7, bid=20.5, ask=20.9),
            make_chain_row("TITAN", exp, 3500.0, "CE", 3610.0, 136.0, bid=135.5, ask=136.5),
        ]
        self.eng.process_cut(day, "09:25", 1300.0, {"bull": [], "bear": []}, chain_0925, lv, exp)
        by_sym = {p["underlying"]: p for p in self.eng.state["positions"]}
        self.assertEqual(by_sym["SBIN"]["state"], "BE_ARMED")
        self.assertAlmostEqual(by_sym["SBIN"]["stop_premium"], 21.0, places=2)
        self.assertEqual(by_sym["RELIANCE"]["state"], "CLOSED")
        self.assertEqual(by_sym["RELIANCE"]["exit_reason"], "STOP_LOSS")
        self.assertEqual(by_sym["TITAN"]["state"], "TRAILING")
        self.assertAlmostEqual(by_sym["TITAN"]["stop_premium"], 102.0, places=2)

        # Simulate process restart: reload engine from atomic disk state
        eng2 = KairosCleanRunnerEngine(self.tmp, self.lots)
        eng2.load_day(day)
        self.assertEqual(eng2.state["last_cut"], "09:25")

        # Cut 09:30:
        #   SBIN drops to 20.8 (<= 21.0 BE+5% floor) -> exits BREAKEVEN_LOCK in GREEN!
        #   TITAN drops to 101.0 (<= 102.0 trail stop) -> exits TRAILING_STOP in GREEN!
        chain_0930 = [
            make_chain_row("SBIN", exp, 800.0, "CE", 804.0, 20.8, bid=20.75, ask=20.9),
            make_chain_row("TITAN", exp, 3500.0, "CE", 3560.0, 101.0, bid=100.5, ask=101.5),
        ]
        eng2.process_cut(day, "09:30", 1600.0, {"bull": [], "bear": []}, chain_0930, lv, exp)
        by_sym2 = {p["underlying"]: p for p in eng2.state["positions"]}
        self.assertEqual(by_sym2["SBIN"]["exit_reason"], "BREAKEVEN_LOCK")
        self.assertGreater(by_sym2["SBIN"]["net_pnl"], 0)  # +5% floor covers ask-bid + charges!
        self.assertEqual(by_sym2["TITAN"]["exit_reason"], "TRAILING_STOP")
        self.assertGreater(by_sym2["TITAN"]["net_pnl"], 3000)

    def test_dte_spread_volume_and_shadow_cash_pd_non_exit(self):
        day = "2026-11-23"
        # DTE=1 must be rejected
        doc = {"bull": [{"n": "SBIN", "cr_tier": 1, "cr_lane": "MA2", "cr_cut": "09:20", "cr_score": 20.0, "spot": 802.0}], "bear": []}
        chain_dte1 = [make_chain_row("SBIN", "2026-11-24", 800.0, "CE", 802.0, 10.0, bid=9.9, ask=10.1)]
        self.eng.process_cut(day, "09:20", 1000.0, doc, chain_dte1, {"SBIN": {"pdh": 800.0, "pdl": 780.0}}, "2026-11-24")
        self.assertEqual(len(self.eng.state["positions"]), 0)

        # Fresh engine on valid expiry: test shadow_cash_pd logs WITHOUT exiting
        eng2 = KairosCleanRunnerEngine(self.tmp / "sub", self.lots)
        exp = "2026-12-29"
        chain_ok = [make_chain_row("SBIN", exp, 800.0, "CE", 802.0, 20.0, bid=19.9, ask=20.1)]
        eng2.process_cut(day, "09:20", 1000.0, doc, chain_ok, {"SBIN": {"pdh": 800.0, "pdl": 780.0}}, exp)
        self.assertEqual(len(eng2.state["positions"]), 1)
        # Spot drops 1% inside PDH (792 < 800*0.993) and option -15% (17.0): MUST stay OPEN, only log shadow_cash_pd!
        chain_dip = [make_chain_row("SBIN", exp, 800.0, "CE", 792.0, 17.0, bid=16.9, ask=17.1)]
        eng2.process_cut(day, "09:25", 1300.0, {"bull": [], "bear": []}, chain_dip, {"SBIN": {"pdh": 800.0, "pdl": 780.0}}, exp)
        pos = eng2.state["positions"][0]
        self.assertEqual(pos["state"], "OPEN")
        self.assertIsNotNone(pos["shadow_cash_pd"])
        self.assertEqual(pos["shadow_cash_pd"]["cut"], "09:25")

        # EOD 15:15 must square off
        eng2.process_cut(day, "15:15", 5000.0, {"bull": [], "bear": []}, chain_dip, {"SBIN": {"pdh": 800.0, "pdl": 780.0}}, exp)
        self.assertEqual(eng2.state["positions"][0]["state"], "CLOSED")
        self.assertEqual(eng2.state["positions"][0]["exit_reason"], "EOD_1515")

    def test_charges_accuracy(self):
        ch = calc_nse_option_charges(20.0, 30.0, 750)
        # brokerage 40 + stt 22.5 + exch 13.14 + sebi 0.04 + stamp 0.45 + gst 9.57 ~= 85.7
        self.assertAlmostEqual(ch, 85.70, delta=0.1)


if __name__ == "__main__":
    unittest.main()
