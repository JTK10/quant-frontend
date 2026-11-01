"""Exact frozen16-feature Aurum adapter; saved existing captures only, stdlib."""
import hashlib
import json
import os
from pathlib import Path

from aurum_engine import cash_features,chain_features,gate,number
from kairos10_engine import MODEL,epoch,stamp,day,hm
from scorer import Scorer

MODEL_SHA='31e54fd760e9a94105bed2c7ec64f3e40a09d7951a726536c01e48220f7862b8'


def read(path,limit=4_000_000):
    with Path(path).open('rb') as f:raw=f.read(limit+1)
    if len(raw)>limit:raise ValueError('Input size exceeds bound')
    value=json.loads(raw)
    if not isinstance(value,dict):raise ValueError('Object input required')
    return value


def save(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp')
    with tmp.open('w',encoding='utf-8') as f:
        json.dump(value,f,separators=(',',':'),allow_nan=False);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)


def vector(bars,history,chain,nifty):
    f=cash_features(bars,history,nifty)
    f.update(chain_features(chain,f['day_open'],f['Close'],f['direction']))
    if not gate(f) or not f['pullback_confirmed']:return None
    bull=f['direction']=='BULL';sign=1 if bull else -1
    past=bars[:-1]
    opposite=[i for i,b in enumerate(past) if b['c']<b['o']] if bull else [i for i,b in enumerate(past) if b['c']>b['o']]
    oi=opposite[-1];before=bars[:oi]
    extreme=(max(b['h'] for b in before) if bull else min(b['l'] for b in before)) if before else bars[0]['o']
    pullback=past[oi]['l'] if bull else past[oi]['h']
    orlevel=max(b['h'] for b in bars[:3]) if bull else min(b['l'] for b in bars[:3])
    pdlevel=f['pdh'] if bull else f['pdl']
    f.update(is_bull=int(bull),minutes_from_open=int(bars[-1]['hm'][:2])*60+int(bars[-1]['hm'][3:])-555,
        pullback_depth_pct=100*sign*(extreme-pullback)/extreme,bars_since_pullback=len(bars)-1-oi,
        pd_clearance_pct=100*sign*(f['Close']-pdlevel)/pdlevel,
        or_clearance_pct=100*sign*(f['Close']-orlevel)/orlevel,
        directional_return_10m_pct=100*sign*(f['Close']/bars[-3]['c']-1),
        entry_base=max(pdlevel,orlevel) if bull else min(pdlevel,orlevel))
    return f


def validate_capture(p,date,now):
    cut=str(p.get('cut',''))[:5]
    if p.get('date')!=date or len(cut)!=5 or not '09:20'<=cut<='11:00':raise ValueError('Capture date/cut mismatch')
    instant=epoch(date+'T'+cut+':00+05:30');exported=p.get('exported_at')
    if not number(exported) or not instant<=exported<=min(instant+180,now):raise ValueError('Capture export clock invalid')
    for key in ('candles','chains','baselines','chain_received','quotes'):
        if not isinstance(p.get(key),dict):raise ValueError('Capture schema missing '+key)
    expected=hm(instant-300)[:5];bars={}
    if len(p['candles'])>400:raise ValueError('Cash universe exceeds bound')
    for symbol,b in p['candles'].items():
        if not isinstance(b,dict) or str(b.get('time',''))[:5]!=expected:continue
        if any(not number(b.get(k)) for k in ('open','high','low','close','volume')):continue
        if not 0<b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high'] or b['volume']<0:continue
        bars[symbol]=dict(hm=expected,o=b['open'],h=b['high'],l=b['low'],c=b['close'],v=b['volume'])
    return cut,instant,bars


class Features:
    def __init__(self,root,aurum,calendar,boot_at,models=None):
        self.root=Path(root);self.aurum=Path(aurum);self.calendar=calendar;self.boot_at=boot_at
        self.scorer=Scorer(models or Path(__file__).parent/'models')
        model_path=Path(models or Path(__file__).parent/'models')/'option_structure.json'
        if self.scorer.name!='option_structure' or self.scorer.threshold!=.30 or hashlib.sha256(model_path.read_bytes()).hexdigest()!=MODEL_SHA:
            raise ValueError('Frozen previous model pin mismatch')
        self.path=self.root/'prefix.json';self.state=None;self.history=None;self.history_mtime=None

    def start(self,date):
        self.state=read(self.path,2_000_000) if self.path.exists() else {}
        if self.state.get('date')!=date:self.state=dict(date=date,bars={},ingested=[],evaluated=[])
        self.date=date

    def ingest(self,p,now):
        cut,instant,bars=validate_capture(p,self.date,now)
        if cut not in self.state['ingested']:
            for symbol,b in bars.items():
                old={r['hm']:r for r in self.state['bars'].get(symbol,[])}
                old.setdefault(b['hm'],b);self.state['bars'][symbol]=[old[k] for k in sorted(old)]
            self.state['ingested'].append(cut);save(self.path,self.state)
        return cut,instant,bars

    def nifty(self,cut,now):
        # Existing Aurum stream owns this cache; this worker never writes it or
        # creates another socket. A recovered09:15 baseline may supply its open;
        # the signal's most recent closed candle must be genuinely fresh.
        cache=read(self.aurum/'nifty-cache.json',256_000)
        expected=hm(epoch(self.date+'T'+cut+':00+05:30')-300)[:5]
        rows={(r.get('date'),r.get('bar_start')):r for r in cache.get('bars',[])[:150]}
        first,last=rows.get((self.date,'09:15')),rows.get((self.date,expected))
        if not first or not last:raise ValueError('Exact current Nifty candle unavailable')
        instant=epoch(self.date+'T'+cut+':00+05:30')
        if last.get('recovered') is not False or not number(last.get('available_at')) or not instant<=last['available_at']<=min(now,instant+90):
            raise ValueError('Nifty signal candle is recovered or stale')
        if not number(first.get('open')) or not number(last.get('close')):raise ValueError('Invalid Nifty values')
        return dict(open=first['open'],close=last['close'])

    def evaluate(self,p,now):
        cut,instant,bars=self.ingest(p,now)
        if cut in self.state['evaluated'] or not '09:40'<=cut<='10:55':return []
        # Old files hydrate price context only. A fresh score/intent can never be
        # created from a capture already present before this process booted.
        if p['exported_at']<self.boot_at or now>instant+90:
            self.state['evaluated'].append(cut);save(self.path,self.state);return []
        if p.get('degraded'):raise ValueError('Degraded current chain capture')
        nifty=self.nifty(cut,now)
        hp=self.aurum/'history.json';mtime=hp.stat().st_mtime_ns
        if self.history_mtime!=mtime:
            self.history=read(hp,16_000_000);self.history_mtime=mtime
            if self.history.get('schema_version')!=1:raise ValueError('History schema invalid')
        events=[]
        for symbol in sorted(bars):
            baseline=p['baselines'].get(symbol,{})
            history=[d for d in self.history.get('symbols',{}).get(symbol,[]) if d['date']<self.date]
            if not history or history[-1]['date']!=baseline.get('prior_day') or not self.calendar.prior_date_valid(baseline.get('prior_day'),self.date):continue
            recv=p['chain_received'].get(symbol)
            if not number(recv) or not instant-5<=recv<=p['exported_at'] or symbol not in p['chains']:continue
            try:f=vector(self.state['bars'][symbol],history,p['chains'][symbol],nifty)
            except (ValueError,KeyError,TypeError):continue
            if f is None:continue
            features={k:f[k] for k in self.scorer.features}
            if any(not number(v) for v in features.values()):continue
            score=self.scorer.score(features)
            if score<self.scorer.threshold:continue
            expiry=p.get('expiry');leg='CE' if f['direction']=='BULL' else 'PE'
            if not isinstance(expiry,str) or expiry<self.date:continue
            strikes=sorted({r[0] for r in p['chains'][symbol] if len(r)>=2 and r[1]==leg and number(r[0]) and r[0]>0},key=lambda s:(abs(s-f['Close']),s))
            if not strikes:continue
            digest=hashlib.sha256(json.dumps(features,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
            events.append(dict(Date=self.date,Symbol=symbol,Side=f['direction'],Expiry=expiry,Strike=strikes[0],Leg=leg,
                Event_ID=f'{MODEL}|{self.date}|{cut}|{symbol}',Signal_Time=cut,AI_Model_ID=MODEL,AI_Score=score,
                AI_Scored_At=stamp(now),Issued_At=stamp(p['exported_at']),Armed_At=stamp(now),
                Entry_Due_At=stamp(instant+300),ConfirmedPullback=True,Recovered=False,
                Feature_SHA256=digest,Entry_Base=f['entry_base'],Breakout_Spot=f['Close']))
        self.state['evaluated'].append(cut);save(self.path,self.state)
        return sorted(events,key=lambda e:(-e['AI_Score'],e['Symbol']))


def entry_hold(event,p,now):
    try:cut,instant,_=validate_capture(p,event['Date'],now)
    except (ValueError,KeyError,TypeError):return False
    due=epoch(event['Entry_Due_At'])
    if instant!=due or p.get('degraded') or not due<=now<=due+90 or p['expiry']!=event['Expiry']:return False
    recv=p['chain_received'].get(event['Symbol']);spot=p['baselines'].get(event['Symbol'],{}).get('spot')
    if not number(recv) or not due-5<=recv<=p['exported_at'] or not number(spot) or spot<=0:return False
    sign=1 if event['Side']=='BULL' else -1
    return sign*(spot-event['Entry_Base'])>0
