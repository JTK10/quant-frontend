import unittest
from datetime import datetime
from nifty_oi_close import rank_walls, verified_close, make_doc


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


if __name__=='__main__':unittest.main()
