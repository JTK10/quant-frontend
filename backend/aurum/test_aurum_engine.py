"""Causal worker lifecycle tests; no network or production state."""
import copy
import json
import tempfile
import unittest
import uuid
import shutil
from pathlib import Path

from aurum_engine import evaluate, gate
from aurum_live import Worker, epoch, save, validate_capture


def history():
    return dict(schema_version=1, symbols={'TEST':[dict(date=day, high=103, low=96, close=100, complete=True,
        bars=[[f'{m//60:02}:{m%60:02}',100,(m-555)//5*100+100] for m in range(570,621,5)])
        for day in ('2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30')]})


BARS=[dict(hm='09:15',o=102,h=103,l=101.9,c=102.8,v=100),
      dict(hm='09:20',o=102.8,h=103,l=102.2,c=102.4,v=100),
      dict(hm='09:25',o=102.4,h=103,l=102.3,c=102.9,v=100),
      dict(hm='09:30',o=102.9,h=103.7,l=102.85,c=103.6,v=300)]
CHAIN=[[103,'CE',3,100,100,1000],[102,'PE',2,200,100,500]]


def capture(bar,day='2026-11-02',degraded=False):
    n=int(bar['hm'][:2])*60+int(bar['hm'][3:])+5
    cut=f'{n//60:02}:{n%60:02}'
    instant=epoch(day,cut)
    return dict(date=day,cut=cut,exported_at=instant+2,degraded=degraded,expiry='2026-11-23',
                chain_received={'TEST':instant+1},chains={'TEST':CHAIN},
                baselines={'TEST':dict(prior_day='2026-10-30',pdh=103,pdl=96,pdc=100)},
                candles={'TEST':dict(time=bar['hm'],open=bar['o'],high=bar['h'],low=bar['l'],close=bar['c'],volume=bar['v'])})


def context(p):
    return dict(date=p['date'],cut=p['cut'],nifty=dict(open=22000,close=22000,
        bar_start=p['candles']['TEST']['time'],available_at=p['exported_at']),rusty={'TEST':dict(ce_pct=-2,pe_pct=3,oi_bias=5,flow_label='CE OI Down + PE OI Up')})


class Tests(unittest.TestCase):
    def setUp(self):
        base=Path(__file__).resolve().parent
        self.root=base/('engine-test-'+uuid.uuid4().hex)
        self.root.mkdir()
        save(self.root/'history.json',history())
        self.worker=Worker(self.root,startup=epoch('2026-11-02','09:14'))
        self.worker.start('2026-11-02')

    def tearDown(self):shutil.rmtree(self.root)

    def feed(self,worker=None):
        w=worker or self.worker
        for b in BARS:
            p=capture(b);w.ingest(p,context(p),p['exported_at']+1)

    def test_gates_and_prefix(self):
        passed,f=evaluate(BARS,history()['symbols']['TEST'],CHAIN,dict(open=22000,close=22000))
        self.assertTrue(passed)
        self.assertTrue(f['pullback_confirmed'])
        self.assertEqual(f['rvol_5m'],3)
        self.assertEqual(f['rvol_cum'],1.5)

    def test_signal_duplicate_restart_reference_not_fill(self):
        self.feed();self.feed()
        self.assertEqual(len(self.worker.state['signals']),1)
        signal=self.worker.state['signals'][0]
        self.assertIsNone(signal['entry'])
        self.assertEqual(signal['reference_price'],103.6)
        self.assertEqual(signal['ce_pct'],-2)
        self.assertEqual(signal['view'],'CE OI Down + PE OI Up')
        again=Worker(self.root,startup=epoch('2026-11-02','10:00'))
        again.start('2026-11-02');self.feed(again)
        self.assertEqual(again.state['signals'],self.worker.state['signals'])

    def test_missing_nifty_cash_retained_retry_without_duplicate(self):
        for b in BARS[:3]:
            p=capture(b);self.worker.ingest(p,{},p['exported_at'])
        p=capture(BARS[-1])
        with self.assertRaises(ValueError):self.worker.ingest(p,{},p['exported_at'])
        self.assertEqual(len(self.worker.state['bars']['TEST']),4)
        self.worker.ingest(p,context(p),p['exported_at'])
        self.assertEqual(len(self.worker.state['signals']),1)

    def test_future_wrong_date_and_wrong_boundary(self):
        p=capture(BARS[-1])
        with self.assertRaises(ValueError):validate_capture(p,'2026-11-03',p['exported_at'])
        with self.assertRaises(ValueError):validate_capture(p,p['date'],p['exported_at']-10)
        p['candles']['TEST']['time']='09:35'
        self.assertFalse(validate_capture(p,p['date'],p['exported_at'])[2])

    def test_degraded_chain_never_signals(self):
        for b in BARS[:3]:
            p=capture(b);self.worker.ingest(p,{},p['exported_at'])
        p=capture(BARS[-1],degraded=True)
        with self.assertRaises(ValueError):self.worker.ingest(p,context(p),p['exported_at'])
        self.assertEqual(len(self.worker.state['bars']['TEST']),4)
        self.assertFalse(self.worker.state['signals'])

    def test_missing_rusty_is_explicit_does_not_change_base_gate(self):
        for b in BARS:
            p=capture(b);aux=context(p);aux['rusty']={}
            self.worker.ingest(p,aux,p['exported_at'])
        signal=self.worker.state['signals'][0]
        self.assertIsNone(signal['ce_pct'])
        self.assertEqual(signal['rusty_status'],'unavailable')

    def test_next_session_daily_baseline_with_saved_morning_volume(self):
        bars=copy.deepcopy(BARS)
        for m in range(575,621,5):bars.append(dict(hm=f'{m//60:02}:{m%60:02}',o=103.6,h=103.7,l=103.5,c=103.6,v=100))
        self.worker.state['bars']={'TEST':bars};self.worker.persist()
        self.worker.start('2026-11-03')
        self.worker.hydrate_prior_baselines({'TEST':dict(prior_day='2026-11-02',pdh=110,pdl=99,pdc=108)},'2026-11-03')
        prior=self.worker.history['symbols']['TEST'][-1]
        self.assertTrue(prior['complete'])
        self.assertEqual(prior['high'],110)
        self.assertEqual(prior['close'],108)
        self.assertEqual(len(prior['bars']),11)
        self.assertEqual(prior['bars'][0][2],600)

    def test_holiday_gap_uses_explicit_prior_day_and_missing_prefix_fails(self):
        self.worker.start('2026-10-19')
        bars=copy.deepcopy(BARS)
        for m in range(575,621,5):bars.append(dict(hm=f'{m//60:02}:{m%60:02}',o=103.6,h=103.7,l=103.5,c=103.6,v=100))
        self.worker.state['bars']={'TEST':bars};self.worker.persist()
        self.worker.start('2026-10-21')
        self.worker.hydrate_prior_baselines({'TEST':dict(prior_day='2026-10-19',pdh=110,pdl=99,pdc=108)},'2026-10-21')
        record=next(d for d in self.worker.history['symbols']['TEST'] if d['date']=='2026-10-19')
        self.assertTrue(record['complete'])
        self.worker.hydrate_prior_baselines({'MISSING':dict(prior_day='2026-10-19',pdh=110,pdl=99,pdc=108)},'2026-10-21')
        self.assertFalse(self.worker.history['symbols']['MISSING'])

    def test_missing_cash_and_required_oi_fail_closed(self):
        with self.assertRaises(ValueError):evaluate(BARS[:1]+BARS[2:],history()['symbols']['TEST'],CHAIN,dict(open=22000,close=22000))
        with self.assertRaises(ValueError):evaluate(BARS,history()['symbols']['TEST'],[],dict(open=22000,close=22000))
        passed,f=evaluate(BARS,history()['symbols']['TEST'],CHAIN,dict(open=22000,close=22000))
        f['oi_dom_contemp']=None
        self.assertFalse(gate(f))

    def test_already_qualified_stock_counts_as_covered(self):
        self.feed()
        b=dict(hm='09:35',o=103.6,h=103.8,l=103.5,c=103.7,v=100)
        p=capture(b)
        self.worker.ingest(p,context(p),p['exported_at'])
        cov=self.worker.state['coverage']['09:40']
        self.assertEqual(cov['already_qualified'],1)
        self.assertEqual(cov['evaluated'],0)
        self.assertEqual(self.worker.document(p['exported_at'])['status'],'READY')

    def test_missing_cut_reports_after_grace_and_persists_after_window(self):
        self.assertEqual(self.worker.document(epoch('2026-11-02','09:37'))['status'],'PENDING')
        late=self.worker.document(epoch('2026-11-02','09:38'))
        self.assertEqual(late['status'],'ERROR')
        self.assertEqual(late['missing_overdue_cuts'],['09:35'])
        self.assertTrue(late['stale'])
        closed=self.worker.document(epoch('2026-11-02','10:40'))
        self.assertEqual(closed['status'],'ERROR')
        self.assertEqual(len(closed['missing_overdue_cuts']),11)

    def test_holiday_has_no_overdue_regular_session_cuts(self):
        class HolidayCalendar:
            @staticmethod
            def regular_day(day):return False
        self.worker.calendar=HolidayCalendar
        doc=self.worker.document(epoch('2026-11-02','10:40'))
        self.assertEqual(doc['status'],'CLOSED')
        self.assertFalse(doc['missing_overdue_cuts'])
        self.assertIsNone(doc['error'])


if __name__=='__main__':unittest.main()
