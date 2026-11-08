import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from rusty_rvol import Store


class RVOLTests(unittest.TestCase):
    def test_same_slot_causality_restart_and_rollover(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'seed.json').write_text(json.dumps(dict(schema_version=1, symbols={'TEST': {
                '2026-11-04': {'09:15': 10, '09:20': 1000},
                '2026-11-05': {'09:15': 30},
                '2026-11-06': {'09:15': 99999},  # Today must not enter denominator.
                '2026-11-09': {'09:15': 99999},  # Nor future seed records.
            }})))
            cut = datetime.fromisoformat('2026-11-06T09:20:00+05:30')
            candles = {'TEST': dict(time='09:15', volume=60)}
            doc = dict(bull=[dict(s='TEST', c_time='09:15')], bear=[dict(s='TEST', c_time='09:20')])
            store = Store(root)
            store.enrich(cut, doc, candles)
            self.assertEqual(doc['bull'][0]['c_rvol'], 3)
            self.assertEqual(doc['bull'][0]['c_rvol_samples'], 2)
            self.assertIsNone(doc['bear'][0]['c_rvol'])
            # Restart and duplicate replay must not inflate sample count.
            store = Store(root)
            store.enrich(cut, doc, candles)
            self.assertEqual(doc['bull'][0]['c_rvol_samples'], 2)
            store.enrich(datetime.fromisoformat('2026-11-09T09:20:00+05:30'), doc, candles)
            self.assertEqual(doc['bull'][0]['c_rvol_samples'], 3)
            self.assertEqual(doc['bull'][0]['c_rvol'], 1.8)

    def test_unavailable_and_zero_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'seed.json').write_text(json.dumps(dict(schema_version=1, symbols={'TEST': {'2026-11-05': {'09:15': 0}}})))
            doc = dict(bull=[dict(s='TEST', c_time='09:15'), dict(s='MISSING', c_time='09:15')])
            Store(root).enrich(datetime(2026, 11, 6, 9, 20), doc, {'TEST':dict(time='09:15', volume=50)})
            self.assertTrue(all(row['c_rvol'] is None for row in doc['bull']))


if __name__ == '__main__':
    unittest.main()
