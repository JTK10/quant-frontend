import sys,types,unittest,tempfile,json,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
if sys.platform=='win32':sys.modules['fcntl']=types.SimpleNamespace()
from kairos9_features import Model
from kairos_option_ai import KairosOptionTrailingEngine,size_lots,fees
import kairos9_live as live
from kairos9_live import Worker,save,Publisher
from unittest.mock import patch
from datetime import datetime
class ReleaseTests(unittest.TestCase):
    def test_export_schema_compatible(self):
        import pallas_export
        from datetime import datetime
        with tempfile.TemporaryDirectory() as d:
            cut=datetime.fromisoformat('2026-10-14T10:15:00+05:30')
            row=(cut,'TEST','2026-10-27',200.,'CE',200.,10.,9.,10000,9000,500,9.9,10.,1000,1100,.5,.2)
            pallas_export.export_cut(cut,'2026-10-27',[row],{}, {},{}, {},False,directory=d)
            payload=json.loads(next(Path(d).glob('*.json')).read_text())
            self.assertEqual(payload['chains']['TEST'][0],[200.,'CE',10.,10000,9000,500])
            self.assertEqual(payload['quotes']['TEST'][0]['bid'],9.9)
            self.assertEqual(payload['quotes']['TEST'][0]['ask_qty'],1100)

    def test_exported_model_parity(self):
        m=Model(Path(__file__).with_name('kairos9_model.json'))
        for name,model in m.bundle['models'].items():
            for fixture in model['parity']:self.assertAlmostEqual(m.predict(name,fixture['features']),fixture['expected'],places=12)
    def test_budget(self):self.assertEqual(size_lots(100,400,35000),0)
    def test_stt(self):self.assertEqual(fees(10,12,100)['STT'],1.8)
    def test_gap_bid(self):
        e=KairosOptionTrailingEngine(100,'10:00');e.update_quote('10:05',85,80);self.assertEqual(e.exit_price,80)
    def test_two_consecutive_quotes(self):
        e=KairosOptionTrailingEngine(100,'10:00')
        for x in [('10:05',125,124),('10:10',110,109),('10:20',100,99)]:e.update_quote(*x)
        self.assertFalse(e.is_closed)
        e.update_quote('10:25',100,99);self.assertEqual(e.exit_price,99)
    def test_atomic_restart_outbox(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);root.joinpath('kairos9_model.json').write_bytes(Path(__file__).with_name('kairos9_model.json').read_bytes())
            w=Worker(root);w.state['date']='2026-10-14';w.emit('HEALTH',1791932400,{},'one');w.emit('HEALTH',1791932400,{},'one');w.persist()
            recovered=Worker(root);self.assertEqual(len(recovered.state['outbox']),1);self.assertEqual(recovered.state['outbox'][0]['source'],'kairos9')
            self.assertEqual(recovered.state['outbox'][0]['mode'],'paper')
    def test_old_position_retained(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);root.joinpath('kairos9_model.json').write_bytes(Path(__file__).with_name('kairos9_model.json').read_bytes())
            w=Worker(root);w.state.update(date='2026-10-13',position={'retained':True});w.tick(1791932400)
            self.assertEqual(w.state['position'],{'retained':True});self.assertIn('manual review',w.state['status'])
    def test_duplicate_mark_rejected(self):
        e=KairosOptionTrailingEngine(100,'10:00');e.update_quote('10:05',100,99)
        with self.assertRaises(ValueError):e.update_quote('10:05',100,99)
    def test_entry_mark_exit_restart(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);root.joinpath('kairos9_model.json').write_bytes(Path(__file__).with_name('kairos9_model.json').read_bytes())
            w=Worker(root);day='2026-10-14'
            signal=dict(Date=day,Symbol='TEST',Side='BULL',Cut='10:10',Expiry='2026-10-27',Strike=200,Leg='CE',entry_time='10:15',lot_size=100,key='NSE_FO|TEST',name='TEST CE',Win_Prob=.5,Score=.8)
            w.state.update(date=day,taken=True,pending_entry=signal)
            for cut,ltp,bid,ask in [('10:15',100,99,100),('10:20',125,124,125),('10:25',110,109,110),('10:30',100,99,100)]:
                instant=live.epoch(day,cut)
                q=dict(strike=200,leg='CE',ltp=ltp,bid=bid,ask=ask,oi=10000,volume=100,bid_qty=10000,ask_qty=10000)
                payload=dict(date=day,cut=cut,expiry=signal['Expiry'],degraded=False,exported_at=instant,chain_received={'TEST':instant},quotes={'TEST':[q]})
                with patch.object(live,'INPUT',root),patch.object(Path,'exists',return_value=True),patch.object(live,'read',return_value=payload):w.tick(instant+1)
                w=Worker(root)
            kinds=[d['kind'] for d in w.state['outbox']]
            self.assertEqual(kinds,['ENTRY','MTM','MTM','EXIT']);self.assertIsNone(w.state['position'])
            e=w.state['outbox'][0];x=w.state['outbox'][-1]
            self.assertEqual(e['quantity'],300);self.assertEqual(e['entry'],100);self.assertEqual(x['entry_fill'],100);self.assertEqual(x['entry'],99)
            self.assertEqual(e['signal_id'],x['signal_id']);self.assertEqual(e['capital_used'],30000)
    def test_uncertain_post_never_blindly_retries(self):
        p=Publisher.__new__(Publisher);p.cfg={'base':'https://example.test','path':'/signals'};p.token='test';p.expiry=10**12
        doc={'source':'kairos9','sig_date':'20261014','Doc_ID':'id'};posts=[];persist=[]
        def transport(url,data=None,headers=None):
            if data is not None:posts.append(data);raise TimeoutError()
            return {'items':[]}
        with patch.object(live,'request',side_effect=transport):
            with self.assertRaises(TimeoutError):p.send(doc,lambda:persist.append(True))
            with self.assertRaises(ValueError):p.send(doc,lambda:persist.append(True))
        self.assertEqual(len(posts),1);self.assertEqual(persist,[True])
        with patch.object(live,'request',return_value={'items':[{'doc':{'source':'kairos9','Doc_ID':'id'}}]}):p.send(doc,lambda:None)
if __name__=='__main__':unittest.main()
