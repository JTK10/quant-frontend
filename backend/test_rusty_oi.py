import asyncio, json, tempfile, unittest
from pathlib import Path
from datetime import datetime
import rusty_oi as m

class Crossings(unittest.TestCase):
 def setUp(self):
  self.day='2026-10-12';self.sessions={'2026-10-07':{'ITC':['ITC',264,'2026-10-27',[[255,1,0]],[[265,1,0]]]}}
 def calc(self,cut,bars,side='bear',sessions=None):return m.calculate(self.day,cut,'ITC',side,self.sessions if sessions is None else sessions,bars)
 def test_itc_first_candle_crosses_ce_line_bearishly(self):
  bars={'09:15':[267.2,263.7]}
  self.assertEqual(self.calc('09:15',bars)['oi_broken'],None)
  self.assertEqual(self.calc('09:20',bars),{'oi_broken':True,'oi_break_time':'09:20'})
  self.assertFalse(self.calc('09:20',bars,'bull')['oi_broken'])
 def test_wick_touch_and_equal_close_do_not_confirm(self):
  self.assertFalse(self.calc('09:20',{'09:15':[267,265]})['oi_broken'])
 def test_second_candle_and_causal_cut(self):
  bars={'09:15':[267,266],'09:20':[266,264]}
  self.assertFalse(self.calc('09:20',bars)['oi_broken'])
  self.assertEqual(self.calc('09:25',bars)['oi_break_time'],'09:25')
 def test_missing_bar_is_unknown(self):
  self.assertIsNone(self.calc('09:25',{'09:20':[267,264]})['oi_broken'])
 def test_expiry_future_and_old_lines_excluded(self):
  for day,expiry in [('2026-10-12','2026-10-27'),('2026-10-13','2026-10-27'),('2026-10-01','2026-10-27'),('2026-10-09','2026-10-09')]:
   s={day:{'ITC':['ITC',264,expiry,[],[[265,1,0]]]}}
   self.assertIsNone(self.calc('09:20',{'09:15':[267,264]},sessions=s)['oi_broken'])
 def test_three_latest_sessions_only(self):
  s={f'2026-10-{d:02}':{'ITC':['ITC',264,'2026-10-27',[],[[265 if d==6 else 270,1,0]]]} for d in [6,7,8,9]}
  self.assertFalse(self.calc('09:20',{'09:15':[267,264]},sessions=s)['oi_broken'])
 def test_gap_already_beyond_line_is_not_an_intracandle_cross(self):
  self.assertFalse(self.calc('09:20',{'09:15':[264,263]})['oi_broken'])
 def test_restart_and_day_reset(self):
  old=m.STATE_PATH
  try:
   with tempfile.TemporaryDirectory() as tmp:
    m.STATE_PATH=Path(tmp)/'state.json';m._state=None;m.record(self.day,'ITC',[('09:15',267,264)]);m.save();m._state=None
    self.assertEqual(m.state(self.day)['bars']['ITC']['09:15'],[267,264])
    self.assertEqual(m.state('2026-10-13')['bars'],{})
  finally:m.STATE_PATH=old;m._state=None
if __name__=='__main__':unittest.main()
