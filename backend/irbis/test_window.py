"""Full-window causal, restart and bounded-state regression. No publication."""
import json, shutil, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from irbis_live import Worker, DECISIONS, epoch, prior_cut
from irbis_engine import rerank

DAY='2026-10-12'
SOURCE=Path(__file__).resolve().parent

def frozen_rows():
    return [dict(symbol=f'TEST{i}',side='BULL',setup='ITC',score=.9-i*.01,
        base_rank=i+1,rank=i+1,price=100,vwap=99,confirmed=False) for i in range(5)]

def capture(cut):
    minute=int(cut[:2])*60+int(cut[3:])
    chains={f'TEST{i}':[[strike,leg,1,1000+(minute-555)*(1 if leg=='PE' else -1),1000,100]
        for strike in range(80,121) for leg in ('CE','PE')] for i in range(223)}
    return dict(date=DAY,cut=cut,exported_at=epoch(DAY,cut)+20,degraded=False,expiry='2026-10-27',
        chains=chains,chain_received={s:epoch(DAY,cut)+2 for s in chains},
        candles={s:dict(time=prior_cut(cut),open=100,high=102,low=99,close=101,volume=1000) for s in chains},
        baselines={})

class WindowTest(unittest.TestCase):
    def test_full_window_restart_and_bounds(self):
        with tempfile.TemporaryDirectory(prefix='irbis-window-') as folder:
            root=Path(folder);shutil.copy(SOURCE/'irbis_model.json',root/'irbis_model.json')
            worker=Worker(root,epoch(DAY,'09:10'));worker.start(DAY)
            with patch('irbis_live.freeze',return_value=(frozen_rows(),{'cash_ready':223})):
                for minute in range(560,661,5):
                    cut=f'{minute//60:02}:{minute%60:02}'
                    payload=capture(cut)
                    worker.ingest(payload,epoch(DAY,cut)+21)
                    count=len(worker.state['documents'])
                    worker.ingest(payload,epoch(DAY,cut)+22)
                    self.assertEqual(len(worker.state['documents']),count)
                    if cut>='10:00':
                        self.assertLessEqual(len(worker.state['snapshots']),3)
                        self.assertLessEqual(len(worker.state['bars']),5)
                        self.assertTrue(all(len(s['chains'])<=5 for s in worker.state['snapshots'].values()))
                    if cut=='10:35':
                        worker=Worker(root,epoch(DAY,'10:36'));worker.start(DAY)
            docs=worker.state['documents']
            self.assertEqual([d['Cut'] for d in docs],list(DECISIONS))
            self.assertTrue(all(d['State']=='READY' and len(d['Candidates'])==5 for d in docs))
            self.assertEqual(docs[-1]['OI_Cut'],'10:55')
            self.assertTrue(all(r['confirmed'] for r in docs[-1]['Candidates']))
            self.assertEqual([r['symbol'] for r in worker.state['frozen']],[r['symbol'] for r in frozen_rows()])
            baseline=worker.state['snapshots']['09:55']
            complete=worker.state['bars']
            self.assertEqual(len(complete['TEST0']),21,'11:00 needs every cash bar from 09:15 through 10:55')
            missing={s:[b for b in bars if b['hm']!='10:20'] for s,bars in complete.items()}
            self.assertEqual(rerank(worker.state['frozen'],missing,baseline,
                worker.state['snapshots']['10:55'],worker.state['snapshots']['11:00'],'11:00'),[])
            restarted=Worker(root,epoch(DAY,'11:03'));restarted.start(DAY)
            self.assertEqual(restarted.state['documents'],docs)
            # Existing prior-session context contains all symbols, before pruning.
            self.assertEqual(len(json.loads((root/'prior'/f'{DAY}-cash.json').read_text())['bars']),223)

if __name__=='__main__':unittest.main()
