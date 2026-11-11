import copy
import time
import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import Mock

from viper_engine import Engine
from viper_live import deliver_one, enqueue, open_state, prior_regular, snapshot

DAY = "2026-11-11"
BASE = "2026-11-09"


def capture(day, cut, spot, ce=100, pe=100, ce_premium=6, pe_premium=6, expiry="2026-11-23"):
    return {
        "date": day, "cut": cut + ":00", "expiry": expiry, "degraded": False,
        "chain_received": {"SAMPLE": 1}, "exported_at": 1,
        "baselines": {"SAMPLE": {"spot": spot}},
        "chains": {"SAMPLE": [[100, "CE", ce_premium, ce, 50, 0],
                             [100, "PE", pe_premium, pe, 50, 0]]},
    }


def seed():
    return Engine(DAY, capture(BASE, "15:25", 100, ce_premium=4, pe_premium=4))


class ViperTests(unittest.TestCase):
    def test_early_gap_and_restart(self):
        engine = seed()
        early = engine.advance(capture(DAY, "09:15", 100))
        self.assertIsNone(early["bull"][0]["unwind"])
        missing = engine.advance(capture(DAY, "09:35", 104, ce=80))
        self.assertIsNone(missing["bull"][0]["unwind"])
        resumed = Engine(DAY, state=copy.deepcopy(engine.state))
        with self.assertRaises(ValueError):
            resumed.advance(capture(DAY, "09:35", 104, ce=80))
        self.assertEqual(resumed.advance(capture(DAY, "09:50", 104, ce=70))["bull"][0]["state"],
                         "STRICT IGNITION")
        self.assertEqual(resumed.advance(capture(DAY, "09:55", 103, ce=70))["bull"][0]["state"], "EXHAUSTED")

    def test_put_first_watch_and_bridge(self):
        engine = seed()
        engine.advance(capture(DAY, "09:15", 99))
        engine.advance(capture(DAY, "09:20", 99))
        first = engine.advance(capture(DAY, "09:30", 99, pe=89, pe_premium=4))
        self.assertEqual(first["bear"][0]["state"], "BREAKDOWN COVERING")
        bridge = engine.advance(capture(DAY, "09:35", 98, pe=90, pe_premium=6))
        self.assertEqual(bridge["bear"][0]["state"], "PAIN IGNITION")

        engine = seed()
        engine.advance(capture(DAY, "09:15", 99))
        engine.advance(capture(DAY, "09:20", 99, pe=95))
        engine.advance(capture(DAY, "09:30", 99, pe=89, pe_premium=4))
        bridge = engine.advance(capture(DAY, "09:35", 98, pe=90, pe_premium=6))
        self.assertEqual(bridge["bear"][0]["state"], "BRIDGE IGNITION")

    def test_expiry_does_not_merge_and_special_not_baseline(self):
        engine = seed()
        self.assertEqual(engine.advance(capture(DAY, "09:15", 100, expiry="2026-12-28")),
                         {"bull": [], "bear": []})
        calendar = Mock()
        calendar.regular_day.side_effect = lambda day: day.isoformat() == BASE
        self.assertEqual(prior_regular(DAY, calendar), BASE)

    def test_outbox_reconciles_uncertain_post(self):
        with TemporaryDirectory() as temp:
            db = open_state(Path(temp) / "state.sqlite")
            now = time.time()
            doc = snapshot(seed(), capture(DAY, "09:15", 100), now, True)
            with db:
                enqueue(db, doc)
                enqueue(db, doc)
            pub = Mock()
            pub.publish.side_effect = OSError()
            self.assertTrue(deliver_one(db, pub, DAY, now))
            pub.read.return_value = {doc["Doc_ID"]: doc}
            self.assertTrue(deliver_one(db, pub, DAY, now + 20))
            self.assertEqual(pub.publish.call_count, 1)
            self.assertFalse(deliver_one(db, pub, DAY, now + 60))
            db.close()


if __name__ == "__main__":
    unittest.main()
