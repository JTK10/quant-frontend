import unittest
from datetime import datetime
from zoneinfo import ZoneInfo
from telegram_signal_relay import rusty_alerts
class RustyTests(unittest.TestCase):
 def test_policy(self):
  now=datetime(2026,10,19,10,1,tzinfo=ZoneInfo('Asia/Kolkata')).timestamp()
  row=dict(s='ITC',flow_type='CE_OI_SHARP_DROP',flow_label='CE OI Sharp Drop',ce_pct=-6,mv=1.2,pe_pct=-1)
  doc=dict(source='rusty',sig_date='20261019',cut='10:00',ts=now-10,bull=[row])
  alerts=rusty_alerts(doc,now,now-30);self.assertEqual(len(alerts),1)
  self.assertEqual(alerts[0]['id'],rusty_alerts(dict(doc,cut='09:55'),now,now-30)[0]['id'])
  self.assertFalse(rusty_alerts(doc,now,now))
  for change in [dict(sig_date='20261016'),dict(source='other'),dict(ts=now+1),dict(ts=now-301),dict(cut='10:05'),dict(cut='09:30')]:
   self.assertFalse(rusty_alerts(dict(doc,**change),now,now-1000))
  for change in [dict(ce_pct=-4),dict(mv=.9),dict(ce_pct=None),dict(ce_pct=float('nan')),dict(flow_type='CE_DOWN_PE_UP'),dict(flow_label='PE OI Rising')]:
   self.assertFalse(rusty_alerts(dict(doc,bull=[dict(row,**change)]),now,now-30))
if __name__=='__main__':unittest.main()
