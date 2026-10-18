"""Lupus rule scanner. Closed cash bars and prior-session failures only."""
from datetime import datetime, timedelta
import math

def finite(x):return isinstance(x,(int,float)) and math.isfinite(x)
def previous(hm):
    return (datetime.fromisoformat('2000-01-01T'+hm)-timedelta(minutes=5)).strftime('%H:%M')

def failures(day,bars,history):
    prior=sorted(d for d in history if d<day)[-5:]
    known=[w for d in prior for w in history[d].get('walls',[])]
    bulls=[];bears=[];closes={}
    for symbol,bs in bars.items():
        if not bs:continue
        # A whole historical cash session is required for daily failure context.
        if [b[0] for b in bs]!=[(datetime(2000,1,1,9,15)+timedelta(minutes=5*i)).strftime('%H:%M') for i in range(75)]:continue
        if any(not all(finite(x) for x in b[1:]) or b[3]<=0 or not b[3]<=min(b[1],b[4])<=max(b[1],b[4])<=b[2] for b in bs):continue
        closes[symbol]=bs[-1][4]
        groups={}
        for w in known:
            if w['symbol']==symbol:groups.setdefault(w['line'],[]).append(w)
        for line,walls in groups.items():
            above=next((i for i,b in enumerate(bs) if b[2]>line),None)
            if above is None or not any(b[4]<line for b in bs[above:]):continue
            for w in walls:bears.append(dict(symbol=symbol,line=line,wall_date=w['wall_date'],failure=day))
            if bs[-1][4]>=line or not any(w['expiry']>=day for w in walls):continue
            peak=max(b[2] for b in bs[above:]);pi=next(i for i in range(above,len(bs)) if bs[i][2]==peak)
            low=min(b[3] for b in bs[pi:]);excursion=100*(peak/line-1);drawdown=100*(1-low/peak)
            if excursion>=.25 and drawdown>=.5:
                bulls.append(dict(symbol=symbol,line=line,failure=day,trapHigh=peak,trapExcursion=excursion,trapDrawdown=drawdown))
    return dict(bulls=bulls,bears=bears,closes=closes,complete_symbols=len(closes))

class Scanner:
    def __init__(self,day,history,state=None):
        self.day=day;self.history=history;prior=sorted(d for d in history if d<day)[-5:]
        self.prior=prior;self.previous_close=history[prior[-1]].get('closes',{}) if prior else {}
        self.bulls=[z for d in prior for z in history[d].get('bulls',[])]
        self.bears=[z for d in prior for z in history[d].get('bears',[]) if z['wall_date'] in prior]
        self.state=state or dict(cuts={},reclaimed={},bars={},documents=[])
    def ingest(self,doc,pdh,now,opening_ce=None):
        cut=doc['cut'];published=doc['ts']
        boundary=datetime.fromisoformat(self.day+'T'+cut+':00+05:30').timestamp()
        if doc.get('date')!=self.day or not '09:15'<=cut<='15:25' or published>now+2 or not boundary<=published<=boundary+180:
            raise ValueError('Wrong session, future or late Rusty capture')
        if cut in self.state['cuts']:return None
        rows={r['s']:r for side in ('bull','bear') for r in doc.get(side,[])}
        if cut=='09:15':
            self.state['cuts'][cut]={s:v for s,v in (opening_ce or {s:r.get('ce_pct') for s,r in rows.items()}).items() if finite(v)}
            return None
        valid={};oldcut=previous(cut)
        for s,r in rows.items():
            if r.get('c_time')!=oldcut or not all(finite(r.get(k)) for k in ('c_open','c_high','c_low','c_close','ce_pct','pe_pct','mv')):continue
            op,hi,lo,cl=[r[k] for k in ('c_open','c_high','c_low','c_close')]
            if lo<=0 or not lo<=min(op,cl)<=max(op,cl)<=hi:continue
            self.state['bars'].setdefault(s,{})[oldcut]=[oldcut,op,hi,lo,cl]
            valid[s]=r
        if not rows or len(valid)<.9*len(rows):
            raise ValueError(f'Completed cash coverage insufficient ({len(valid)}/{len(rows)})')
        previous_ce=self.state['cuts'].get(oldcut,{})
        bull_rows=[];bear_rows=[]
        for symbol,r in valid.items():
            bars=self.state['bars'][symbol];bar=bars[oldcut];price=bar[4]
            # Opening and previous close must be observed, never inferred from later bars.
            if '09:15' not in bars:continue
            opening=bars['09:15'][1]
            prevhm=previous(oldcut)
            before=bars.get(prevhm,[None,None,None,None,self.previous_close.get(symbol)])[4]
            if not finite(before):continue
            for z in (z for z in self.bulls if z['symbol']==symbol):
                key=symbol+'|'+str(z['line'])+'|'+z['failure']
                if (before<=z['line'] or bar[3]<=z['line']) and price>z['line']:
                    self.state['reclaimed'].setdefault(key,cut)
            zones=[z for z in self.bulls if z['symbol']==symbol and price>z['line'] and symbol+'|'+str(z['line'])+'|'+z['failure'] in self.state['reclaimed']]
            if zones and r['ce_pct']<0 and r['mv']>0 and finite(pdh.get(symbol)) and pdh[symbol]>0 and price>pdh[symbol]:
                z=max(zones,key=lambda z:(z['line'],z['failure']))
                bull_rows.append(dict(**z,price=price,ce=r['ce_pct'],pe=r['pe_pct'],move=r['mv'],pdh=pdh[symbol],
                    reclaim=self.state['reclaimed'][symbol+'|'+str(z['line'])+'|'+z['failure']],ce5=r['ce_pct']-previous_ce[symbol] if symbol in previous_ce else None))
            zones=[z for z in self.bears if z['symbol']==symbol and price<z['line']]
            if zones and cut<='15:00' and r['ce_pct']>0 and symbol in previous_ce and r['ce_pct']>previous_ce[symbol] and price<opening:
                z=min(zones,key=lambda z:(z['line'],-int(z['wall_date'].replace('-','')),-int(z['failure'].replace('-',''))))
                bear_rows.append(dict(**z,price=price,ce=r['ce_pct'],pe=r['pe_pct'],move=100*(price/opening-1),pdh=None,
                    ce5=r['ce_pct']-previous_ce[symbol],reclaim=None))
        for side,values in [('bull',bull_rows),('bear',bear_rows)]:
            values.sort(key=lambda r:(r['ce'] if side=='bull' else r['move'],r['symbol']))
            last=None;rank=0
            for i,r in enumerate(values,1):
                score=r['ce'] if side=='bull' else r['move']
                if score!=last:rank=i
                last=score;r.update(rank=rank,coverage=None,source='CURRENT_RUSTY_SNAPSHOT',outcome=None)
        # CE floor is applied AFTER original bull ranks: rejected slots never refill.
        bull_rows=[r for r in bull_rows if r['ce']<=-3]
        self.state['cuts'][cut]={s:r['ce_pct'] for s,r in rows.items() if finite(r.get('ce_pct'))}
        output=dict(source='lupus',cap='LUPUS',name='LUPUS',side='NEUTRAL',event='SNAPSHOT',date=self.day,sig_date=self.day.replace('-',''),
            cut=cut,time=cut,ts=now,Doc_ID=f'lupus|rules-v1|{self.day}|{cut}',bull=bull_rows,bear=bear_rows,
            detail='Recovered decision' if now-published>180 else 'Current Rusty inputs',input_ts=published,recovered=now-published>180,
            valid_cash_symbols=len(valid),input_symbols=len(rows),history_through=self.prior[-1] if self.prior else None)
        self.state['documents'].append(output);return output
