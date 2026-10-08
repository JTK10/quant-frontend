import json
import tempfile
import unittest
from pathlib import Path
from kairos3_engine import (
    Trader, MODEL, ENGINE3_MODEL, ENGINE3_SUBMODEL, epoch, stamp,
    INITIAL_STOP_PCT, MAX_BID_ASK_SPREAD_PCT, STAGNANCY_MINUTES, STAGNANCY_THRESHOLD_PCT, TRAIL
)

DAY = '2026-10-05'
OPEN = epoch(DAY + 'T09:15:00+05:30')
CLOSE = epoch(DAY + 'T15:30:00+05:30')
NOW = epoch(DAY + 'T10:00:00+05:30')


def event(now=NOW, symbol='EXAMPLE', score=.8, **extra):
    e = dict(Event_ID=symbol+str(now), Event_Type='CONFIRMED_CLOSE', Confirmation_Status='CONFIRMED',
             Recovered=False, Date=DAY, Symbol=symbol, Side='BULL', Leg='CE', Strike=1000,
             Expiry='2026-10-27', Signal_Time='10:00', Issued_At=stamp(now),
             AI_Status='SCORED', AI_Model_ID=MODEL, AI_Score=score, AI_Scored_At=stamp(now),
             Pattern_Type='STANDARD', Pole_Move_Pct=2.0)
    return {**e, **extra}


def contract(**extra):
    base = dict(underlying='EXAMPLE', key='NSE_FO|12345', name='EXAMPLE 1000 CE 27 OCT 26',
                expiry='2026-10-27', strike=1000, leg='CE', lot_size=100, minimum_lot=100)
    base.update(extra)
    return base


def quote(now=NOW, ask=100, bid=98):
    return dict(key='NSE_FO|12345', quote_at=now, received_at=now, last_trade_at=now,
                asks=[dict(price=ask, quantity=1000)], bids=[dict(price=bid, quantity=1000)])


class Kairos3Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.trader = Trader(self.root, NOW - 100)

    def tearDown(self):
        self.tmp.cleanup()

    def entry(self, ask=100, bid=98):
        return self.trader.enter(event(), contract(), quote(NOW, ask=ask, bid=bid), NOW, OPEN, CLOSE)

    # -------------------------------------------------------------
    # Guard 1: -10% Initial Stop & Early Breakeven Ratchet
    # -------------------------------------------------------------
    def test_initial_stop_is_minus_10_percent(self):
        doc = self.entry(ask=100, bid=98)
        self.assertIsNotNone(doc)
        p = self.trader.state['position']
        self.assertEqual(p['stop_pct'], -10.0)
        self.assertEqual(p['stop_premium'], 90.0)

    def test_initial_stop_triggers_at_minus_10_percent(self):
        self.entry(ask=100, bid=98)
        # Drop to 89.5 trips -10% stop (premium <= 90.0)
        doc = self.trader.mark(quote(NOW + 300, bid=89.5), NOW + 300)
        self.assertIsNotNone(doc)
        self.assertEqual(doc['kind'], 'EXIT')
        self.assertEqual(doc['reason'], 'STOP_LOSS')
        self.assertTrue(doc['gain_pct'] <= -10.0)

    def test_ratchet_schedule_8_moves_stop_to_minus_4(self):
        self.entry(ask=100, bid=98)
        # Gain of +9% triggers ratchet at 8% -> stop moves from -10% to -4%
        self.trader.mark(quote(NOW + 300, bid=109), NOW + 300)
        p = self.trader.state['position']
        self.assertEqual(p['stop_pct'], -4.0)
        self.assertEqual(p['stop_premium'], 96.0)

    def test_ratchet_schedule_12_moves_stop_to_plus_2(self):
        self.entry(ask=100, bid=98)
        # Gain of +13% triggers ratchet at 12% -> stop moves to +2%
        self.trader.mark(quote(NOW + 300, bid=113), NOW + 300)
        p = self.trader.state['position']
        self.assertEqual(p['stop_pct'], 2.0)
        self.assertEqual(p['stop_premium'], 102.0)

    def test_ratchet_schedule_25_moves_stop_to_plus_15(self):
        self.entry(ask=100, bid=98)
        # Gain of +26% triggers ratchet at 25% -> stop moves to +15%
        self.trader.mark(quote(NOW + 300, bid=126), NOW + 300)
        p = self.trader.state['position']
        self.assertEqual(p['stop_pct'], 15.0)
        self.assertAlmostEqual(p['stop_premium'], 115.0, places=2)

    def test_ratchet_schedule_45_moves_stop_to_plus_30(self):
        self.entry(ask=100, bid=98)
        # Gain of +48% triggers ratchet at 45% -> stop moves to +30%
        self.trader.mark(quote(NOW + 300, bid=148), NOW + 300)
        p = self.trader.state['position']
        self.assertEqual(p['stop_pct'], 30.0)
        self.assertAlmostEqual(p['stop_premium'], 130.0, places=2)

    # -------------------------------------------------------------
    # Guard 2: 45-Minute Stagnancy Cut
    # -------------------------------------------------------------
    def test_stagnancy_exit_after_45_minutes_with_low_gain(self):
        self.entry(ask=100, bid=98)
        # After 46 minutes (2760 seconds), price is 101 (+1.0% < +2.0%) -> STAGNANCY_45M exit
        doc = self.trader.mark(quote(NOW + 2760, bid=101), NOW + 2760)
        self.assertIsNotNone(doc)
        self.assertEqual(doc['kind'], 'EXIT')
        self.assertEqual(doc['reason'], 'STAGNANCY_45M')
        self.assertEqual(doc['gain_pct'], 1.0)

    def test_stagnancy_does_not_exit_if_gain_at_least_2_percent(self):
        self.entry(ask=100, bid=98)
        # After 46 minutes, price is 103 (+3.0% >= +2.0%) -> remains open (emits MTM or None, not EXIT)
        doc = self.trader.mark(quote(NOW + 2760, bid=103), NOW + 2760)
        if doc:
            self.assertNotEqual(doc['kind'], 'EXIT')
        self.assertIsNotNone(self.trader.state['position'])

    def test_stagnancy_does_not_exit_before_45_minutes(self):
        self.entry(ask=100, bid=98)
        # At 30 minutes, gain is +0.5% (< 2%), but minutes < 45 -> remains open (not EXIT)
        doc = self.trader.mark(quote(NOW + 1800, bid=100.5), NOW + 1800)
        if doc:
            self.assertNotEqual(doc['kind'], 'EXIT')
        self.assertIsNotNone(self.trader.state['position'])

    # -------------------------------------------------------------
    # Guard 3: Max Bid-Ask Spread Filter (<= 6.0%)
    # -------------------------------------------------------------
    def test_rejects_spread_exceeding_6_percent(self):
        # ask=100, bid=93 -> spread = 7.0% > 6.0% -> rejected
        doc = self.trader.enter(event(), contract(), quote(NOW, ask=100, bid=93), NOW, OPEN, CLOSE)
        self.assertIsNone(doc)
        self.assertIsNone(self.trader.state['position'])
        self.assertFalse(self.trader.state['taken'])
        self.assertIn('Spread 7.0% exceeds max 6.0%', self.trader.state['status'])

    def test_accepts_spread_within_6_percent(self):
        # ask=100, bid=95 -> spread = 5.0% <= 6.0% -> accepted
        doc = self.trader.enter(event(), contract(), quote(NOW, ask=100, bid=95), NOW, OPEN, CLOSE)
        self.assertIsNotNone(doc)
        self.assertIsNotNone(self.trader.state['position'])
        self.assertEqual(self.trader.state['position']['bid_ask_spread_pct'], 5.0)

    # -------------------------------------------------------------
    # Candidate Selection Policy Updates
    # -------------------------------------------------------------
    def test_rejects_pole_move_over_3_point_5(self):
        e_exhaustion = event(Pole_Move_Pct=4.5)
        self.assertFalse(self.trader.eligible(e_exhaustion, NOW, OPEN, CLOSE))

    def test_accepts_pole_move_under_3_point_5(self):
        e_valid = event(Pole_Move_Pct=2.8)
        self.assertTrue(self.trader.eligible(e_valid, NOW, OPEN, CLOSE))

    def test_accepts_single_lot_up_to_35k_budget(self):
        # Price 330 * 100 lot = Rs 33,000 (exceeds 30,000, but fits <= 35,000 single lot)
        doc = self.trader.enter(event(), contract(lot_size=100, minimum_lot=100),
                                quote(NOW, ask=330, bid=325), NOW, OPEN, CLOSE)
        self.assertIsNotNone(doc)
        self.assertEqual(self.trader.state['position']['lots'], 1)
        self.assertEqual(self.trader.state['position']['capital_used'], 33000.0)

    def test_defers_tier_0_1_patterns_before_10am_unless_score_80(self):
        early_time = epoch(DAY + 'T09:50:00+05:30')
        trader_early = Trader(self.root / 'early', early_time - 100)
        e_weak = event(now=early_time, Issued_At=stamp(early_time), Signal_Time='09:50',
                       Pattern_Type='REVERSE_POLE', AI_Score=0.74)
        cands = trader_early.candidates([e_weak], early_time, OPEN, CLOSE)
        self.assertEqual(cands, [])

        e_strong = event(now=early_time, Issued_At=stamp(early_time), Signal_Time='09:50',
                         Pattern_Type='REVERSE_POLE', AI_Score=0.82)
        cands_strong = trader_early.candidates([e_strong], early_time, OPEN, CLOSE)
        self.assertEqual(len(cands_strong), 1)


if __name__ == '__main__':
    unittest.main()
