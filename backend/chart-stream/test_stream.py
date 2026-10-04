import asyncio,json,sys,types,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
# Pure transport tests: no market history or recorder is opened.
module=types.ModuleType('history_store')
class History:
    def __init__(self,*args):self.calls=0
    def snapshot(self,*args):self.calls+=1;return []
module.HistoryStore=History
sys.modules['history_store']=module
from server import Hub
from bar_aggregator import parse_feed_line
class Socket:
    def __init__(self,commands=[]):self.messages=[];self.commands=commands;self.closed=False
    async def send(self,text):self.messages.append(json.loads(text))
    async def close(self,**kw):self.closed=True
    def __aiter__(self):return self
    async def __anext__(self):
        if not self.commands:raise StopAsyncIteration
        return json.dumps(self.commands.pop(0))
class Tests(unittest.IsolatedAsyncioTestCase):
    async def test_history_false_does_not_load_files(self):
        hub=Hub({});ws=Socket([{'type':'subscribe','symbols':[],'history':False}])
        await hub.handler(ws)
        self.assertEqual(hub.history.calls,0)
        self.assertTrue(ws.messages[0]['receipt_timestamps'])
        self.assertTrue(ws.messages[1]['live_only'])
        self.assertEqual(ws.messages[1]['bars'],[])
    async def test_overflow_does_not_block_other_client(self):
        hub=Hub({});slow,fast=Socket(),Socket()
        for ws in (slow,fast):hub.clients[ws]=set();hub.queues[ws]=asyncio.Queue(maxsize=1)
        hub.queues[slow].put_nowait({})
        await asyncio.wait_for(hub.broadcast({'symbol':'TEST'}),timeout=.1)
        self.assertNotIn(slow,hub.clients)
        self.assertEqual(hub.queues[fast].get_nowait()['symbol'],'TEST')
    async def test_parser_preserves_original_trade_and_receipt(self):
        line=json.dumps({'recv_ts':1000.5,'msg':{'feeds':{'NSE_EQ|A':{'fullFeed':{'marketFF':{'ltpc':{'ltp':100,'ltt':'999000'},'vtt':10}}}}}})
        self.assertEqual(parse_feed_line(line),[('NSE_EQ|A',1000.5,100.,10.)])
        self.assertEqual(parse_feed_line(line,include_metadata=True)[0][-1],999.)
if __name__=='__main__':unittest.main()
