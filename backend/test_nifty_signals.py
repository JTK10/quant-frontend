import json
import gzip
import unittest
from pathlib import Path
from nifty_signals import candidates, direct_breaks, minute, accepts, oi_change, quote_epoch

class Rules(unittest.TestCase):
    def test_detector_parity(self):
        path=Path(__file__).resolve().parent/'fixtures/nifty-detector-parity.json.gz'
        cases=json.loads(gzip.decompress(path.read_bytes()))
        self.assertGreater(len(cases),800)
        for c in cases:
            actual=candidates({minute(r[0]):r for r in c['index']},c['cut'],c['support'],c['resistance'])
            self.assertEqual([e for e in actual if e['strategy']!='direct_break_body45'],c['events'],(c['date'],c['cut']))
    def test_oi_requires_both_baskets(self):
        positive={'PE':{'delta':1},'CE':{'delta':-1}}
        wrong={'PE':{'delta':1},'CE':{'delta':1}}
        self.assertTrue(accepts('BULL',positive,positive))
        self.assertFalse(accepts('BULL',positive,wrong))
        self.assertFalse(accepts('BEAR',positive,positive))
    def test_missing_oi_fails_closed(self):
        with self.assertRaises(ValueError):oi_change({},22500,200,618,628)
    def test_quote_response_time_is_not_price_time(self):
        self.assertEqual(quote_epoch({'timestamp':'2026-10-02T21:58:31+05:30'}),0)
        self.assertEqual(quote_epoch({'last_trade_time':'1790850600000'}),1790850600)
    def test_future_bars_cannot_change_detector(self):
        path=Path(__file__).resolve().parent/'fixtures/nifty-detector-parity.json.gz'
        for c in json.loads(gzip.decompress(path.read_bytes()))[::20]:
            bars={minute(r[0]):r for r in c['index']}
            expected=candidates(bars,c['cut'],c['support'],c['resistance'])
            bars[c['cut']]=['2026-10-01T14:00:00+05:30',1,99999,1,99999,0,0]
            self.assertEqual(candidates(bars,c['cut'],c['support'],c['resistance']),expected)

    def test_oct1_direct_break_and_symmetric_bull(self):
        rows={739:['',22502,22503,22501,22502,0,0]}
        for m in range(740,745):rows[m]=['',22500.3,22510.65,22479.55,22485.7,0,0]
        expected=[dict(strategy='direct_break_body45',side='BEAR',level=22500,stop=22513.65)]
        self.assertEqual(direct_breaks(rows,745,[22500],[]),expected)
        mirrored={m:[b[0],45000-b[1],45000-b[3],45000-b[2],45000-b[4],b[5],b[6]] for m,b in rows.items()}
        bull=direct_breaks(mirrored,745,[],[22500])
        self.assertEqual(bull[0]['side'],'BULL')
        self.assertAlmostEqual(bull[0]['stop'],22486.35)
        rows[745]=['',1,999999,0,1,0,0]
        self.assertEqual(direct_breaks(rows,745,[22500],[]),expected)
        rows.pop(741)
        self.assertEqual(direct_breaks(rows,745,[22500],[]),[])

    def test_direct_body_and_close_buffer(self):
        rows={624:['',100,101,99,100,0,0]}
        for m in range(625,630):rows[m]=['',100,110,90,104,0,0]
        self.assertEqual(direct_breaks(rows,630,[],[100]),[])
        for m in range(625,630):rows[m]=['',100,111,99,106,0,0]
        self.assertEqual(len(direct_breaks(rows,630,[],[100])),1)
        rows[624][4]=101
        self.assertEqual(direct_breaks(rows,630,[],[100]),[])

if __name__=='__main__':unittest.main()
