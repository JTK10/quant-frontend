"""Causal option-pressure proxy. Stdlib only; no orders, broker calls or ML claims."""
import math
from datetime import datetime, timedelta

VERSION = 'chart-flow-v1'

def finite(x):
    return isinstance(x, (int, float)) and math.isfinite(x)

def build_rows(current, previous=None):
    cut = datetime.fromisoformat(current['date']+'T'+current['cut'])
    preceding = cut-timedelta(minutes=5)
    consecutive = previous and previous.get('date') == current['date'] and previous.get('expiry') == current.get('expiry') and previous.get('cut') == preceding.strftime('%H:%M:00')
    result=[]
    for symbol, chains in sorted(current.get('chains', {}).items()):
        row=[symbol,None]
        candle=current.get('candles', {}).get(symbol,{})
        spot=candle.get('close')
        receipt=current.get('chain_received',{}).get(symbol)
        if current.get('degraded',True) or candle.get('time') != preceding.strftime('%H:%M') or not finite(spot) or spot<=0 or not finite(receipt) or not 0<=current['exported_at']-receipt<=90:
            result.append(row);continue
        quotes={(q['strike'],q['leg']):q for q in current.get('quotes',{}).get(symbol,[])}
        prior={(q['strike'],q['leg']):q for q in (previous or {}).get('quotes',{}).get(symbol,[])} if consecutive else {}
        legs={}
        for leg in ('CE','PE'):
            candidates=[]
            for strike, side, ltp, oi, prev_oi, volume in chains:
                if side!=leg or not finite(strike) or abs(strike/spot-1)>.03:continue
                q=quotes.get((strike,leg),{})
                bid,ask,bq,aq=[q.get(k) for k in ('bid','ask','bid_qty','ask_qty')]
                if not all(finite(x) for x in (bid,ask,bq,aq,oi,prev_oi,volume)) or not 0<bid<=ask or min(bq,aq)<=0:continue
                mid=(bid+ask)/2
                if (ask-bid)/mid>.05:continue
                old=prior.get((strike,leg),{})
                oldbid,oldask,oldvol=[old.get(k) for k in ('bid','ask','volume')]
                turnover=signed=None
                if all(finite(x) for x in (oldbid,oldask,oldvol)) and oldbid+oldask>0 and volume>=oldvol:
                    delta=mid-(oldbid+oldask)/2
                    turnover=(volume-oldvol)*mid
                    signed=(1 if delta>0 else -1 if delta<0 else 0)*turnover
                candidates.append((abs(strike/spot-1),strike,bq,aq,oi,prev_oi,turnover,signed))
            chosen=sorted(candidates,key=lambda x:(x[0],x[1]))[:3]
            quantity=sum(q[2]+q[3] for q in chosen);den=sum(q[5] for q in chosen)
            turns=[q[6] for q in chosen if q[6] is not None]
            if not quantity or den<=0 or not turns:break
            legs[leg]=(sum(q[2]-q[3] for q in chosen)/quantity, sum(q[4]-q[5] for q in chosen)/den*100, sum(turns),sum(q[7] for q in chosen if q[7] is not None))
        if len(legs)==2:
            ce,pe=legs['CE'],legs['PE'];turnover=ce[2]+pe[2]
            if turnover>0:
                depth=(ce[0]-pe[0])/2
                flow=(ce[3]-pe[3])/turnover
                value=.4*depth+.4*flow+.2*math.tanh((pe[1]-ce[1])/5)
                row[1]=round(max(-1,min(1,value)),6)
        result.append(row)
    return result
