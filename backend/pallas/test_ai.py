import copy
import json
import unittest
from pathlib import Path

from pallas_ai import Scorer

DATA = Path(__file__).resolve().parents[2] / 'quant-radar/data/pallas'


class AITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scorer = Scorer()
        cls.events = [e for p in sorted(DATA.glob('*.json')) for d in json.loads(p.read_text(encoding='utf-8'))
                      if d['kind'] == 'CONFIRMED' for e in d.get('signals', [])]

    def test_frozen_corrected_scores(self):
        self.assertEqual(len(self.events), 136)
        counts = {}
        for event in self.events:
            score = self.scorer.score(event)
            self.assertAlmostEqual(score, event['AI_Score'], places=12)
            self.assertEqual(event['AI_Model_ID'], self.scorer.model_id)
            day = event['Date']
            counts.setdefault(day, 0)
            counts[day] += score >= .70
        self.assertEqual(counts, {'2026-09-25': 4, '2026-09-28': 44,
                                 '2026-09-29': 1, '2026-09-30': 2, '2026-10-01': 3})

    def test_future_outcomes_cannot_change_score(self):
        for event in self.events:
            mutated = dict(event, Quote_1130=99999, Sampled_MFE_Pct=-99999,
                           Gain_Pct=99999, AI_Score=1, TM_Score=99999,
                           Confirmation_At='2099-01-01T15:30:00+05:30')
            self.assertEqual(self.scorer.score(event), self.scorer.score(mutated))

    def test_early_alert_is_unscored(self):
        event = self.events[0]
        annotation = self.scorer.annotation(event, 'EARLY_TICK', event['Issued_At'])
        self.assertIsNone(annotation['AI_Score'])
        self.assertIsNone(annotation['AI_Scored_At'])
        self.assertEqual(annotation['AI_Status'], 'AWAITING_CONFIRMATION')

    def test_missing_required_feature_does_not_invent_score(self):
        event = copy.deepcopy(self.events[0])
        del event['Pole_Move_Pct']
        annotation = self.scorer.annotation(event, 'CONFIRMED_CLOSE', event['Issued_At'])
        self.assertIsNone(annotation['AI_Score'])
        self.assertEqual(annotation['AI_Status'], 'FEATURES_UNAVAILABLE')

    def test_nullable_wall_training_imputation(self):
        event = copy.deepcopy(self.events[0])
        event.update(Intraday_Wall_Buildup_Pct=None, Intraday_Wall_OI_Added=None,
                     Line_Respect=None)
        self.assertTrue(0 <= self.scorer.score(event) <= 1)

    def test_unknown_category_or_nonfinite_is_unscored(self):
        for field, value in [('Flow_Type', 'unseen'), ('Volume_Share_Pct', float('nan'))]:
            event = dict(self.events[0], **{field: value})
            self.assertIsNone(self.scorer.annotation(event, 'CONFIRMED_CLOSE', event['Issued_At'])['AI_Score'])


if __name__ == '__main__':
    unittest.main()
