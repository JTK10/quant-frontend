import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from inputs import ingest_capture, prior_cash
from publish import Publisher


class InputsTest(unittest.TestCase):
    def test_prior_cash_uses_next_session_completed_baseline(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            history = root / 'history.json'
            history.write_text(json.dumps({'symbols': {'DIXON': [{'date': '2026-10-30', 'high': 12, 'low': 9, 'complete': True}]}}))
            (root / '20261103-0920.json').write_text(json.dumps({'date': '2026-11-03', 'cut': '09:20:00',
                'baselines': {'DIXON': {'prior_day': '2026-11-02', 'pdh': 15, 'pdl': 10}}}))
            cash = prior_cash(['2026-10-30', '2026-11-02'], '2026-11-03', history, root)
            self.assertEqual(cash['2026-11-02', 'DIXON'], [{'h': 15, 'l': 10}])
            self.assertEqual(cash['2026-10-30', 'DIXON'], [{'h': 12, 'l': 9}])

    def test_no_future_or_incomplete_candle(self):
        payload = {'date': '2026-11-03', 'cut': '09:20:00',
                   'exported_at': 1793677801.0,
                   'candles': {'TEST': {'time': '09:15', 'open': 100, 'high': 102, 'low': 99, 'close': 101}},
                   'baselines': {'TEST': {'prior_day': '2026-11-02', 'pdh': 110, 'pdl': 90}}}
        # The exact instant is calculated from the session date/cut; a bogus
        # publication timestamp or an active rather than completed bar fails.
        payload['exported_at'] = datetime.fromisoformat('2026-11-03T09:20:01+05:30').timestamp()
        bars, extremes, levels = {}, {}, {}
        self.assertEqual(ingest_capture(payload, '2026-11-03', '09:20', bars, extremes, levels, '2026-11-02'), 1)
        self.assertEqual(bars['TEST']['09:15'], [100.0, 101.0])
        payload['candles']['TEST']['time'] = '09:20'
        self.assertEqual(ingest_capture(payload, '2026-11-03', '09:20', {}, {}, {}, '2026-11-02'), 0)
        payload['exported_at'] -= 300
        with self.assertRaises(ValueError):
            ingest_capture(payload, '2026-11-03', '09:20', {}, {}, {}, '2026-11-02')


class PublisherTest(unittest.TestCase):
    def test_snapshot_before_index_and_uncertain_post_readback(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            cfg = root / 'ords.json'
            cfg.write_text(json.dumps({'base': 'https://example.test', 'path': '/signal',
                                       'client_id': 'test', 'client_secret': 'test'}))
            docs = {}
            calls = []
            def request(method, url, headers, body):
                calls.append((method, url))
                if url.endswith('/oauth/token'):
                    return 200, json.dumps({'access_token': 'token', 'expires_in': 300}).encode()
                if method == 'GET':
                    from urllib.parse import parse_qs, urlsplit
                    query = parse_qs(urlsplit(url).query)
                    source, day = query['src'][0], query['sig_date'][0]
                    items = [{'doc': doc} for doc in docs.values()
                             if doc['source'] == source and doc['sig_date'] == day]
                    return 200, json.dumps({'items': items}).encode()
                doc = json.loads(body)
                docs[doc['Doc_ID']] = doc
                return 201, b'{}'
            publisher = Publisher(cfg, root / 'state', request)
            now = datetime.fromisoformat('2026-11-03T09:20:15+05:30').timestamp()
            publisher.enqueue('2026-11-03', '09:20', 'INDEX', {'version': 1}, now)
            self.assertEqual(publisher.flush_one(now)['status'], 'IDLE')
            publisher.enqueue('2026-11-03', '09:20', 'SNAPSHOT', {'version': 1, 'setup': [], 'move': []}, now)
            self.assertEqual(publisher.flush_one(now)['kind'], 'SNAPSHOT')
            self.assertEqual(publisher.flush_one(now)['kind'], 'INDEX')
            self.assertEqual(len(docs), 2)
            publisher.enqueue('2026-11-03', '09:20', 'SNAPSHOT', {'version': 1}, now)
            self.assertEqual(publisher.flush_one(now)['status'], 'IDLE')
            self.assertEqual(len([x for x in calls if x[0] == 'POST' and not x[1].endswith('/oauth/token')]), 2)


if __name__ == '__main__':
    unittest.main()
