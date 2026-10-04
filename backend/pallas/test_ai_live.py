import copy
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from pallas_live import State


class AILiveTests(unittest.TestCase):
    def sample(self):
        path = Path(__file__).resolve().parents[2] / 'quant-radar/data/pallas/2026-10-01.json'
        return next(e for d in json.loads(path.read_text(encoding='utf-8'))
                    if d['kind'] == 'CONFIRMED' for e in d['signals'])

    def test_score_freezes_across_duplicate_and_restart(self):
        event = self.sample()
        issued = datetime.fromisoformat(event['Issued_At']).timestamp()
        with tempfile.TemporaryDirectory() as tmp:
            state = State(Path(tmp)); state.start_day(event['Date'])
            first = state.accept_event(event, 'CONFIRMED_CLOSE', issued, issued, issued)
            frozen = copy.deepcopy(first)
            mutated = dict(event, Volume_Share_Pct=9999, AI_Score=1)
            second = state.accept_event(mutated, 'CONFIRMED_CLOSE', issued + 300, issued + 300, issued + 300)
            self.assertEqual(second, frozen)
            recovered = State(Path(tmp)); recovered.start_day(event['Date'])
            self.assertEqual(recovered.events[first['Event_ID']], frozen)

    def test_early_and_confirmation_have_separate_score_and_quote(self):
        event = self.sample()
        issued = datetime.fromisoformat(event['Issued_At']).timestamp()
        with tempfile.TemporaryDirectory() as tmp:
            state = State(Path(tmp)); state.start_day(event['Date'])
            early = state.accept_event(event, 'EARLY_TICK', issued - 60, issued - 300, issued - 300)
            self.assertIsNone(early['AI_Score'])
            close = state.accept_event(event, 'CONFIRMED_CLOSE', issued, issued, issued)
            self.assertIsNotNone(close['AI_Score'])
            self.assertIsNone(early['AI_Score'])
            self.assertEqual(close['AI_Scored_At'], close['Issued_At'])

    def test_model_unavailable_preserves_base_signal(self):
        event = self.sample()
        issued = datetime.fromisoformat(event['Issued_At']).timestamp()
        with tempfile.TemporaryDirectory() as tmp:
            state = State(Path(tmp)); state.start_day(event['Date']); state.ai = None
            accepted = state.accept_event(event, 'CONFIRMED_CLOSE', issued, issued, issued)
            self.assertEqual(accepted['Symbol'], event['Symbol'])
            self.assertIsNone(accepted['AI_Score'])
            self.assertEqual(accepted['AI_Status'], 'MODEL_UNAVAILABLE')


if __name__ == '__main__':
    unittest.main()
