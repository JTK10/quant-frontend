import ast
import copy
import json
import tempfile
import unittest
from pathlib import Path
from kairos2_engine import Trader, MODEL, epoch, stamp, buy_size, quote_valid

DAY = '2026-10-05'
OPEN = epoch(DAY + 'T09:15:00+05:30')
CLOSE = epoch(DAY + 'T15:30:00+05:30')
NOW = epoch(DAY + 'T10:00:00+05:30')


def event(now=NOW, symbol='EXAMPLE', score=.8, **extra):
    e = dict(Event_ID=symbol+str(now), Event_Type='CONFIRMED_CLOSE', Confirmation_Status='CONFIRMED',
             Recovered=False, Date=DAY, Symbol=symbol, Side='BULL', Leg='CE', Strike=1000,
             Expiry='2026-10-27', Signal_Time='10:00', Issued_At=stamp(now),
             AI_Status='SCORED', AI_Model_ID=MODEL, AI_Score=score, AI_Scored_At=stamp(now))
    return {**e, **extra}


def contract(**extra):
    return dict(underlying='EXAMPLE', key='NSE_FO|12345', name='EXAMPLE 1000 CE 27 OCT 26',
                expiry='2026-10-27', strike=1000, leg='CE', lot_size=100, minimum_lot=100, **extra)


def quote(now=NOW, ask=100, bid=99):
    return dict(key='NSE_FO|12345', quote_at=now, received_at=now, last_trade_at=now,
                asks=[dict(price=ask, quantity=1000)], bids=[dict(price=bid, quantity=1000)])


class CausalPaperTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.trader = Trader(self.root, NOW - 100)

    def tearDown(self):
        self.tmp.cleanup()

    def entry(self):
        return self.trader.enter(event(), contract(), quote(), NOW, OPEN, CLOSE)

    def test_accepts_current_pallas_model_and_rejects_previous_model(self):
        model_path = Path(__file__).parent.parent / 'pallas' / 'pallas_ai_model.json'
        self.assertEqual(MODEL, json.loads(model_path.read_text())['model_id'])
        self.assertTrue(self.trader.eligible(event(), NOW, OPEN, CLOSE))
        previous = event(AI_Model_ID='poleflag-lgb-2201fff7d915-compat-v1')
        self.assertFalse(self.trader.eligible(previous, NOW, OPEN, CLOSE))

    def test_model_change_preserves_previous_trade_and_daily_lock(self):
        self.entry()
        previous_model = 'poleflag-lgb-2201fff7d915-compat-v1'
        self.trader.state['position']['model_id'] = previous_model
        self.trader.state['pending'][0]['model_id'] = previous_model
        self.trader.save()
        restarted = Trader(self.root, NOW + 1)
        self.assertEqual(restarted.state['position']['model_id'], previous_model)
        self.assertEqual(restarted.state['pending'][0]['model_id'], previous_model)
        restarted.mark(quote(NOW + 5, bid=80), NOW + 5)
        self.assertIsNone(restarted.state['position'])
        self.assertTrue(restarted.state['taken'])
        self.assertEqual(restarted.candidates([event(NOW + 10)], NOW + 10, OPEN, CLOSE), [])

    def test_does_not_use_a_later_high_score_to_trade_an_earlier_low_score(self):
        past = event(NOW-10, score=.5)
        future = event(NOW+60, 'LATER', .99)
        self.assertEqual(self.trader.candidates([past,future],NOW,OPEN,CLOSE),[])
        self.assertIsNone(self.trader.state['position'])

    def test_first_available_signal_and_same_issue_score_tiebreak(self):
        a,b,c = event(NOW,'A',.71),event(NOW,'B',.91),event(NOW+10,'C',1)
        self.assertEqual([x['Symbol'] for x in self.trader.candidates([c,a,b],NOW,OPEN,CLOSE)],['B','A'])

    def test_invalid_unconfirmed_recovered_or_stale_signals(self):
        invalid = [dict(Event_Type='EARLY_TICK'),dict(Recovered=True),dict(AI_Status='AWAITING_CONFIRMATION'),
                   dict(AI_Score=None),dict(AI_Score=True),dict(AI_Score=float('nan')),
                   dict(AI_Score=1.1),dict(AI_Model_ID='new-unreviewed'),dict(Leg='PE'),
                   dict(Date='2026-10-01'),dict(Expiry='2026-10-01'),dict(AI_Scored_At=stamp(NOW+5)),
                   dict(Issued_At=stamp(NOW-91)),dict(Issued_At=stamp(NOW-200))]
        for change in invalid:
            with self.subTest(change=change):
                self.assertFalse(self.trader.eligible(event(**change),NOW,OPEN,CLOSE))

    def test_preboot_event_is_not_replayed_after_restart(self):
        self.assertFalse(Trader(self.root,NOW+1).eligible(event(),NOW+2,OPEN,CLOSE))

    def test_entry_cutoff_and_calendar_gate(self):
        self.assertFalse(self.trader.eligible(event(),NOW,NOW+1,CLOSE))
        t=epoch(DAY+'T11:30:00+05:30')
        self.assertFalse(self.trader.eligible(event(t),t,OPEN,CLOSE))

    def test_quote_ms_and_offset_are_absolute_instants(self):
        self.assertEqual(epoch(NOW*1000),NOW)
        self.assertEqual(epoch('2026-10-05T04:30:00Z'),NOW)
        with self.assertRaises(ValueError): epoch('2026-10-05T10:00:00')
        self.assertAlmostEqual(epoch('2026-10-05T10:00:00.25+05:30'),NOW+.25)
        self.assertAlmostEqual(epoch('2026-10-05T10:00:00.123456789+05:30'),NOW+.123456)

    def test_previous_session_book_or_future_last_trade_is_rejected(self):
        for v in [NOW+1,NOW-86400,None]:
            q=quote();q['last_trade_at']=v
            self.assertFalse(quote_valid(q,NOW,'NSE_FO|12345'))

    def test_stale_future_wrong_instrument_quotes_cannot_enter(self):
        for field,value in [('quote_at',NOW-31),('quote_at',NOW+1),('received_at',NOW+1),('key','wrong')]:
            q=quote();q[field]=value
            self.assertFalse(quote_valid(q,NOW,'NSE_FO|12345'))
            self.assertIsNone(self.trader.enter(event(),contract(),q,NOW,OPEN,CLOSE))

    def test_exact_pallas_contract_only(self):
        c=contract();c['expiry']='2026-11-24'
        self.assertIsNone(self.trader.enter(event(),c,quote(),NOW,OPEN,CLOSE))
        self.assertIsNone(self.trader.state['position'])

    def test_entry_sweeps_only_quoted_depth_with_whole_lots_within_capital(self):
        q=quote();q['asks']=[dict(price=100,quantity=150),dict(price=110,quantity=150)]
        doc=self.trader.enter(event(),contract(),q,NOW,OPEN,CLOSE)
        self.assertEqual(doc['quantity'],200)
        self.assertEqual(doc['lots'],2)
        self.assertEqual(doc['entry'],102.5)
        self.assertEqual(doc['capital_used'],20500)

    def test_unaffordable_one_lot_is_skipped_and_not_clamped(self):
        q=quote(ask=400,bid=390)
        self.assertIsNone(self.trader.enter(event(),contract(),q,NOW,OPEN,CLOSE))
        self.assertFalse(self.trader.state['taken'])
        self.assertEqual(self.trader.state['pending'][-1]['kind'],'SKIP')
        self.assertEqual(self.trader.candidates([event()],NOW+1,OPEN,CLOSE),[])

    def test_missing_or_invalid_lot_and_empty_ask_depth(self):
        self.assertIsNone(buy_size(quote(),0,100))
        self.assertIsNone(buy_size(quote(),True,100))
        q=quote();q['asks']=[]
        self.assertIsNone(buy_size(q,100,100))

    def test_insufficient_bid_depth_does_not_fabricate_entry(self):
        q=quote();q['bids']=[dict(price=99,quantity=50)]
        self.assertIsNone(self.trader.enter(event(),contract(),q,NOW,OPEN,CLOSE))

    def test_initial_stop_exits_at_observed_bid_not_ideal_threshold(self):
        self.entry()
        doc=self.trader.mark(quote(NOW+5,bid=80),NOW+5)
        self.assertEqual(doc['reason'],'STOP_LOSS')
        self.assertEqual(doc['entry'],80)
        self.assertEqual(doc['pnl'],-6000)
        self.assertIsNone(self.trader.state['position'])

    def test_trailing_stop_survives_restart_and_uses_actual_quote(self):
        self.entry()
        self.trader.mark(quote(NOW+5,ask=141,bid=140),NOW+5)
        restarted=Trader(self.root,NOW+6)
        self.assertEqual(restarted.state['position']['stop_pct'],25)
        doc=restarted.mark(quote(NOW+10,ask=121,bid=120),NOW+10)
        self.assertEqual(doc['reason'],'TRAILING_STOP')
        self.assertEqual(doc['entry'],120)

    def test_trailing_tiers_and_no_stop_lowering(self):
        self.entry()
        for n,stop in [(115,2),(125,15),(140,25),(160,40),(200,70)]:
            t=NOW+n
            self.trader.mark(quote(t,ask=n+1,bid=n),t)
            self.assertEqual(self.trader.state['position']['stop_pct'],stop)
        self.trader.mark(quote(NOW+201,ask=191,bid=190),NOW+201)
        self.assertEqual(self.trader.state['position']['stop_pct'],70)

    def test_time_exit_1130_at_fresh_quote(self):
        self.entry();t=epoch(DAY+'T11:30:00+05:30')
        doc=self.trader.mark(quote(t,ask=106,bid=105),t)
        self.assertEqual(doc['reason'],'TIME_EXIT_1130')
        self.assertEqual(doc['pnl'],1500)

    def test_daily_limit_even_after_exit_and_restart(self):
        self.entry();self.trader.mark(quote(NOW+5,bid=80),NOW+5)
        restarted=Trader(self.root,NOW+6)
        self.assertEqual(restarted.candidates([event(NOW+10)],NOW+10,OPEN,CLOSE),[])
        self.assertEqual(sum(d['kind']=='ENTRY' for d in restarted.state['pending']),1)

    def test_missing_exit_depth_keeps_position_for_recovery(self):
        self.entry();q=quote(NOW+5);q['bids']=[]
        self.assertIsNone(self.trader.mark(q,NOW+5))
        self.assertIsNotNone(Trader(self.root,NOW+6).state['position'])

    def test_midnight_does_not_erase_overdue_position(self):
        self.entry();t=epoch('2026-10-06T00:00:00+05:30')
        self.trader.roll(t)
        self.assertIsNotNone(self.trader.state['position'])
        self.assertEqual(self.trader.candidates([event(t,Date='2026-10-06')],t,t,t+600),[])
        later=epoch('2026-10-06T09:15:00+05:30')
        doc=self.trader.mark(quote(later,bid=95),later)
        self.assertEqual(doc['reason'],'OVERDUE_TIME_EXIT')
        self.assertEqual(doc['sig_date'],'20261005')
        self.assertEqual(doc['exit_at'],'2026-10-06T09:15:00+05:30')

    def test_restart_retains_unpublished_entry_without_second_trade(self):
        doc=self.entry();r=Trader(self.root,NOW+1)
        self.assertEqual(r.state['pending'][0]['Doc_ID'],doc['Doc_ID'])
        self.assertEqual(r.state['position']['signal_id'],doc['signal_id'])

    def test_corrupt_saved_state_fails_closed(self):
        self.trader.path.write_text('broken')
        with self.assertRaises(ValueError): Trader(self.root,NOW)

    def test_only_paper_source_and_no_broker_order_calls_exist(self):
        self.entry()
        self.assertTrue(all(d['source']=='kairos2' and d['mode']=='paper' for d in self.trader.state['pending']))
        source=Path(__file__).with_name('kairos2_live.py').read_text()
        tree=ast.parse(source)
        broker=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Broker')
        strings=[n.value for n in ast.walk(broker) if isinstance(n,ast.Constant) and isinstance(n.value,str)]
        self.assertNotIn('POST',strings)
        self.assertFalse(any('/order' in s for s in strings))


if __name__ == '__main__': unittest.main()
