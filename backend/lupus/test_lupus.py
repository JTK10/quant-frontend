import copy,unittest
from datetime import datetime
from lupus_engine import Scanner
class CausalScannerTests(unittest.TestCase):
    def scanner(self):
        return Scanner('2026-10-19',{'2026-10-16':dict(closes={'A':99,'B':99,'C':99},bulls=[dict(symbol=s,line=100,failure='2026-10-16',trapHigh=103,trapExcursion=3,trapDrawdown=1) for s in ('A','B','C')],bears=[],walls=[])})
    def doc(self,cut,ce):
        hm='09:15' if cut=='09:20' else '09:20'
        return dict(date='2026-10-19',cut=cut,ts=datetime.fromisoformat('2026-10-19T'+cut+':10+05:30').timestamp(),bull=[dict(s=s,mv=1,ce_pct=v,pe_pct=0,c_time=hm,c_open=99,c_low=99,c_high=103,c_close=102) for s,v in ce.items()],bear=[])
    def test_live_rank_floor_replay_and_future_guard(self):
        s=self.scanner();d=self.doc('09:20',{'A':-5,'B':-4,'C':-2})
        out=s.ingest(d,{'A':101,'B':101,'C':101},d['ts']+1)
        self.assertEqual([(r['symbol'],r['rank']) for r in out['bull']],[('A',1),('B',2)])
        self.assertTrue(all(r['outcome'] is None for r in out['bull']))
        old=copy.deepcopy(s.state);self.assertIsNone(s.ingest(d,{},d['ts']+2));self.assertEqual(s.state,old)
        future=self.doc('09:25',{'A':-8})
        with self.assertRaises(ValueError):s.ingest(future,{'A':101},d['ts'])
        with self.assertRaises(ValueError):s.ingest(dict(future,date='2026-10-20'),{},future['ts']+1)
    def test_missing_candle_and_pdh_do_not_qualify(self):
        s=self.scanner();d=self.doc('09:20',{'A':-10});d['bull'][0]['c_time']='09:10'
        with self.assertRaises(ValueError):s.ingest(d,{'A':101},d['ts']+1)
        s=self.scanner();d=self.doc('09:20',{'A':-10})
        self.assertEqual(s.ingest(d,{},d['ts']+1)['bull'],[])
    def test_future_history_never_enters_today(self):
        s=self.scanner();before=copy.deepcopy(s.bulls);history=copy.deepcopy(s.history)
        history['2026-10-20']=dict(bulls=[dict(symbol='FUTURE',line=1)],bears=[],closes={},walls=[])
        self.assertEqual(Scanner('2026-10-19',history).bulls,before)
if __name__=='__main__':unittest.main()
