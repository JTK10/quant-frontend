import json
import time
import unittest
from unittest.mock import patch

import httpx
import rusty_live as live


CFG = dict(base='https://local.test', path='/signals', client_id='test', client_secret='test')


class TransportTests(unittest.IsolatedAsyncioTestCase):
    async def test_broker_get_only_and_depth_parsing(self):
        calls = []
        def handler(request):
            calls.append((request.method, request.url.path))
            return httpx.Response(200, json={'status': 'success', 'data': {'example': {
                'instrument_token': 'NSE_FO|123', 'timestamp': int(time.time()*1000),
                'last_trade_time': str(int(time.time()*1000)),
                'depth': {'buy': [{'price': 99, 'quantity': 100}], 'sell': [{'price': 100, 'quantity': 100}]}}}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live, 'token', return_value='test'):
                b = live.Broker(client)
                q = await b.quote('NSE_FO|123')
                self.assertEqual(q['asks'][0]['price'], 100)
                self.assertLess(time.time() - q['quote_at'], 1)
                with self.assertRaises(ValueError): await b.get('/order/place')
        self.assertEqual(calls, [('GET', '/v2/market-quote/quotes')])

    async def test_uncertain_publication_deduplicates_only_rusty_bot(self):
        doc = dict(source='kairos_rusty', date='2026-10-08', sig_date='20261008', Doc_ID='fixed', kind='ENTRY')
        calls = []
        def handler(request):
            calls.append((request.method, request.url.path))
            if request.url.path == '/oauth/token':
                return httpx.Response(200, json={'access_token': 'test', 'expires_in': 3600})
            self.assertEqual(request.url.params['src'], 'kairos_rusty')
            return httpx.Response(200, json={'items': [{'doc': json.dumps(doc)}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live, 'read_json', return_value=CFG):
                await live.Publisher(client).send(doc)
        self.assertEqual(calls, [('POST', '/oauth/token'), ('GET', '/signals')])

    async def test_read_refreshes_401_and_filters_source_date(self):
        calls = []
        def handler(request):
            calls.append(request.url.path)
            if request.url.path == '/oauth/token':
                return httpx.Response(200, json={'access_token': 'test', 'expires_in': 3600})
            if calls.count('/signals') == 1:
                return httpx.Response(401)
            self.assertEqual(request.url.params['src'], 'rusty')
            return httpx.Response(200, json={'items': [{'doc': json.dumps(d)} for d in [
                dict(source='rusty', sig_date='20261008'), dict(source='pallas', sig_date='20261008'),
                dict(source='rusty', sig_date='20261007')]]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live, 'read_json', return_value=CFG):
                docs = await live.Publisher(client).read('2026-10-08', 'rusty')
        self.assertEqual(len(docs), 1)
        self.assertEqual(calls.count('/oauth/token'), 2)

    async def test_partial_or_oversized_response_fails_closed(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json={'hasMore': True}))) as client:
            with patch.object(live, 'read_json', return_value=CFG):
                p = live.Publisher(client); p.access = 'test'; p.expires = time.time()+1000
                with self.assertRaises(ValueError): await p.read('2026-10-08', 'rusty')
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b' ' * 101))) as client:
            with self.assertRaises(ValueError):
                await live.bounded_response(client, 'GET', 'https://local.test', response_limit=100)

    async def test_rate_limit_cooldown(self):
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(429)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with patch.object(live, 'token', return_value='test'):
                b = live.Broker(client)
                with self.assertRaises(RuntimeError): await b.get('/market-quote/quotes')
                with self.assertRaises(RuntimeError): await b.get('/market-quote/quotes')
        self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
