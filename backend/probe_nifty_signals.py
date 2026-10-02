"""Read-only schema/connectivity probe; no quote is treated as a live fill."""
import json
from urllib.parse import urlencode,quote
import nifty_oi_close as feed
from nifty_signals import prior_levels
h={'Authorization':'Bearer '+feed.read_token('/home/ubuntu/ocelot/tokens.json'),'Accept':'application/json'}
data=feed.request_json('https://api.upstox.com/v2/market-quote/quotes?'+urlencode({'instrument_key':feed.KEY}),h).get('data',{})
q=next((v for v in data.values() if v.get('instrument_token')==feed.KEY),None)
assert q and q.get('last_price',0)>0
print(json.dumps({'quote_time_fields':{k:q.get(k) for k in ['timestamp','last_trade_time']}}))
date,rows=prior_levels('2026-10-02')
contracts=feed.request_json('https://api.upstox.com/v2/option/contract?'+urlencode({'instrument_key':feed.KEY}),h)['data']
contract=next(r for r in contracts if r['expiry']==rows[0][2] and r['instrument_type']=='CE' and r['strike_price']==22500)
response=feed.request_json('https://api.upstox.com/v3/historical-candle/intraday/'+quote(contract['instrument_key'],safe='')+'/minutes/1',h)
assert isinstance(response.get('data',{}).get('candles'),list)
print(json.dumps({'quote_schema':'valid','previous_levels_date':date,'expiry':rows[0][2],'option_candle_endpoint':'valid','live_freshness':'not tested on holiday','published':False}))
