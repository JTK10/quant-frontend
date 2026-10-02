import json
import gzip
import unittest
from pathlib import Path
from nifty_signals import candidates, minute, accepts, oi_change, quote_epoch

class Rules(unittest.TestCase):
    def test_detector_parity(self):
        path=Path(__file__).resolve().parent/'fixtures/nifty-detector-parity.json.gz'
        cases=json.loads(gzip.decompress(path.read_bytes()))
        self.assertGreater(len(cases),800)
        for c in cases:
            actual=candidates({minute(r[0]):r for r in c['index']},c['cut'],c['support'],c['resistance'])
            self.assertEqual(actual,c['events'],(c['date'],c['cut']))
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

if __name__=='__main__':unittest.main()
