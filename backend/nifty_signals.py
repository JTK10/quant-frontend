"""Causal Nifty paper signals. REST only; never opens the production database."""
import json
import base64
import math
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import quote, urlencode
import nifty_oi_close as feed

SOURCE = 'nifty_paper_signals'
ROOT = Path('/home/ubuntu/nifty-signals/data')

def prior_levels(day):
    cfg=json.loads(Path('/home/ubuntu/ocelot/ords.json').read_text())
    basic=base64.b64encode(f"{cfg['client_id']}:{cfg['client_secret']}".encode()).decode()
    token=feed.request_json(cfg['base']+'/oauth/token',{'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},b'grant_type=client_credentials')['access_token']
    for offset in range(1,15):
        prior=(datetime.fromisoformat(day)-timedelta(days=offset)).date().isoformat()
        data=feed.request_json(cfg['base']+cfg['path']+'?'+urlencode({'src':'nifty_oi_close','sig_date':prior.replace('-','')}),{'Authorization':'Bearer '+token})
        docs=[]
        for item in data.get('items',[]):
            doc=item.get('doc',item)
            if isinstance(doc,str): doc=json.loads(doc)
            if doc.get('source')=='nifty_oi_close' and str(doc.get('sig_date'))==prior.replace('-','') and not doc.get('degraded'):
                docs.append(doc)
        for doc in sorted(docs,key=lambda d:d.get('ts',0),reverse=True):
            rows=[r for r in doc.get('oi_levels',[]) if r[0]=='NIFTY 50' and r[2]>=day]
            if rows: return prior,rows
    raise ValueError('Prior-session closing OI levels unavailable; no signal')

def minute(stamp):
    d = datetime.fromisoformat(stamp).astimezone(feed.IST)
    return d.hour * 60 + d.minute

def quote_epoch(q):
    # Response timestamp is request-generation time, not necessarily price time.
    # Require the actual last-trade/feed timestamp; never use response time alone.
    value=q.get('last_trade_time')
    if isinstance(value,(int,float)) or isinstance(value,str) and value.isdigit():
        return float(value)/1000
    if isinstance(value,str):
        return datetime.fromisoformat(value).timestamp()
    return 0

def candle(bars, cut):
    rows = [bars.get(m) for m in range(cut-5, cut)]
    if any(r is None for r in rows):
        return None
    return dict(open=rows[0][1], high=max(r[2] for r in rows), low=min(r[3] for r in rows), close=rows[-1][4])

def candidates(bars, cut, support, resistance):
    c, prior = candle(bars, cut), bars.get(cut-6)
    if not c:
        return []
    found = []
    for side, walls in [('BULL', support), ('BEAR', resistance)]:
        s = 1 if side == 'BULL' else -1
        for level in walls:
            extremum = c['low'] if s == 1 else c['high']
            if prior and abs(c['close']-c['open'])/(c['high']-c['low'] or 1) >= .4 and -15 <= s*(extremum-level) <= 5 and s*(c['close']-level) >= 3 and s*(prior[4]-level) >= -2 and s*(c['close']-c['open']) > 0:
                found.append(dict(strategy='reversal_standard', side=side, level=level, stop=extremum-s*3))
    for lookback in [10,15,20]:
        old = cut-lookback
        b, p = candle(bars, old), bars.get(old-6)
        if old < 575 or not b or not p:
            continue
        for side, walls in [('BULL',resistance),('BEAR',support)]:
            s = 1 if side == 'BULL' else -1
            for level in walls:
                extremum = c['low'] if s == 1 else c['high']
                if s*(p[4]-level) <= 0 and s*(b['close']-level) >= 5 and -8 <= s*(extremum-level) <= 4 and s*(c['close']-level) >= 2 and s*(c['close']-c['open']) > 0:
                    found.append(dict(strategy='break_and_retest',side=side,level=level,stop=extremum-s*3))
    return found

def oi_change(series, center, width, start, end):
    result = {}
    for leg in ['CE','PE']:
        pairs = []
        for strike in range(int(center-width),int(center+width)+1,50):
            bars = series.get((leg,strike),{})
            a,b = bars.get(start),bars.get(end)
            if not a or not b or len(a)<7 or len(b)<7 or a[6]<=0 or b[6]<=0:
                raise ValueError('Incomplete positive OI endpoints; no signal')
            pairs.append((a[6],b[6]))
        before,after = sum(p[0] for p in pairs),sum(p[1] for p in pairs)
        result[leg] = dict(before=before,after=after,delta=after-before,pct=100*(after/before-1),contracts=len(pairs))
    return result

def accepts(side, market, wall):
    own,opp = ('PE','CE') if side=='BULL' else ('CE','PE')
    return all(x[own]['delta']>0 and x[opp]['delta']<0 for x in [market,wall])

def save(state, path):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(state,allow_nan=False))
    temp.replace(path)

def main():
    now = datetime.now(feed.IST)
    day = now.date().isoformat()
    path = ROOT/(day+'.json')
    state = json.loads(path.read_text()) if path.exists() else {'date':day,'signals':[]}
    state.pop('reason',None)
    token = feed.read_token('/home/ubuntu/ocelot/tokens.json')
    headers = {'Authorization':'Bearer '+token,'Accept':'application/json'}
    def get(route,params=None):
        return feed.request_json('https://api.upstox.com'+route+('?' + urlencode(params) if params else ''),headers)
    def bars(key):
        rows = get('/v3/historical-candle/intraday/'+quote(key,safe='')+'/minutes/1').get('data',{}).get('candles',[])
        return {minute(r[0]):r for r in rows if r[0][:10]==day and datetime.fromisoformat(r[0]).timestamp()+60<=time.time()}
    try:
        timings = get('/v2/market/timings/'+day).get('data',[])
        if not all(any(r.get('exchange')==exchange for r in timings) for exchange in ['NSE','NFO']):
            state['status']='Market closed: no signals for this date'
        else:
            index = bars(feed.KEY)
            # Resolve existing paper trades only using fully subsequent minutes.
            for signal in state['signals']:
                if signal['outcome']!='OPEN':
                    continue
                start = signal['generated_minute']+1
                for m in sorted(k for k in index if k>=start):
                    r = index[m]; s = 1 if signal['side']=='BULL' else -1
                    stop_hit = r[3]<=signal['stop'] if s==1 else r[2]>=signal['stop']
                    target_hit = r[2]>=signal['target'] if s==1 else r[3]<=signal['target']
                    if stop_hit or target_hit or m>=start+120 or m>=929:
                        signal['outcome']='STOP' if stop_hit else 'TARGET' if target_hit else 'TIME_EXIT'
                        signal['exit_time']=f'{m//60:02}:{m%60:02}'
                        signal['ambiguous_bar']=bool(stop_hit and target_hit)
                        break
            current = now.hour*60+now.minute
            cut = current//5*5
            if not 630<=cut<=840:
                state['status']='Outside entry window (10:30–14:00 IST)'
            elif state.get('last_cut')==cut:
                state['status']='Completed this candle scan'
            elif current!=cut:
                state['status']='Missed scan time; historical entries are not issued live'
            elif any(s['outcome']=='OPEN' for s in state['signals']) or len(state['signals'])>=2:
                state['status']='Paper exposure limit: one open trade, two entries per day'
            else:
                state['levels_date'],rows=prior_levels(day)
                row = sorted(rows,key=lambda r:r[2])[0]
                state['expiry']=row[2]
                support,resistance = [r[0] for r in row[3]],[r[0] for r in row[4]]
                state['support'],state['resistance']=support,resistance
                found = candidates(index,cut,support,resistance)
                if cut-12 not in index or cut-1 not in index:
                    raise ValueError('Current-date completed index candles unavailable; no signal')
                series = {}
                atm = math.floor(index[cut-12][4]/50+.5)*50
                if found:
                    contracts = get('/v2/option/contract',{'instrument_key':feed.KEY}).get('data',[])
                    needed = set(range(atm-200,atm+201,50))
                    for event in found:
                        needed.update(range(int(event['level'])-50,int(event['level'])+51,50))
                    for strike in sorted(needed):
                        for leg in ['CE','PE']:
                            matches = [r for r in contracts if r.get('expiry')==row[2] and r.get('instrument_type')==leg and r.get('strike_price')==strike]
                            if len(matches)!=1:
                                raise ValueError('Required same-expiry contract missing; no signal')
                            series[(leg,strike)] = bars(matches[0]['instrument_key'])
                            time.sleep(.15)
                    market = oi_change(series,atm,200,cut-12,cut-2)
                    for event in found:
                        wall = oi_change(series,event['level'],50,cut-12,cut-2)
                        if not accepts(event['side'],market,wall):
                            continue
                        quote_data = get('/v2/market-quote/quotes',{'instrument_key':feed.KEY}).get('data',{})
                        q = next((v for v in quote_data.values() if v.get('instrument_token')==feed.KEY),None)
                        generated = datetime.now(feed.IST)
                        if not q or not 0<=time.time()-quote_epoch(q)<=30 or generated.timestamp()-now.replace(second=0,microsecond=0).timestamp()>90:
                            raise ValueError('Fresh entry quote unavailable or scan delayed; no signal')
                        entry = float(q['last_price']); s = 1 if event['side']=='BULL' else -1
                        risk = s*(entry-event['stop'])
                        if not 8<=risk<=60:
                            continue
                        if state['signals'] and (cut-state['signals'][-1]['cut_minute']<30 or 'exit_time' in state['signals'][-1] and cut-(int(state['signals'][-1]['exit_time'][:2])*60+int(state['signals'][-1]['exit_time'][3:]))<5):
                            continue
                        state['signals'].append({**event,'entry':entry,'target':entry+s*3*risk,'risk':risk,'rr':3,'time':f'{cut//60:02}:{cut%60:02}','cut_minute':cut,'generated_at':generated.isoformat(),'generated_minute':generated.hour*60+generated.minute,'market_oi':market,'wall_oi':wall,'oi_start':cut-12,'oi_end':cut-2,'outcome':'OPEN','mode':'LIVE_PAPER'})
                        break
                state['last_cut']=cut
                state['status']='Scan complete; no qualifying entry' if not any(s['cut_minute']==cut for s in state['signals']) else 'Paper signal generated'
    except (ValueError,RuntimeError) as exc:
        state['status']='Data unavailable; signals suppressed'
        state['reason']=str(exc)
    state['checked_at']=datetime.now(feed.IST).isoformat()
    save(state,path)
    feed.SOURCE=SOURCE
    doc={'source':SOURCE,'cap':'NIFTY_PAPER','name':'NIFTY 50','sig_date':day.replace('-',''),'date':day,'cut':now.strftime('%H:%M'),'ts':time.time(),'capture_id':f'{day}-{now.strftime("%H%M%S")}',**state}
    print(json.dumps({'date':day,'status':state['status'],'signals':len(state['signals']),'publication':feed.publish(doc,'/home/ubuntu/ocelot/ords.json')}))

if __name__=='__main__':
    main()
