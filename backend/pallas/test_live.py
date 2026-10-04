import asyncio
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
from pallas_live import State, unpack
from pallas_engine import Scanner
from export_input import export_cut

DAY = '2026-10-01'
EXPIRY = '2026-10-27'
IST = ZoneInfo('Asia/Kolkata')


def epoch(hm):
    return datetime.fromisoformat(DAY+'T'+hm+'+05:30').timestamp()


def bars():
    return [dict(hm=f'09:{m:02d}:00', o=o, h=h, l=l, c=c) for m,o,h,l,c in
            [(15,100,102,100,101.8),(20,101.8,103.5,101.8,103.2),(25,103.2,105,103.2,104.9),
             (30,104.6,104.7,104,104.5),(35,104.5,104.7,104.1,104.5),(40,104.5,104.7,104.1,104.5)]]


def quotes():
    return [dict(expiry=EXPIRY, strike=105., leg='CE', ltp=4., oi=10000, prev_oi=9000, vol=1000000),
            dict(expiry=EXPIRY, strike=104., leg='PE', ltp=2., oi=1000, prev_oi=900, vol=100000)]


def prepared(root):
    state = State(root)
    state.start_day(DAY)
    state.scanner = Scanner(DAY, {'TEST':dict(spot=100.,pdh=102.,pdl=98.,open=100.)}, {})
    state.scanner.expiry = EXPIRY
    state.scanner.bars = {'TEST':bars()}
    state.snapshots = [dict(chains={'TEST':quotes()}, received={'TEST':epoch('09:45:02')},
                           available_at=epoch('09:45:04'), cut='09:45:00', degraded=False)]
    return state


def update(hm, price, **kw):
    return dict(type='candle',kind='update',symbol='TEST',recv_ts=epoch(hm),trade_ts=epoch(hm),
                open=104.5,high=max(104.5,price),low=min(104.5,price),close=price,**kw)


class LiveTests(unittest.TestCase):
    def test_actual_opening_bar_replaces_premarket_quote_fallback(self):
        with tempfile.TemporaryDirectory() as t:
            state=State(Path(t));state.start_day(DAY)
            payload=dict(date=DAY,cut='09:15:00',expiry=EXPIRY,exported_at=epoch('09:15:01'),
                         chain_received={},degraded=False,chains={},candles={},
                         baselines={'TEST':dict(spot=100.,pdh=102.,pdl=98.,open=99.)})
            state.ingest(payload,epoch('09:15:01'))
            self.assertEqual(state.scanner.baselines['TEST']['open'],99.)
            payload.update(cut='09:20:00',exported_at=epoch('09:20:01'),candles={'TEST':dict(time='09:15',open=100.,high=102.,low=100.,close=101.8)})
            state.ingest(payload,epoch('09:20:01'))
            self.assertEqual(state.scanner.baselines['TEST']['open'],100.)

    def test_cross_uses_prior_available_chain_and_freezes(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t))
            self.assertIsNone(state.early_tick(update('09:46:00',104.5),epoch('09:46:00')+.1,epoch('09:46:00')+.2))
            event=state.early_tick(update('09:46:01',105.2),epoch('09:46:01')+.1,epoch('09:46:01')+.2)
            self.assertIsNotNone(event)
            self.assertEqual(event['Event_Type'],'EARLY_TICK')
            self.assertEqual(event['Chain_Time'],'09:45')
            self.assertLess(datetime.fromisoformat(event['Chain_Available_At']).timestamp(),datetime.fromisoformat(event['Issued_At']).timestamp())
            frozen=json.dumps(event,sort_keys=True)
            state.snapshots[0]['chains']['TEST'][0]['ltp']=1000
            state.early_tick(update('09:46:02',110),epoch('09:46:02')+.1,epoch('09:46:02')+.2)
            self.assertEqual(json.dumps(event,sort_keys=True),frozen)

    def test_future_chain_cannot_confirm_past_tick(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t)); state.snapshots[0]['available_at']=epoch('09:47:00')
            state.early_tick(update('09:46:00',104.5),epoch('09:46:00')+.1,epoch('09:46:00')+.2)
            self.assertIsNone(state.early_tick(update('09:46:01',105.2),epoch('09:46:01')+.1,epoch('09:46:01')+.2))

    def test_reconnect_first_tick_is_not_a_cross(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t))
            self.assertIsNone(state.early_tick(update('09:46:00',110),epoch('09:46:00')+.1,epoch('09:46:00')+.2))

    def test_old_trade_in_fresh_snapshot_is_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t)); quote=update('09:46:00',110);quote['trade_ts']=epoch('09:15:00')
            self.assertIsNone(state.early_tick(quote,epoch('09:46:00')+.1,epoch('09:46:00')+.2))

    def test_gap_in_cash_history_suppresses_early_alert(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t));state.scanner.bars['TEST'].pop(2)
            state.early_tick(update('09:46:00',104.5),epoch('09:46:00')+.1,epoch('09:46:00')+.2)
            self.assertIsNone(state.early_tick(update('09:46:01',105.2),epoch('09:46:01')+.1,epoch('09:46:01')+.2))

    def test_export_preserves_volume_denominator_for_missing_ltp(self):
        with tempfile.TemporaryDirectory() as t:
            rows=[(None,'TEST',EXPIRY,105.,'CE',105.,None,None,10000,9000,1000000)]
            export_cut(datetime.fromisoformat(DAY+'T09:45:00'),EXPIRY,rows,{}, {},{}, {'TEST':epoch('09:45:02')},False,t)
            data=json.loads(next(Path(t).glob('*.json')).read_text())
            row=unpack(data)['TEST'][0]
            self.assertEqual(row['vol'],1000000);self.assertIsNone(row['ltp'])

    def test_wrong_session_has_no_alert(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t));quote=update('09:46:00',110);quote['recv_ts']+=86400;quote['trade_ts']+=86400
            self.assertIsNone(state.early_tick(quote,quote['recv_ts']+.1,quote['recv_ts']+.2))


if __name__=='__main__':
    unittest.main()
