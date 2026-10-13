import asyncio,json,tempfile,unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import server
from bar_aggregator import CandleAggregator
class FakeSocket:
    def __init__(self):self.sent=[]
    async def send(self,value):self.sent.append(json.loads(value))
class StreamRecoveryTest(unittest.IsolatedAsyncioTestCase):
    async def test_partial_malformed_recovery(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'feed.jsonl';line=json.dumps({'recv_ts':1791863100,'msg':{'feeds':{'EQ':{'fullFeed':{'marketFF':{'ltpc':{'ltp':100},'vtt':50}}}}}})+'\n'
            path.write_text(line[:25]);original_path=server.current_feed_path;server.current_feed_path=lambda:path
            hub=server.Hub({'EQ':'TEST'});socket=FakeSocket();hub.clients[socket]={'TEST'}
            hub.history=type('Empty',(),{'snapshot':lambda *a:[]})()
            task=asyncio.create_task(server.tail_feed(hub))
            try:
                await asyncio.sleep(.05);self.assertEqual(hub.aggregator.snapshot(),[])
                with path.open('a') as f:f.write(line[25:])
                await asyncio.sleep(.3)
                self.assertEqual(hub.aggregator.snapshot()[0]['close'],100)
                self.assertEqual(len(socket.sent),1);self.assertEqual(socket.sent[0]['type'],'snapshot')
                with path.open('a') as f:f.write('{bad}\n'+line.replace('100','101'))
                await asyncio.sleep(.3);self.assertFalse(task.done())
            finally:
                task.cancel();await asyncio.gather(task,return_exceptions=True);server.current_feed_path=original_path
    async def test_unsubscribed_never_gets_universe(self):
        hub=server.Hub({});hub.recovering=False;s=FakeSocket();hub.clients[s]=set();q=hub.queues[s]=asyncio.Queue()
        await hub.broadcast({'symbol':'TEST'});self.assertTrue(q.empty())
    async def test_existing_pallas_wildcard_compatible(self):
        hub=server.Hub({});hub.recovering=False;s=FakeSocket();hub.clients[s]=set();hub.wildcard_clients.add(s);q=hub.queues[s]=asyncio.Queue()
        await hub.broadcast({'symbol':'TEST'});self.assertEqual(q.get_nowait()['symbol'],'TEST')
class AggregatorGuardTest(unittest.TestCase):
    def test_time_never_rewinds(self):
        a=CandleAggregator();a.push(instrument_key='EQ',symbol='T',epoch_seconds=600,ltp=100,vtt=1)
        self.assertEqual(a.push(instrument_key='EQ',symbol='T',epoch_seconds=300,ltp=90,vtt=2),[])
        self.assertEqual(a.snapshot()[0]['time'],600)
    def test_nonfinite_rejected(self):
        a=CandleAggregator();self.assertEqual(a.push(instrument_key='EQ',symbol='T',epoch_seconds=float('nan'),ltp=100,vtt=1),[])
if __name__=='__main__':unittest.main()
