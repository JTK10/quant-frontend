import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from pallas_live import State, iso, CHAIN_MAX_AGE
from pallas_engine import Scanner
from test_live import prepared, epoch, update, DAY, bars, quotes


class TimeTests(unittest.TestCase):
    def test_ist_midnight_is_previous_utc_day(self):
        instant = datetime.fromisoformat('2026-10-05T00:00:00+05:30').timestamp()
        self.assertEqual(datetime.fromtimestamp(instant, timezone.utc).isoformat(), '2026-10-04T18:30:00+00:00')
        self.assertEqual(iso(instant), '2026-10-05T00:00:00+05:30')
        self.assertEqual(iso(instant - 1)[:10], '2026-10-04')

    def test_unix_epoch_tick_uses_ist_not_host_timezone(self):
        with tempfile.TemporaryDirectory() as t:
            state = prepared(Path(t))
            state.early_tick(update('09:46:00',104.5),epoch('09:46:00')+.1,epoch('09:46:00')+.2)
            event = state.early_tick(update('09:46:01',105.2),epoch('09:46:01')+.1,epoch('09:46:01')+.2)
            self.assertEqual(event['Signal_Time'],'09:46')
            self.assertEqual(event['Issued_At'][:10],DAY)
            self.assertTrue(event['Issued_At'].endswith('+05:30'))
            self.assertEqual(datetime.fromisoformat(event['Issued_At']).astimezone(timezone.utc).hour,4)

    def test_future_receipt_or_stale_chain_cannot_issue(self):
        for change in ('future_tick','old_chain'):
            with tempfile.TemporaryDirectory() as t:
                state=prepared(Path(t))
                if change=='old_chain':
                    state.snapshots[0]['received']['TEST']=epoch('09:46:01')-CHAIN_MAX_AGE-1
                state.early_tick(update('09:46:00',104.5),epoch('09:46:00')+.1,epoch('09:46:00')+.2)
                msg=update('09:46:01',105.2)
                if change=='future_tick':msg['recv_ts']=epoch('09:47:01')
                self.assertIsNone(state.early_tick(msg,epoch('09:46:01')+.1,epoch('09:46:01')+.2))

    def test_wrong_bar_boundary_is_rejected(self):
        scanner=Scanner(DAY,{}, {})
        with self.assertRaises(ValueError):
            scanner.step('09:45:00',{'TEST':bars()[-1] | {'hm':'09:45:00'}},{})

    def test_expiry_mix_cannot_generate_signal(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t))
            trigger=dict(hm='09:45:00',o=104.5,h=105.2,l=104.5,c=105.2)
            mixed=quotes()+[dict(quotes()[0],expiry='2026-11-24')]
            self.assertIsNone(state.scanner.evaluate('TEST',bars(),trigger,mixed,'09:50:00'))

    def test_day_rollover_clears_old_ticks_and_alerts(self):
        with tempfile.TemporaryDirectory() as t:
            state=prepared(Path(t))
            state.prices['TEST']=(100,epoch('09:46:00'));state.early['TEST']={};state.processed.add('09:15:00')
            state.start_day('2026-10-02')
            self.assertIsNone(state.scanner)
            self.assertEqual(state.prices,{})
            self.assertEqual(state.early,{})
            self.assertEqual(state.processed,set())


if __name__=='__main__':
    unittest.main()
