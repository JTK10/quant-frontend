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
class EntryRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.root.joinpath('kairos9_model.json').write_bytes(Path(__file__).with_name('kairos9_model.json').read_bytes())
        self.w=Worker(self.root);self.w.state['date']='2026-10-14'
        self.meta=dict(lot_size=100,key='NSE_FO|TEST',name='TEST CE')
    def tearDown(self):self.tmp.cleanup()
    def run_cut(self,cut,offset=1,metadata=None,depth=10000,ask=100,bid=99):
        t=live.epoch('2026-10-14',cut)
        q=dict(strike=200.,leg='CE',ltp=ask,oi=10000,volume=100,bid=bid,ask=ask,bid_qty=depth,ask_qty=depth)
        p=dict(date='2026-10-14',cut=cut,expiry='2026-10-27',degraded=False,exported_at=t,chain_received={'TEST':t},quotes={'TEST':[q]})
        signal=dict(Symbol='TEST',Side='BULL',Cut=cut,Spot=200,Expiry='2026-10-27',Score=.8,Win_Prob=.5)
        def source(path,*args):return {'documents':[{'Cut':cut}]} if Path(path).name=='2026-10-14.json' else p
        outcome=self.meta if metadata is None else metadata
        with patch.object(live,'INPUT',self.root),patch.object(Path,'exists',return_value=True),patch.object(live,'read',side_effect=source),patch.object(live,'candidates',return_value=[signal]),patch.object(live,'contract_metadata',side_effect=outcome if isinstance(outcome,Exception) else None,return_value=outcome) as api:
            self.w.tick(t+offset)
        return api
    def restart(self):self.w=Worker(self.root)
    def test_failed_metadata_does_not_consume_day(self):
        self.run_cut('10:10',metadata=live.BrokerMetadataError('Broker metadata HTTP 403',403))
        self.assertFalse(self.w.state['taken']);self.assertIsNone(self.w.state['pending_entry'])
        self.restart();self.run_cut('10:15');self.assertFalse(self.w.state['taken'])
        self.run_cut('10:20');self.assertTrue(self.w.state['taken']);self.assertEqual(self.w.state['daily_entries'],1)
    def test_transient_retry_survives_restart(self):
        self.run_cut('10:10',metadata=live.BrokerMetadataError('Broker metadata HTTP 503',503,True))
        self.restart();api=self.run_cut('10:10',offset=20);self.assertFalse(api.called)
        self.run_cut('10:10',offset=32);self.assertIsNotNone(self.w.state['pending_entry'])
        self.assertEqual(self.w.state['metadata_attempts'],2);self.run_cut('10:15');self.assertTrue(self.w.state['taken'])
    def test_retry_limit_survives_crash(self):
        self.run_cut('10:10',metadata=live.BrokerMetadataError('Transport',retryable=True))
        self.w.state['metadata_pending']['attempts']=3;self.w.persist();self.restart()
        api=self.run_cut('10:10',offset=40);self.assertFalse(api.called);self.assertIsNone(self.w.state['metadata_pending']);self.assertFalse(self.w.state['taken'])
    def test_missed_entry_never_retroactively_fills(self):
        self.run_cut('10:10');self.restart()
        with patch.object(live,'INPUT',self.root),patch.object(Path,'exists',return_value=False):self.w.tick(live.epoch('2026-10-14','10:19'))
        self.assertIsNone(self.w.state['pending_entry']);self.assertFalse(self.w.state['taken']);self.assertIsNone(self.w.state['position'])
        self.run_cut('10:20');self.assertEqual(self.w.state['pending_entry']['entry_time'],'10:25')
    def test_budget_sizes_down_to_one_displayed_lot(self):
        self.run_cut('10:10');self.run_cut('10:15',depth=100,ask=133.8,bid=133.25)
        self.assertEqual(self.w.state['position']['lots'],1);self.assertEqual(self.w.state['position']['qty'],100)
        self.assertAlmostEqual(self.w.state['position']['entry']*100,13380)
    def test_insufficient_one_lot_skips_without_lock(self):
        self.run_cut('10:10');self.run_cut('10:15',depth=50)
        self.assertIsNone(self.w.state['position']);self.assertFalse(self.w.state['taken'])
        self.run_cut('10:20');self.assertIsNotNone(self.w.state['pending_entry'])
    def test_successful_entry_exit_restart_blocks_second_entry(self):
        self.run_cut('10:10');self.run_cut('10:15');self.run_cut('10:20',ask=85,bid=80)
        self.assertIsNone(self.w.state['position']);self.restart();api=self.run_cut('10:25');self.assertFalse(api.called)
        self.assertEqual(sum(d['kind']=='ENTRY' for d in self.w.state['outbox']),1)
    def test_closed_health_does_not_erase_failure_audit(self):
        self.run_cut('10:10',metadata=live.BrokerMetadataError('Broker metadata HTTP 403',403));self.w.tick(live.epoch('2026-10-14','19:00'))
        self.assertEqual(self.w.state['last_failure']['http_status'],403);self.assertEqual(self.w.state['decisions']['10:10']['status'],'SKIPPED')
    def test_legacy_lock_never_silently_cleared(self):
        self.w.state['taken']=True;self.w.persist();self.restart();self.assertTrue(self.w.state['taken'])
    def test_broker_orders_not_permitted(self):
        with self.assertRaises(ValueError):live.broker_get('https://api.upstox.com/v2/order/place',{})
if __name__=='__main__':unittest.main()
