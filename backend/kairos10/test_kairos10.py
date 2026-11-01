import asyncio
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from kairos10_engine import Trader,MODEL,epoch,stamp,native
from kairos10_features import vector,entry_hold,Features,save
from kairos10_live import Publisher
from scorer import Scorer

HERE=Path(__file__).parent
FIXTURE=HERE/'feature_parity_fixtures.json'


def instant(clock='10:05'):return epoch('2026-11-02T'+clock+':00+05:30')


def event():
    return dict(Date='2026-11-02',Symbol='TEST',Side='BULL',Expiry='2026-11-23',Strike=100.,Leg='CE',
        Event_ID='test-unique',AI_Model_ID=MODEL,AI_Score=.4,Signal_Time='10:00',
        Issued_At=stamp(instant('10:00')+1),AI_Scored_At=stamp(instant('10:00')+2),Armed_At=stamp(instant('10:00')+2),
        Entry_Due_At=stamp(instant()),ConfirmedPullback=True,Recovered=False,Feature_SHA256='a'*64,
        Entry_Base=100.,entry_hold_passed=True)


def quote(now=None,bid=9.9,ask=10.):
    now=instant()+5 if now is None else now
    return dict(key='option',quote_at=now,received_at=now,last_trade_at=now,
        bids=[dict(price=bid,quantity=100000)],asks=[dict(price=ask,quantity=100000)])


CONTRACT=dict(underlying='TEST',key='option',name='TEST100CE',expiry='2026-11-23',leg='CE',strike=100.,lot_size=100,minimum_lot=100)


class KairosTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.t=Trader(self.root,instant('09:15'));self.e=event();self.t.state['intents']=[self.e]
        self.opening=instant('09:15');self.closing=instant('15:30')
    def tearDown(self):self.temp.cleanup()

    def enter(self):return self.t.enter(self.e,CONTRACT,quote(),instant()+5,self.opening,self.closing)

    def test_next_cut_fresh_paper_entry_and_lock(self):
        self.assertFalse(self.t.eligible(self.e,instant()-1,self.opening,self.closing))
        doc=self.enter();self.assertEqual(doc['source'],'kairos10');self.assertEqual(doc['model_id'],MODEL)
        self.assertEqual(doc['side'],'LONG');self.assertEqual(doc['quantity']%100,0)
        self.assertLessEqual(doc['capital_used'],native.BUDGET)
        self.assertTrue(self.t.state['taken']);self.assertIsNone(self.enter())

    def test_no_pallas_or_sector_model_or_fake_score(self):
        for field,value in [('AI_Model_ID','pallas-any'),('AI_Score',.29),('AI_Score',True),('ConfirmedPullback',False),('Recovered',True)]:
            e=dict(self.e,**{field:value});self.t.state['intents']=[e]
            self.assertFalse(self.t.eligible(e,instant()+1,self.opening,self.closing))

    def test_deadline_and_unarmed_or_retimed_signal_rejected(self):
        self.assertFalse(self.t.eligible(self.e,instant()+91,self.opening,self.closing))
        bad=dict(self.e,Issued_At=stamp(instant()+1))
        self.assertFalse(self.t.eligible(bad,instant()+5,self.opening,self.closing))
        self.t.state['intents']=[];self.assertFalse(self.t.eligible(self.e,instant()+5,self.opening,self.closing))

    def test_restart_preserves_position_daily_lock_and_outbox(self):
        self.enter();pending=copy.deepcopy(self.t.state['pending'])
        restarted=Trader(self.root,instant()+20)
        self.assertTrue(restarted.state['taken']);self.assertEqual(restarted.state['pending'],pending)
        self.assertIsNotNone(restarted.state['position']);self.assertEqual(restarted.state['intents'],[])

    def test_restart_cancels_pending_not_filled_trade(self):
        self.t.save();restarted=Trader(self.root,instant('10:02'))
        self.assertFalse(restarted.state['taken']);self.assertEqual(restarted.state['intents'],[])

    def test_whole_lot_depth_and_stale_quotes(self):
        q=quote();q['received_at']-=40;q['quote_at']-=40
        self.assertIsNone(self.t.enter(self.e,CONTRACT,q,instant()+5,self.opening,self.closing))
        contract=dict(CONTRACT,lot_size=10000,minimum_lot=10000)
        self.assertIsNone(self.t.enter(self.e,contract,quote(),instant()+5,self.opening,self.closing))
        self.assertFalse(self.t.state['taken'])

    def test_native_stop_actual_observed_bid(self):
        self.enter();now=instant()+10
        exitdoc=self.t.mark(quote(now,bid=8.,ask=8.1),now)
        self.assertEqual(exitdoc['kind'],'EXIT');self.assertEqual(exitdoc['entry'],8.)
        self.assertEqual(exitdoc['source'],'kairos10');self.assertTrue(self.t.state['taken'])

    def test_native_runner_1529_and_pending_depth(self):
        self.enter();now=instant('10:10')
        self.t.mark(quote(now,bid=12.5,ask=12.6),now)
        later=instant('15:29');q=quote(later,bid=12.4,ask=12.5)
        doc=self.t.mark(q,later);self.assertEqual(doc['reason'],'RUNNER_EOD_EXIT')

    def test_health_correct_model_and_threshold(self):
        h=self.t.health(instant()+5)
        self.assertEqual(h['ai_threshold'],.3);self.assertEqual(h['accepted_model_ids'],[MODEL])
        self.assertEqual(h['runner_exit_buffer_seconds'],60)
        self.assertEqual(self.t.state['pending'][-1]['source'],'kairos10')

    def test_exact_entry_capture_price_hold(self):
        due=instant();p=dict(date='2026-11-02',cut='10:05',exported_at=due+2,expiry='2026-11-23',degraded=False,
            candles={},chains={},quotes={},baselines={'TEST':{'spot':101}},chain_received={'TEST':due+1})
        self.assertTrue(entry_hold(self.e,p,due+5))
        p['baselines']['TEST']['spot']=99;self.assertFalse(entry_hold(self.e,p,due+5))
        p['cut']='10:10';self.assertFalse(entry_hold(self.e,p,due+305))

    @unittest.skipUnless(FIXTURE.exists(),'Compact audit fixture not staged')
    def test_known_research_feature_and_score_parity(self):
        fixture=json.loads(FIXTURE.read_text(encoding='utf-8'));scorer=Scorer(HERE/'models')
        for r in fixture['cases']:
            f=vector(r['bars'],r['history'],r['chain'],r['nifty']);self.assertIsNotNone(f)
            for key,value in r['expected_features'].items():self.assertAlmostEqual(f[key],value,places=10)
            self.assertAlmostEqual(scorer.score(f),r['expected_score'],places=12)

    def test_uncertain_publish_no_repost(self):
        class FakePublisher(Publisher):
            def __init__(self):pass
            async def read(self,date):return []
        p=FakePublisher();doc={'date':'2026-11-02','Doc_ID':'one','_publish_attempted':True}
        with self.assertRaises(ValueError):asyncio.run(p.send_once(doc,lambda:None))

    @unittest.skipUnless(FIXTURE.exists(),'Compact audit fixture not staged')
    def test_full_capture_lifecycle_fresh_and_restart_no_rearm(self):
        fixture=json.loads(FIXTURE.read_text(encoding='utf-8'))['cases'][0]
        date=fixture['date'];symbol=fixture['symbol'];cut=fixture['confirmation_cut']
        class Calendar:
            @staticmethod
            def prior_date_valid(prior,current):return prior==fixture['history'][-1]['date']
        aurum=self.root/'aurum';aurum.mkdir()
        save(aurum/'history.json',dict(schema_version=1,symbols={symbol:fixture['history']}))
        instant0=epoch(date+'T09:14:00+05:30')
        f=Features(self.root,aurum,Calendar(),instant0);f.start(date)
        for b in fixture['bars']:
            confirmation=epoch(date+'T'+b['hm']+':00+05:30')+300
            capture_cut=native.hm(confirmation)[:5]
            p=dict(date=date,cut=capture_cut,exported_at=confirmation+1,degraded=False,expiry=fixture['expiry'],
                candles={symbol:dict(time=b['hm'],open=b['o'],high=b['h'],low=b['l'],close=b['c'],volume=b['v'])},
                chains={symbol:fixture['chain']},quotes={},chain_received={symbol:confirmation},
                baselines={symbol:{'prior_day':fixture['history'][-1]['date']}})
            if capture_cut<cut:f.ingest(p,confirmation+2)
        save(aurum/'nifty-cache.json',dict(bars=[
            dict(date=date,bar_start='09:15',open=fixture['nifty']['open'],close=fixture['nifty']['open'],available_at=instant0+360,recovered=True),
            dict(date=date,bar_start=fixture['bars'][-1]['hm'],open=fixture['nifty']['open'],close=fixture['nifty']['close'],available_at=confirmation+1,recovered=False)]))
        events=f.evaluate(p,confirmation+2)
        self.assertEqual(len(events),1);self.assertEqual(events[0]['Symbol'],symbol)
        self.assertAlmostEqual(events[0]['AI_Score'],fixture['expected_score'],places=12)
        self.assertEqual(events[0]['Entry_Due_At'],stamp(confirmation+300))
        self.assertEqual(f.evaluate(p,confirmation+3),[])
        reboot=Features(self.root,aurum,Calendar(),confirmation+10);reboot.start(date)
        self.assertEqual(reboot.evaluate(p,confirmation+11),[])


if __name__=='__main__':unittest.main()
