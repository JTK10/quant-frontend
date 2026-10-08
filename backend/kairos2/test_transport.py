import json
import time
import unittest
import tempfile
from unittest.mock import patch, AsyncMock
import httpx
from kairos2_engine import MODEL
import kairos2_live as live
from test_kairos2 import Trader, event, quote, contract, NOW, OPEN, CLOSE


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_runner_exits_through_live_monitor_before_market_closes(self):
        with tempfile.TemporaryDirectory() as root:
            trader=Trader(root,NOW-100)
            trader.enter(event(Pole_Move_Pct=2),contract(),quote(),NOW,OPEN,CLOSE)
            trader.mark(quote(NOW+5,ask=126,bid=125),NOW+5)
            trader=Trader(root,CLOSE-120)  # Restart must preserve runner and daily lock.
            before=CLOSE-61
            broker=AsyncMock()
            broker.quote.return_value=quote(before,ask=125,bid=124)
            with patch.object(live.time,'time',return_value=before):
                await live.monitor_position(trader,broker,[(OPEN,CLOSE)],before,0)
            self.assertIsNotNone(trader.state['position'])
            due=CLOSE-60
            broker.quote.return_value=quote(due,ask=125,bid=124)
            with patch.object(live.time,'time',return_value=due):
                await live.monitor_position(trader,broker,[(OPEN,CLOSE)],due,0)
            self.assertIsNone(trader.state['position'])
            exit=trader.state['pending'][-1]
            self.assertEqual(exit['reason'],'RUNNER_EOD_EXIT')
            self.assertEqual(exit['entry'],124)
            self.assertEqual(exit['pnl'],7200)
            self.assertTrue(trader.state['taken'])

    async def test_runner_retries_stale_quote_inside_exit_buffer(self):
        with tempfile.TemporaryDirectory() as root:
            trader=Trader(root,NOW-100)
            trader.enter(event(Pole_Move_Pct=2),contract(),quote(),NOW,OPEN,CLOSE)
            trader.mark(quote(NOW+5,ask=126,bid=125),NOW+5)
            due=CLOSE-60
            broker=AsyncMock()
            broker.quote.return_value={**quote(due-31,ask=125,bid=124),'received_at':due}
            with patch.object(live.time,'time',return_value=due):
                next_quote=await live.monitor_position(trader,broker,[(OPEN,CLOSE)],due,0)
            self.assertIsNotNone(trader.state['position'])
            self.assertEqual(next_quote,due+5)
            broker.quote.return_value=quote(due+5,ask=125,bid=124)
            with patch.object(live.time,'time',return_value=due+5):
                await live.monitor_position(trader,broker,[(OPEN,CLOSE)],due+5,next_quote)
            self.assertIsNone(trader.state['position'])
            self.assertEqual(broker.quote.await_count,2)

    async def test_closed_exchange_never_fabricates_an_exit(self):
        with tempfile.TemporaryDirectory() as root:
            trader=Trader(root,NOW-100)
            trader.enter(event(Pole_Move_Pct=2),contract(),quote(),NOW,OPEN,CLOSE)
            broker=AsyncMock()
            await live.monitor_position(trader,broker,[(OPEN,CLOSE)],CLOSE,0)
            broker.quote.assert_not_awaited()
            self.assertIsNotNone(trader.state['position'])
            self.assertIn('Exit pending',trader.state['status'])

    async def test_get_only_broker_parses_depth_and_exchange_ms(self):
        calls=[]
        def handler(request):
            calls.append((request.method,request.url.path))
            return httpx.Response(200,json={'status':'success','data':{'example':{
                'instrument_token':'NSE_FO|123','timestamp':int(time.time()*1000),
                'last_trade_time':str(int(time.time()*1000)),
                'depth':{'buy':[{'price':10,'quantity':100}], 'sell':[{'price':11,'quantity':100}]}}}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live,'token',return_value='local-test'):
                broker=live.Broker(client)
                quote=await broker.quote('NSE_FO|123')
                self.assertLess(time.time()-quote['quote_at'],1)
                self.assertEqual(quote['asks'][0]['price'],11)
                with self.assertRaises(ValueError): await broker.get('/order/place')
        self.assertEqual(calls,[('GET','/v2/market-quote/quotes')])

    async def test_publisher_recovers_uncertain_post_without_duplicate(self):
        doc={'source':'kairos2','date':'2026-10-05','sig_date':'20261005','Doc_ID':'fixed','kind':'ENTRY'}
        cfg={'base':'https://local.test','path':'/signals','client_id':'test','client_secret':'test'}
        calls=[]
        def handler(request):
            calls.append((request.method,request.url.path))
            if request.url.path=='/oauth/token':
                return httpx.Response(200,json={'access_token':'local-test','expires_in':3600})
            return httpx.Response(200,json={'items':[{'doc':json.dumps(doc)}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live,'read_json',return_value=cfg):
                await live.Publisher(client).send(doc)
        self.assertEqual(calls,[('POST','/oauth/token'),('GET','/signals')])

    async def test_rate_limit_enforces_retry_cooldown(self):
        calls=[]
        def handler(request):
            calls.append(request)
            return httpx.Response(429,json={'error':'test'})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live,'token',return_value='local-test'):
                b=live.Broker(client)
                with self.assertRaises(RuntimeError): await b.get('/market-quote/quotes')
                with self.assertRaises(RuntimeError): await b.get('/market-quote/quotes')
        self.assertEqual(len(calls),1)


if __name__=='__main__': unittest.main()
