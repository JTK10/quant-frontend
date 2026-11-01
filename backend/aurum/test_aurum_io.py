"""Offline invariants; all HTTP calls are deterministic fake transports."""
from datetime import datetime
from pathlib import Path
import json
import shutil
import unittest
import uuid

from aurum_io import NiftyCache, Publisher, atomic_save, build_context, context_from_rusty, instant

DAY = "2026-10-30"


def candle(hm, **extra):
    return dict(type="candle", kind="closed", symbol="NIFTY 50", time=instant(DAY, hm),
                open=22000, high=22020, low=21990, close=22010, volume=0, **extra)


class Transport:
    def __init__(self):
        self.docs = {}
        self.calls = []
        self.uncertain_once = False
        self.incomplete = False

    def __call__(self, method, url, headers, data):
        self.calls.append((method, url))
        if url.endswith("/oauth/token"):
            return 200, b'{"access_token":"offline-test","expires_in":3600}'
        if method == "GET":
            assert "src=aurum" in url and "sig_date=20261030" in url and "limit=300" in url
            return 200, json.dumps(dict(items=[dict(doc=d) for d in self.docs.values()], hasMore=self.incomplete)).encode()
        doc = json.loads(data)
        self.docs[doc["Doc_ID"]] = doc
        if self.uncertain_once:
            self.uncertain_once = False
            raise OSError("Fake timeout after successful insert")
        return 201, b'{}'


class IOTests(unittest.TestCase):
    def setUp(self):
        self.parent = Path(__file__).resolve().parent
        self.root = self.parent / ("aurum-io-test-" + uuid.uuid4().hex)
        self.root.mkdir()

    def tearDown(self):
        self.assertEqual(self.root.resolve().parent, self.parent)
        shutil.rmtree(self.root)

    def test_rusty_exact_full_classification_and_missing(self):
        self.assertEqual(context_from_rusty(self.root, DAY, "09:35"), {})
        path = self.root / "20261030-0935.json"
        atomic_save(path, dict(rusty=dict(date=DAY, cut="09:35:00", bull=[dict(s="ABC", ce_pct=0,
            pe_pct=1, oi_bias=1, flow_label="Both Legs OI Rising (Flat)", flow_type="FLAT")], bear=[])))
        r = context_from_rusty(self.root, DAY, "09:35")
        self.assertEqual(r["ABC"]["view"], "Both Legs OI Rising (Flat)")
        self.assertEqual(r["ABC"]["ce_pct"], 0)
        doc = json.loads(path.read_text())
        doc["rusty"]["cut"] = "09:40"
        atomic_save(path, doc)
        with self.assertRaises(ValueError):
            context_from_rusty(self.root, DAY, "09:35")

    def test_rusty_size_date_and_duplicate_fail_closed(self):
        path = self.root / "20261030-0935.json"
        path.write_bytes(b" " * 500001)
        with self.assertRaises(ValueError):
            context_from_rusty(self.root, DAY, "09:35")
        row = dict(s="ABC", ce_pct=1, pe_pct=2, oi_bias=1)
        atomic_save(path, dict(rusty=dict(date=DAY, cut="09:35", bull=[row], bear=[row])))
        self.assertEqual(context_from_rusty(self.root, DAY, "09:35"), {})

    def test_nifty_only_closed_exact_bar_and_no_future(self):
        cache = NiftyCache(self.root)
        now = instant(DAY, "09:35") + 2
        update = candle("09:15", recv_ts=now)
        update["kind"] = "update"
        self.assertEqual(cache.ingest_stream(update, now), 0)
        self.assertEqual(cache.ingest_stream(candle("09:35", recv_ts=now), now), 0)
        self.assertEqual(cache.ingest_stream(candle("09:15", recv_ts=now), now), 1)
        self.assertIsNone(cache.context(DAY, "09:35"))
        self.assertEqual(cache.ingest_stream(candle("09:30", recv_ts=now), now), 1)
        value = cache.context(DAY, "09:35")
        self.assertEqual(value["bar_start"], "09:30")
        self.assertEqual(value["available_at"], now)
        self.assertFalse(value["recovered"])
        self.assertIsNone(cache.context("2026-10-29", "09:35"))
        duplicate = candle("09:30", recv_ts=now)
        duplicate["close"] = 22011
        self.assertEqual(cache.ingest_stream(duplicate, now), 0)
        self.assertEqual(cache.context(DAY, "09:35")["close"], 22010)

    def test_nifty_history_and_restart_explicit_recovery(self):
        cache = NiftyCache(self.root)
        now = instant(DAY, "09:35") + 10
        cache.ingest_stream(dict(type="snapshot", bars=[candle("09:15"), candle("09:30")]), now)
        self.assertTrue(cache.context(DAY, "09:35")["recovered"])
        loaded = NiftyCache(self.root)
        self.assertTrue(loaded.context(DAY, "09:35")["recovered"])
        self.assertEqual(build_context(self.root, loaded, DAY, "09:35")["rusty"], {})
        self.assertEqual(NiftyCache.subscription(), dict(type="subscribe", symbols=["NIFTY 50"], history=True))

    def publisher(self, transport):
        path = self.root / "config.json"
        atomic_save(path, dict(base="https://offline.invalid/schema", path="/signals/", client_id="test", client_secret="test"))
        return Publisher(path, self.root, request=transport)

    @staticmethod
    def document():
        return dict(source="aurum", engine="aurum-v1", date=DAY, status="READY", signals=[], coverage={})

    def test_publication_stable_duplicate_health_and_window(self):
        transport = Transport()
        pub = self.publisher(transport)
        now = instant(DAY, "09:35") + 5
        a = pub.enqueue_snapshot(self.document(), "09:35", now)
        self.assertEqual(a, pub.enqueue_snapshot(self.document(), "09:35", now + 2))
        self.assertEqual(len(list(pub.outbox.glob("*.json"))), 1)
        self.assertEqual(pub.flush_one(now)["status"], "SENT")
        self.assertEqual(len(transport.docs), 1)
        self.assertEqual(pub.flush_one(now)["status"], "IDLE")
        h = pub.enqueue_health(self.document(), now)
        pub.flush_one(now)
        self.assertEqual(transport.docs[h]["kind"], "HEALTH")
        self.assertNotIn("signals", transport.docs[h])
        self.assertIn("signals", transport.docs[a])
        with self.assertRaises(ValueError):
            pub.enqueue_snapshot(self.document(), "10:30", now)

    def test_uncertain_insert_read_back_never_duplicates(self):
        transport = Transport()
        transport.uncertain_once = True
        pub = self.publisher(transport)
        now = instant(DAY, "09:35") + 5
        pub.enqueue_snapshot(self.document(), "09:35", now)
        self.assertEqual(pub.flush_one(now)["status"], "PENDING")
        self.assertEqual(len(transport.docs), 1)
        # Simulate process death: restored outbox must check remote before retry.
        pub = self.publisher(transport)
        self.assertEqual(pub.flush_one(now + 20)["status"], "SENT")
        posts = [x for x in transport.calls if x[0] == "POST" and not x[1].endswith("/oauth/token")]
        self.assertEqual(len(posts), 1)

    def test_health_transitions_within_slot_and_restart_deduplicate(self):
        transport = Transport()
        pub = self.publisher(transport)
        now = instant(DAY, "09:31")
        pending = pub.enqueue_health(dict(self.document(), status="PENDING"), now)
        error = pub.enqueue_health(dict(self.document(), status="ERROR"), now + 7 * 60)
        ready = pub.enqueue_health(dict(self.document(), status="READY"), now + 8 * 60)
        self.assertEqual(len({pending, error, ready}), 3)
        self.assertEqual(ready, pub.enqueue_health(dict(self.document(), status="READY"), now + 8 * 60 + 20))
        pub = self.publisher(transport)
        self.assertEqual(ready, pub.enqueue_health(dict(self.document(), status="READY"), now + 8 * 60 + 40))
        error2 = pub.enqueue_health(dict(self.document(), status="ERROR"), now + 11 * 60)
        ready2 = pub.enqueue_health(dict(self.document(), status="READY"), now + 12 * 60)
        self.assertNotEqual(error, error2)
        self.assertNotEqual(ready, ready2)
        for _ in range(5):
            self.assertEqual(pub.flush_one(now + 13 * 60)["status"], "SENT")
        latest = max(transport.docs.values(), key=lambda d: d["ts"])
        self.assertEqual(latest["status"], "READY")
        self.assertEqual(latest["kind"], "HEALTH")
        self.assertNotIn("signals", latest)
        self.assertEqual(len(transport.docs), 5)

    def test_incomplete_or_wrong_source_read_back_cannot_authorize_post(self):
        transport = Transport()
        transport.incomplete = True
        pub = self.publisher(transport)
        now = instant(DAY, "09:35") + 5
        pub.enqueue_snapshot(self.document(), "09:35", now)
        self.assertEqual(pub.flush_one(now)["status"], "PENDING")
        self.assertFalse(transport.docs)
        transport.incomplete = False
        transport.docs["other"] = dict(source="pallas", sig_date="20261030", Doc_ID="other")
        self.assertEqual(pub.flush_one(now + 20)["status"], "PENDING")
        self.assertEqual(len(transport.docs), 1)


if __name__ == "__main__":
    unittest.main()
