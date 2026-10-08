import copy
import json
import tempfile
import unittest
from pathlib import Path

from rusty_engine import Trader, SOURCE, epoch, stamp
from rusty_signals import snapshot_events, select_contract

DAY = '2026-10-08'
OPEN = epoch(DAY + 'T09:15:00+05:30')
CLOSE = epoch(DAY + 'T15:30:00+05:30')
CUT = epoch(DAY + 'T09:30:00+05:30')
NOW = CUT + 10


def row(symbol='EXAMPLE', bear=False, strength=30):
    return dict(s=symbol, entry_confirmed=True, brk=True, conviction='HIGH',
                flow_type='CE_UP_PE_DOWN' if bear else 'CE_DOWN_PE_UP',
                flow_label='Test OI classification', ce_pct=strength if bear else -5,
                pe_pct=-5 if bear else strength, rusty_pct=strength, rusty_rank=1,
                mv=-1 if bear else 1, c_time='09:25', c_open=101 if bear else 100,
                c_high=101.1, c_low=99.9, c_close=100 if bear else 101,
                candle_tier='MARUBOZU')


def snapshot(**extra):
    return dict(source='rusty', date=DAY, sig_date='20261008', cut='09:30', ts=NOW,
                bull=[row()], bear=[], **extra)


def event(bear=False):
    d = snapshot()
    if bear:
        d.update(bull=[], bear=[row(bear=True)])
    return snapshot_events([d], NOW, OPEN)[0]


def contract(bear=False):
    return dict(underlying='EXAMPLE', key='NSE_FO|123', name='EXAMPLE OPTION',
                expiry='2026-10-27', strike=99 if bear else 102, leg='PE' if bear else 'CE',
                lot_size=100, minimum_lot=100)


def quote(now=NOW, bid=99, ask=100, quantity=1000):
    return dict(key='NSE_FO|123', quote_at=now, received_at=now, last_trade_at=now,
                asks=[dict(price=ask, quantity=quantity)], bids=[dict(price=bid, quantity=quantity)])


class RustyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.trader = Trader(self.root, OPEN)

    def tearDown(self):
        self.tmp.cleanup()

    def enter(self):
        return self.trader.enter(event(), contract(), quote(), NOW, OPEN, CLOSE)

    def test_bull_and_bear_confirmed_labels_enter_without_ai(self):
        for bear in (False, True):
            with tempfile.TemporaryDirectory() as root:
                t = Trader(root, OPEN)
                e = event(bear)
                self.assertNotIn('AI_Score', e)
                doc = t.enter(e, contract(bear), quote(), NOW, OPEN, CLOSE)
                self.assertEqual(doc['source'], SOURCE)
                self.assertEqual(doc['leg'], 'PE' if bear else 'CE')
                self.assertEqual(doc['signal_source'], 'rusty')
                self.assertNotIn('ai_score', doc)
                self.assertEqual(doc['quantity'], 300)
                self.assertEqual(doc['stop_premium'], 85)

    def test_flags_are_strict_and_wrong_flow_rejected(self):
        for field, values in {'entry_confirmed': [False, 'true', 1, None], 'brk': [False, 'true'],
                              'conviction': ['LOW', None], 'flow_type': ['NEUTRAL', 'CE_OI_BUILD']}.items():
            for value in values:
                d = snapshot(); d['bull'][0][field] = value
                with self.subTest(field=field, value=value):
                    self.assertEqual(snapshot_events([d], NOW, OPEN), [])

    def test_missing_wrong_or_forming_cash_candle_rejected(self):
        for changes in [dict(c_time='09:30'), dict(c_time=None), dict(c_high=100.5),
                        dict(c_open=101, c_close=100), dict(c_close=float('nan')),
                        dict(c_high=110), dict(c_low=None)]:
            d = snapshot(); d['bull'][0].update(changes)
            self.assertEqual(snapshot_events([d], NOW, OPEN), [])

    def test_missing_invalid_or_inconsistent_oi_rejected(self):
        for changes in [dict(ce_pct=None), dict(pe_pct=float('inf')), dict(rusty_pct=True),
                        dict(rusty_pct=50), dict(rusty_rank=0), dict(mv=-1)]:
            d = snapshot(); d['bull'][0].update(changes)
            self.assertEqual(snapshot_events([d], NOW, OPEN), [])

    def test_future_stale_preboot_replay_and_wrong_day_rejected(self):
        for field, value in [('ts', NOW+1), ('ts', CUT-1), ('date', '2026-10-07'),
                             ('sig_date', '20261007'), ('source', 'pallas'), ('replay', True),
                             ('degraded', True), ('cut', '09:31')]:
            d = snapshot(); d[field] = value
            self.assertEqual(snapshot_events([d], NOW, OPEN), [])
        self.assertEqual(snapshot_events([snapshot()], NOW+91, OPEN), [])
        self.assertEqual(snapshot_events([snapshot()], NOW, NOW+1), [])
        d = snapshot(); d['ts'] = CUT+181
        self.assertEqual(snapshot_events([d], CUT+181, OPEN), [])

    def test_newest_invalid_board_does_not_revive_older_signal(self):
        old = snapshot(); old['ts'] -= 1
        new = snapshot(); new['bull'][0]['entry_confirmed'] = False
        self.assertEqual(snapshot_events([old, new], NOW, OPEN), [])

    def test_duplicate_symbol_and_cross_board_conflict_rejected(self):
        for both in (True, False):
            d = snapshot()
            if both:
                d['bear'] = [row(bear=True)]
            else:
                d['bull'].append(row())
            self.assertEqual(snapshot_events([d], NOW, OPEN), [])

    def test_rank_same_cut_by_absolute_rusty_not_price_or_signed_value(self):
        d = snapshot()
        a, b, c = row('A', strength=25), row('B', strength=40), row('C', strength=55)
        c.update(ce_pct=-55, pe_pct=5, rusty_pct=-55)
        d['bull'] = [a, b, c]
        events = snapshot_events([d], NOW, OPEN)
        self.assertEqual([e['Symbol'] for e in self.trader.candidates(events, NOW, OPEN, CLOSE)], ['C', 'B', 'A'])

    def test_signal_ids_stable_across_republication(self):
        d = snapshot(); e = event()
        d['ts'] += 1
        self.assertEqual(snapshot_events([d], NOW+1, OPEN)[0]['Event_ID'], e['Event_ID'])

    def test_daily_lock_restart_exit_and_no_second_trade(self):
        self.enter()
        t = Trader(self.root, NOW+1)
        self.assertEqual(t.state['position']['flow_type'], 'CE_DOWN_PE_UP')
        self.assertEqual(t.candidates([event()], NOW+1, OPEN, CLOSE), [])
        doc = t.mark(quote(NOW+5, bid=80), NOW+5)
        self.assertEqual(doc['reason'], 'STOP_LOSS')
        self.assertEqual(doc['entry'], 80)
        self.assertEqual(doc['pnl'], -6000)
        self.assertTrue(t.state['taken'])
        self.assertIsNone(t.state['position'])
        self.assertEqual(Trader(self.root, NOW+10).candidates([event()], NOW+10, OPEN, CLOSE), [])

    def test_bid_peak_trail_persists_and_gapped_exit_uses_observed_depth(self):
        self.enter()
        self.trader.mark(quote(NOW+5, bid=125), NOW+5)
        t = Trader(self.root, NOW+6)
        self.assertEqual(t.state['position']['stop_pct'], 15)
        doc = t.mark(quote(NOW+10, bid=109), NOW+10)
        self.assertEqual(doc['reason'], 'TRAILING_STOP')
        self.assertEqual(doc['entry'], 109)
        self.assertEqual(doc['pnl'], 2700)

    def test_time_exit_and_missing_bid_does_not_fabricate_fill(self):
        self.enter()
        cutoff = epoch(DAY+'T11:30:00+05:30')
        q = quote(cutoff); q['bids'] = []
        self.assertIsNone(self.trader.mark(q, cutoff))
        self.assertIsNotNone(self.trader.state['position'])
        doc = self.trader.mark(quote(cutoff+5, bid=105), cutoff+5)
        self.assertEqual(doc['reason'], 'TIME_EXIT_1130')
        self.assertEqual(doc['pnl'], 1500)

    def test_entry_expiry_leg_contract_quote_and_budget_guards(self):
        for field, value in [('underlying', 'OTHER'), ('expiry', '2026-10-09'),
                             ('strike', 99), ('leg', 'PE'), ('key', 'NSE_EQ|123')]:
            c = contract(); c[field] = value
            self.assertIsNone(self.trader.enter(event(), c, quote(), NOW, OPEN, CLOSE))
        for changes in [dict(key='NSE_FO|wrong'), dict(quote_at=NOW-31), dict(received_at=NOW+1),
                        dict(last_trade_at=None), dict(bids=[])]:
            q = quote(); q.update(changes)
            self.assertIsNone(self.trader.enter(event(), contract(), q, NOW, OPEN, CLOSE))
        with tempfile.TemporaryDirectory() as root:
            t = Trader(root, OPEN)
            self.assertIsNone(t.enter(event(), contract(), quote(ask=301, bid=300), NOW, OPEN, CLOSE))

    def test_whole_lots_and_multilevel_bid_ask_accounting(self):
        q = quote(); q.update(asks=[dict(price=100, quantity=100), dict(price=102, quantity=200)],
                              bids=[dict(price=99, quantity=100), dict(price=98, quantity=200)])
        doc = self.trader.enter(event(), contract(), q, NOW, OPEN, CLOSE)
        self.assertEqual(doc['quantity'], 200)
        self.assertEqual(doc['capital_used'], 20200)
        mark = self.trader.mark(q, NOW+1)
        self.assertEqual(mark['entry'], 98.5)
        self.assertEqual(mark['pnl'], -500)

    def test_new_day_retains_overdue_position_and_prevents_new_entry(self):
        self.enter()
        tomorrow = NOW + 86400
        self.trader.roll(tomorrow)
        self.assertIsNotNone(self.trader.state['position'])
        self.assertEqual(self.trader.state['status'], 'Previous-session exit pending')
        self.assertEqual(self.trader.candidates([], tomorrow, OPEN+86400, CLOSE+86400), [])

    def test_corrupt_state_and_other_engine_state_fail_closed(self):
        self.trader.path.write_text('{broken')
        with self.assertRaises(json.JSONDecodeError): Trader(self.root, NOW)
        self.trader.path.write_text(json.dumps(dict(schema=1, engine='kairos2-paper-1')))
        with self.assertRaises(ValueError): Trader(self.root, NOW)

    def test_health_and_outbox_isolated_and_restart_keeps_doc_ids(self):
        self.enter()
        h = self.trader.health(NOW)
        self.assertEqual(h['signal_source'], 'rusty')
        self.assertNotIn('ai_threshold', h)
        self.assertTrue(all(d['source'] == SOURCE for d in self.trader.state['pending']))
        ids = [d['Doc_ID'] for d in self.trader.state['pending']]
        self.assertEqual([d['Doc_ID'] for d in Trader(self.root, NOW+1).state['pending']], ids)

    def test_market_window_and_causal_quote_after_signal(self):
        self.assertFalse(self.trader.eligible(event(), NOW, NOW+1, CLOSE))
        self.assertFalse(self.trader.eligible(event(), CLOSE, OPEN, CLOSE))
        self.assertIsNone(self.trader.enter(event(), contract(), quote(NOW-1), NOW, OPEN, CLOSE))


class ContractSelectionTests(unittest.TestCase):
    def rows(self, leg):
        return [dict(segment='NSE_FO', underlying_key='NSE_EQ|EX', underlying_symbol='EXAMPLE',
                     instrument_type=leg, instrument_key=f'NSE_FO|{strike}-{expiry}',
                     trading_symbol='EXAMPLE OPTION', expiry=expiry, strike_price=strike,
                     lot_size=100, minimum_lot=100)
                for expiry in ('2026-10-09', '2026-10-27', '2026-11-24') for strike in (99, 100, 101, 102, 103)]

    def test_nearest_eligible_expiry_and_first_strictly_otm_both_sides(self):
        for bear in (False, True):
            c = select_contract(self.rows('PE' if bear else 'CE'), event(bear), 'NSE_EQ|EX')
            self.assertEqual(c['expiry'], '2026-10-27')
            self.assertEqual(c['strike'], 99 if bear else 102)

    def test_wrong_underlying_missing_or_duplicate_contract_fails(self):
        with self.assertRaises(ValueError): select_contract(self.rows('CE'), event(), 'NSE_EQ|WRONG')
        with self.assertRaises(ValueError): select_contract([], event(), 'NSE_EQ|EX')
        rows = self.rows('CE')
        rows += copy.deepcopy(rows)
        with self.assertRaises(ValueError): select_contract(rows, event(), 'NSE_EQ|EX')


if __name__ == '__main__':
    unittest.main()
