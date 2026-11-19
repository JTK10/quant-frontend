"""Focused causal and restart tests for the stdlib scanner."""
import unittest

from osprey_engine import Engine, flow_groups


def capture(cut, io, premium, close=100, date='2026-11-13'):
    current = int(cut[3:5]) - 5
    candle = f'09:{current:02d}'
    return {
        'date': date, 'cut': cut, 'expiry': '2026-11-23', 'degraded': False,
        'baselines': {f'S{n}': {'spot': 100} for n in range(12)},
        'chains': {f'S{n}': [[100, 'PE', premium, 100 + io*n], [101,'CE',premium,100]]
                   for n in range(12)},
        'candles': {f'S{n}': {'time': candle, 'open': 100, 'close': close, 'volume': 20}
                    for n in range(12)},
    }


class TestEngine(unittest.TestCase):
    def test_rusty_bias_exact_cut_only_and_no_stale_carry(self):
        engine = Engine()
        engine.process(capture('09:15', 0, 10))
        rust = dict(date='2026-11-13', cut='09:20', bull=[
            dict(s='S11', ce_pct=99, pe_pct=99, oi_bias=0,
                 nearby_oi=[-3,8,11,'CE_DOWN_PE_UP','label','green','black','high'])], bear=[])
        data = engine.process(capture('09:20', 1, 9), {'rusty':rust})
        row = next(r for r in data['Tracked'] if r['symbol']=='S11')
        self.assertEqual((row['ce_pct'],row['pe_pct'],row['oi_bias']),(-3,8,11))
        data = engine.process(capture('09:25', 2, 8), {'rusty':rust})
        row = next(r for r in data['Tracked'] if r['symbol']=='S11')
        self.assertIsNone(row['oi_bias'])

    def test_duplicate_and_nonfinite_rusty_bias_are_unavailable(self):
        for extra in (dict(s='S11',ce_pct=2,pe_pct=3,oi_bias=1),
                      dict(s='S11',ce_pct=float('nan'),pe_pct=3,oi_bias=1)):
            engine = Engine()
            engine.process(capture('09:15',0,10))
            rust = dict(date='2026-11-13',cut='09:20',bull=[extra],bear=[])
            if extra['ce_pct']==2:
                rust['bear']=[dict(extra)]
            data=engine.process(capture('09:20',1,9),rust)
            row=next(r for r in data['Tracked'] if r['symbol']=='S11')
            self.assertIsNone(row['oi_bias'])

    def test_exact_preceding_window_and_new_session(self):
        engine = Engine()
        engine.process(capture('09:15', 0, 10))
        data = engine.process(capture('09:20', 1, 9))
        bulls = [x for x in data['Tracked'] if x['symbol']=='S11']
        self.assertEqual(len(bulls),1)
        self.assertEqual(bulls[0]['state'],'Watch')
        self.assertEqual(bulls[0]['oi_5m'],11)
        self.assertNotIn('oi_15m',bulls[0])
        stale = capture('09:25', 2, 8, close=102)
        for bar in stale['candles'].values():
            bar['time'] = '09:15'
        result = engine.process(stale)
        self.assertTrue(all(x['state']!='Confirmed' for x in result['Tracked']))
        degraded = capture('09:30', 3, 7, close=102)
        degraded['degraded']=True
        self.assertIsNone(engine.process(degraded))
        result = engine.process(capture('09:35', 4, 6, close=103))
        bulls = [x for x in result['Tracked'] if x['symbol']=='S11']
        self.assertTrue(bulls)
        self.assertEqual(bulls[0]['confirmed'],'09:35')
        self.assertNotIn('oi_5m',bulls[0])
        self.assertAlmostEqual(bulls[0]['oi_15m'],29.73)
        self.assertIsNone(engine.process(capture('09:25',2,8)))
        self.assertFalse(engine.process(capture('09:15',0,10,date='2026-11-16'))['Tracked'])

    def test_percentile_rollup_keeps_top_three(self):
        contracts = [('A','PE',strike,'2026-11-23') for strike in (97,98,99,100,101,102)]
        self.assertEqual(len(flow_groups({key:(120+n,9) for n,key in enumerate(contracts)},
                                         {key:(100,10) for key in contracts},
                                         {'A':100})['A','BULL']['PE_BUILD']['strikes']),3)


if __name__=='__main__':
    unittest.main()
