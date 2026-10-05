import json
import time
import unittest
from unittest.mock import patch
import httpx
from kairos2_engine import MODEL
import kairos2_live as live


class TransportTests(unittest.IsolatedAsyncioTestCase):
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
