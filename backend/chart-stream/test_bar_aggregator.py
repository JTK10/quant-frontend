import json
import unittest
from bar_aggregator import parse_feed_line, CandleAggregator

class IndexFeedTest(unittest.TestCase):
    def test_index_without_volume_and_equity(self):
        line = json.dumps({'recv_ts': 1790827200, 'msg': {'feeds': {
            'NSE_INDEX|Nifty 50': {'fullFeed': {'indexFF': {'ltpc': {'ltp': 22550}}}},
            'NSE_EQ|sample': {'fullFeed': {'marketFF': {'ltpc': {'ltp': 100}, 'vtt': 50}}},
            'NSE_EQ|invalid': {'fullFeed': {'marketFF': {'ltpc': {'ltp': 100}}}},
        }}})
        rows = parse_feed_line(line)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][-1], 0)
        engine = CandleAggregator()
        for key, epoch, ltp, vtt in rows:
            engine.push(instrument_key=key, symbol=key, epoch_seconds=epoch, ltp=ltp, vtt=vtt)
        update = engine.push(instrument_key=rows[0][0], symbol=rows[0][0], epoch_seconds=rows[0][1]+1, ltp=22560, vtt=0)
        self.assertEqual(update[-1]['close'], 22560)
        self.assertEqual(update[-1]['volume'], 0)
        self.assertEqual(len(engine.snapshot()), 2)

if __name__ == '__main__':
    unittest.main()
