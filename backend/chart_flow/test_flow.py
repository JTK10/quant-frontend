import copy,json,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime
try:import fcntl
except ImportError:sys.modules['fcntl']=types.SimpleNamespace(LOCK_EX=1,LOCK_NB=2,flock=lambda *a:None)
from model import build_rows
import worker

def capture(cut='09:30:00'):
    exported=datetime.fromisoformat('2026-11-17T'+cut+'+05:30').timestamp()+12
    time='09:25' if cut=='09:30:00' else '09:20'
    q=[dict(strike=100,leg='CE',bid=10,ask=10.2,bid_qty=300,ask_qty=100,oi=90,volume=200),dict(strike=100,leg='PE',bid=9,ask=9.2,bid_qty=100,ask_qty=300,oi=120,volume=200)]
    return dict(date='2026-11-17',cut=cut,expiry='2026-11-23',exported_at=exported,degraded=False,chain_received={'TEST':exported-5},candles={'TEST':dict(time=time,close=100)},chains={'TEST':[[100,'CE',10.1,90,100,200],[100,'PE',9.1,120,100,200]]},quotes={'TEST':q})

class Tests(unittest.TestCase):
    def pair(self):
        now=capture();prev=capture('09:25:00')
        for q in prev['quotes']['TEST']:q['volume']=100
        prev['quotes']['TEST'][0].update(bid=9,ask=9.2)
        prev['quotes']['TEST'][1].update(bid=10,ask=10.2)
        return now,prev
    def test_bull_and_bear_symmetry(self):
        import math
        now,prev=self.pair();expected=.4*.5+.4*1+.2*math.tanh(30/5)
        self.assertAlmostEqual(build_rows(now,prev)[0][1],expected,places=5)
        for obj in (now,prev):
            for q in obj['quotes']['TEST']:q['leg']='PE' if q['leg']=='CE' else 'CE'
            for q in obj['chains']['TEST']:q[1]='PE' if q[1]=='CE' else 'CE'
        self.assertAlmostEqual(build_rows(now,prev)[0][1],-expected,places=5)
    def test_no_fabricated_flow(self):
        for mutation in [lambda n,p:n.update(degraded=True),lambda n,p:n['chain_received'].update(TEST=0),lambda n,p:n['candles']['TEST'].update(time='09:20'),lambda n,p:p.update(expiry='2026-12-29'),lambda n,p:p.update(cut='09:20:00'),lambda n,p:n['quotes']['TEST'][0].update(bid=0)]:
            n,p=self.pair();mutation(n,p)
            self.assertIsNone(build_rows(n,p)[0][1])
    def test_volume_reset_excluded(self):
        n,p=self.pair()
        for q in n['chains']['TEST']:q[5]=10
        self.assertIsNone(build_rows(n,p)[0][1])
    def test_inputs_unchanged(self):
        n,p=self.pair();saved=copy.deepcopy((n,p));build_rows(n,p);self.assertEqual((n,p),saved)
    def test_recovery_readback_before_retry(self):
        doc=worker.document('2026-11-17','09:30',[['TEST',.2]],1234)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);worker.save(root/'outbox/2026-11-17-0930.json',dict(document=doc,attempts=0,next_try=0));cfg=root/'cfg.json';cfg.write_text('{}')
            calls=[]
            class Transport:
                def __init__(self,cfg,*args):pass
                def read(self,day):return {doc['Doc_ID']:doc}
                def request(self,*a):calls.append(a);raise AssertionError('Must not repost acknowledged document')
            args=types.SimpleNamespace(root=folder,date='2026-11-17',flush_only=True,batch=3,config=str(cfg))
            with patch.object(worker,'Transport',Transport):worker.run(args);worker.run(args)
            self.assertFalse(calls);self.assertTrue((root/'sent/2026-11-17-0930.json').exists())
    def test_no_overwrite_conflicting_rows(self):
        doc=worker.document('2026-11-17','09:30',[['TEST',.2]],1234)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);worker.save(root/'outbox/2026-11-17-0930.json',dict(document=doc,attempts=0,next_try=0));cfg=root/'cfg.json';cfg.write_text('{}')
            class Transport:
                def __init__(self,cfg,*args):pass
                def read(self,day):return {doc['Doc_ID']:{**doc,'rows':[['TEST',-.2]]}}
            with patch.object(worker,'Transport',Transport),self.assertRaisesRegex(ValueError,'no overwrite'):
                worker.run(types.SimpleNamespace(root=folder,date='2026-11-17',flush_only=True,batch=3,config=str(cfg)))
if __name__=='__main__':unittest.main()
