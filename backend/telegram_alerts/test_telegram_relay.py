import unittest
import json
import tempfile
import urllib.error
from pathlib import Path
from unittest.mock import patch
from telegram_signal_relay import pallas_alert, kairos_alert, epoch, Relay

class FilterTests(unittest.TestCase):
    def setUp(self):
        self.now=epoch('2026-10-05T10:01:00+05:30')
        self.event=dict(Event_ID='one',Event_Type='CONFIRMED_CLOSE',Confirmation_Status='CONFIRMED',Recovered=False,AI_Status='SCORED',AI_Score=.71,Date='2026-10-05',Issued_At='2026-10-05T10:00:00+05:30',Side='BEAR',Symbol='TEST',Selected_Strike='100 PE',Expiry='2026-10-27',Breakout_Spot=100,Reference_Premium=5)
    def test_strict_threshold(self):
        self.assertIsNotNone(pallas_alert(self.event,self.now,self.now-120))
        for score in (None,True,.7,.69,1.1,float('nan')):
            self.assertIsNone(pallas_alert(dict(self.event,AI_Score=score),self.now,self.now-120))
    def test_no_history_early_future_or_recovered(self):
        self.assertIsNone(pallas_alert(self.event,self.now,self.now))
        for change in (dict(Recovered=True),dict(Date='2026-10-01'),dict(Event_Type='EARLY_TICK'),dict(Confirmation_Status='PENDING_CLOSE'),dict(Issued_At='2026-10-05T10:02:00+05:30'),dict(Issued_At='2026-10-05T09:00:00+05:30')):
            self.assertIsNone(pallas_alert(dict(self.event,**change),self.now,self.now-7200))
    def test_kairos_source_kind_and_mode(self):
        doc=dict(source='kairos2',event='ENTRY',mode='paper',sig_date='20261005',ts=self.now-10,Doc_ID='entry',name='TEST PE',time='10:00:50',entry=5,quantity=100,lots=1,ai_score=.72,stop_premium=4.25)
        self.assertIsNotNone(kairos_alert(doc,self.now,self.now-120))
        self.assertIsNotNone(kairos_alert(dict(doc,event='EXIT',pnl=10),self.now,self.now-120))
        for change in (dict(source='fable'),dict(mode='live'),dict(event='MTM'),dict(event='SKIP'),dict(event='HEALTH'),dict(sig_date='20261001')):
            self.assertIsNone(kairos_alert(dict(doc,**change),self.now,self.now-120))

    def test_persist_before_send_and_no_duplicates(self):
        with tempfile.TemporaryDirectory() as folder:
            relay=Relay.__new__(Relay); relay.path=Path(folder)/'state.json'; relay.state={'seen':{}}
            alert={'id':'entry','issued':self.now,'text':'TEST ONLY'}
            def mock_send(_):
                self.assertEqual(json.loads(relay.path.read_text())['seen']['entry']['status'],'sending')
                return {'ok':True}
            with patch.dict('os.environ',{'TELEGRAM_BOT_TOKEN':'test','TELEGRAM_CHAT_ID':'test'}),patch('telegram_signal_relay.bounded_json',side_effect=mock_send) as send:
                relay.send(alert); relay.send(alert)
                self.assertEqual(send.call_count,1)
                self.assertEqual(relay.state['seen']['entry']['status'],'sent')

    def test_ambiguous_delivery_is_not_replayed(self):
        with tempfile.TemporaryDirectory() as folder:
            relay=Relay.__new__(Relay); relay.path=Path(folder)/'state.json'; relay.state={'seen':{}}
            alert={'id':'entry','issued':self.now,'text':'TEST ONLY'}
            with patch.dict('os.environ',{'TELEGRAM_BOT_TOKEN':'test','TELEGRAM_CHAT_ID':'test'}),patch('telegram_signal_relay.bounded_json',side_effect=TimeoutError) as send:
                relay.send(alert)
                relay.state=json.loads(relay.path.read_text())
                relay.send(alert)
                self.assertEqual(send.call_count,1)
                self.assertEqual(relay.state['seen']['entry']['status'],'uncertain')

    def test_429_retries_only_after_cooldown(self):
        with tempfile.TemporaryDirectory() as folder:
            relay=Relay.__new__(Relay); relay.path=Path(folder)/'state.json'; relay.state={'seen':{}}
            alert={'id':'entry','issued':self.now,'text':'TEST ONLY'}
            error=urllib.error.HTTPError('https://example.invalid',429,'limited',{},None)
            with patch.dict('os.environ',{'TELEGRAM_BOT_TOKEN':'test','TELEGRAM_CHAT_ID':'test'}),patch('telegram_signal_relay.bounded_json',side_effect=[error,{'ok':True}]) as send:
                relay.send(alert); relay.send(alert)
                self.assertEqual(send.call_count,1)
                relay.state['seen']['entry']['retry_at']=0
                relay.send(alert)
                self.assertEqual(send.call_count,2)
                self.assertEqual(relay.state['seen']['entry']['status'],'sent')

if __name__=='__main__': unittest.main()
