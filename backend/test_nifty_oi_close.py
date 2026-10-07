import unittest
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
from datetime import datetime
import nifty_oi_close as capture
from nifty_oi_close import rank_walls, verified_close, make_doc, closing_boundaries


class ClosingLevelsTest(unittest.TestCase):
    def test_previous_data_and_nearby_ranks(self):
        rows=[]
        for strike, oi in [(22100,99999),(22400,100),(22450,200),(22550,300),(22600,400),(23000,99999)]:
            rows.append({'strike_price':strike,'call_options':{'market_data':{'oi':oi,'prev_oi':None}},'put_options':{'market_data':{'oi':oi,'prev_oi':10}}})
        support,resistance=rank_walls(rows,22500)
        self.assertEqual([w[0] for w in support],[22450,22400])
        self.assertEqual([w[0] for w in resistance],[22600,22550])
        self.assertEqual(support[0][2],190)
        self.assertIsNone(resistance[0][2])

    def test_holiday_and_incomplete_close_rejected(self):
        end=datetime.fromisoformat('2026-10-01T15:30:00+05:30').timestamp()
        bars=[['2026-10-01T15:25:00+05:30',1,1,1,22500,0,0]]
        self.assertEqual(verified_close(bars,'2026-10-01',end),22500)
        with self.assertRaises(ValueError):verified_close(bars,'2026-10-02',end+86400)
        with self.assertRaises(ValueError):verified_close(bars,'2026-10-01',end+300)

    def test_retry_identity_and_contract_date(self):
        levels=[['NIFTY 50',22500,'2026-10-06',[[22450,100,None]],[[22550,200,None]]]]
        a=make_doc('2026-10-01','15:40',levels,'test')
        b=make_doc('2026-10-01','16:00',levels,'test')
        self.assertEqual(a['capture_id'],b['capture_id'])
        self.assertEqual(a['sig_date'],'20261001')

    def test_main_uses_cash_close_with_later_derivative_session(self):
        day='2026-10-06'
        epoch=lambda value:datetime.fromisoformat(day+'T'+value+':00+05:30').timestamp()
        timings=[{'exchange':'NSE','end_time':epoch('15:30')*1000},
                 {'exchange':'NFO','end_time':epoch('15:40')*1000}]
        self.assertEqual(closing_boundaries(timings),(epoch('15:30'),epoch('15:40')))
        rows=[]
        for strike in [22700,22750,22800,22850]:
            rows.append({'strike_price':strike,'underlying_key':capture.KEY,
                         'call_options':{'market_data':{'oi':1000,'prev_oi':900}},
                         'put_options':{'market_data':{'oi':1000,'prev_oi':900}}})
        def request(url, headers, body=None):
            if '/market/timings/' in url:return {'data':timings}
            if '/option/contract' in url:return {'data':[{'expiry':'2026-10-06'}, {'expiry':'2026-10-13'},{'expiry':'2026-10-19'}]}
            if '/historical-candle/' in url:return {'data':{'candles':[[day+'T15:25:00+05:30',1,1,1,22776.1,0,0]]}}
            if '/option/chain' in url:
                from urllib.parse import parse_qs,urlparse
                expiry=parse_qs(urlparse(url).query)['expiry_date'][0]
                return {'data':[{**r,'expiry':expiry} for r in rows]}
            raise AssertionError('Unexpected endpoint')
        with tempfile.TemporaryDirectory() as store,patch.object(capture,'datetime') as clock,\
                patch.object(capture,'read_token',return_value='test'),\
                patch.object(capture,'request_json',side_effect=request),\
                patch.object(capture,'publish',return_value='verified') as publish:
            clock.now.return_value=datetime.fromisoformat(day+'T16:00:00+05:30')
            clock.fromisoformat.side_effect=datetime.fromisoformat
            capture.main(SimpleNamespace(output=store,probe=False,token_file='unused',config='unused'))
            doc=publish.call_args.args[0]
            self.assertEqual([r[2] for r in doc['oi_levels']],['2026-10-13','2026-10-19'])
            self.assertTrue(all(r[1]==22776.1 for r in doc['oi_levels']))
            # Still wait until NFO close + 5m; don't capture at cash close alone.
        with tempfile.TemporaryDirectory() as store,patch.object(capture,'datetime') as clock,\
                patch.object(capture,'read_token',return_value='test'),\
                patch.object(capture,'request_json',side_effect=request),\
                patch.object(capture,'publish') as publish:
            clock.now.return_value=datetime.fromisoformat(day+'T15:40:00+05:30')
            clock.fromisoformat.side_effect=datetime.fromisoformat
            capture.main(SimpleNamespace(output=store,probe=False,token_file='unused',config='unused'))
            publish.assert_not_called()


if __name__=='__main__':unittest.main()
