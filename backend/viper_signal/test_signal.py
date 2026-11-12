import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from signal_engine import SignalEngine, SLOTS, cross_leg
from signal_live import deliver_one, enqueue, open_state


def capture(cut, time):
    return dict(date='2026-11-13',cut=cut,expiry='2026-11-23',degraded=False,
        chain_received={'SAMPLE':1},baselines={'SAMPLE':{'spot':100}},
        chains={'SAMPLE':[[100,'CE',4,100,50,0]]},
        candles={'SAMPLE':dict(time=time,open=99,high=101,low=98,close=100,volume=100)})


def engine():
    baseline=capture('15:25','15:20')
    baseline['date']='2026-11-12'
    seed=dict(date='2026-11-12',bars={'SAMPLE':[[t,99,101,98,100,100] for t in SLOTS]})
    return SignalEngine('2026-11-13',baseline,prior_cash=seed)


class SignalTests(unittest.TestCase):
    def test_closed_candles_and_missing_prefix_fail_closed(self):
        e=engine()
        e.advance(capture('09:20','09:20'))  # Future/unclosed candle must be ignored.
        self.assertIsNone(e.cash_features('SAMPLE','09:20',False))
        e.advance(capture('09:25','09:20'))
        self.assertIsNone(e.cash_features('SAMPLE','09:25',False))
        # A later candle cannot conceal the missing opening candle.
        e.advance(capture('09:30','09:25'))
        self.assertIsNone(e.cash_features('SAMPLE','09:30',False))

    def test_checkpoint_preserves_prefix_and_rejects_duplicate_cut(self):
        e=engine()
        e.advance(capture('09:20','09:15'))
        saved=json.loads(json.dumps(e.state))
        resumed=SignalEngine(e.day,state=saved)
        doc=capture('09:25','09:20')
        self.assertEqual(e.advance(copy.deepcopy(doc)),resumed.advance(doc))
        self.assertEqual(e.state,resumed.state)
        self.assertIsNotNone(resumed.cash_features('SAMPLE','09:25',False))
        with self.assertRaises(ValueError):
            resumed.advance(doc)

    def test_missing_and_stale_cross_leg_not_confirmation(self):
        self.assertEqual(cross_leg({'100.0':[120,3]}, {},100,100),(None,None))
        self.assertEqual(cross_leg({'90.0':[120,3]}, {'90.0':[100,4]},100,100,True),(None,False))
        self.assertEqual(cross_leg({'100.0':[120,3]}, {'100.0':[100,4]},100,100)[1],True)

    def test_degraded_close_can_seed_complete_cash_but_not_alert(self):
        e=engine()
        for t in SLOTS:
            end=int(t[:2])*60+int(t[3:])+5
            doc=capture(f'{end//60:02}:{end%60:02}',t)
            doc['degraded']=True
            e.accept_cash(doc)
        self.assertEqual(len(e.cash_seed()['bars']['SAMPLE']),75)
        self.assertIsNone(e.viper.state['last'])
        e.state['cash']['SAMPLE'].pop(0)
        with self.assertRaises(ValueError):
            e.cash_seed()

    def test_daily_levels_and_partial_volume_are_kept_separate(self):
        e=engine()
        e.accept_cash(capture('09:20','09:15'))
        close=dict(date=e.day,bars={'SAMPLE':[[t,99,105,95,100] for t in SLOTS]})
        seed=e.cash_seed(close)
        baseline=capture('15:25','15:20')
        baseline['date']=e.day
        next_day=SignalEngine('2026-11-16',baseline,prior_cash=seed)
        self.assertEqual(next_day.state['levels']['SAMPLE'],[105,95])
        next_day.state['cash']['SAMPLE']=[['09:15',99,101,98,100,100],['09:20',99,101,98,100,100]]
        self.assertIsNone(next_day.cash_features('SAMPLE','09:25',False)['rvol'])

    def test_uncertain_publication_and_restart_do_not_duplicate(self):
        with TemporaryDirectory() as tmp:
            path=Path(tmp)/'state.sqlite'
            db=open_state(path)
            doc=dict(Doc_ID='viper-signal|phoenix-live-v1|20261113|0930',date='2026-11-13')
            with db:
                enqueue(db,doc)
                enqueue(db,doc)
            pub=Mock()
            pub.publish.side_effect=OSError('uncertain receipt')
            deliver_one(db,pub,doc['date'],1000)
            db.close()
            db=open_state(path)
            pub.read.return_value={doc['Doc_ID']:doc}
            deliver_one(db,pub,doc['date'],1020)
            self.assertEqual(pub.publish.call_count,1)
            self.assertEqual(db.execute('SELECT count(*) FROM outbox WHERE sent=1').fetchone()[0],1)
            self.assertFalse(deliver_one(db,pub,doc['date'],1040))
            db.close()


if __name__=='__main__':
    unittest.main()
