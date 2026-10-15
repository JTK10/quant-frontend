"""Rusty OI crossings from shared Charts closes and already-fetched cash bars.
No broker calls, DB readers or additional worker. State survives restarts.
"""
import json, math, os, time
from datetime import datetime, timedelta
from pathlib import Path

STATE_PATH = Path(__file__).with_name('rusty_oi_state.json')
_state = None

def state(day):
    global _state
    if _state is None:
        try:
            _state = json.loads(STATE_PATH.read_text()) if STATE_PATH.stat().st_size < 4_000_000 else {}
        except (OSError, ValueError):
            _state = {}
    if _state.get('day') != day:
        _state = {'day':day, 'sessions':{}, 'bars':{}}
    return _state

def save():
    tmp = STATE_PATH.with_suffix('.tmp')
    tmp.write_text(json.dumps(_state, separators=(',',':'), allow_nan=False))
    os.replace(tmp, STATE_PATH)

def record(day, symbol, bars):
    """bars = (HH:MM, open, close), only the requested session."""
    target = state(day)['bars'].setdefault(symbol,{})
    for hm, op, cl in bars:
        if '09:15' <= hm <= '15:25' and all(isinstance(v,(float,int)) and math.isfinite(v) and v>0 for v in (op,cl)):
            target[hm] = [op,cl]

async def load_lines(client, cut, cfg, token_fn):
    day=cut.strftime('%Y-%m-%d'); cache=state(day)['sessions']
    if not cfg: return None
    # Same ten-calendar-day / three available sessions as Charts, one compact
    # close read per prior weekday per day. Persist successful reads immediately.
    for offset in range(1,11):
        prior=cut.date()-timedelta(days=offset)
        if prior.weekday()>4 or str(prior) in cache: continue
        token=await token_fn(client,cfg)
        response=await client.get(cfg['base']+cfg['path'],params={'src':'chart_oi_close','sig_date':prior.strftime('%Y%m%d')},headers={'Authorization':'Bearer '+token},timeout=5)
        response.raise_for_status()
        if len(response.content)>2_000_000: raise ValueError('OI close response exceeds bound')
        payload=response.json()
        if payload.get('hasMore') or payload.get('has_more'): raise ValueError('OI close response truncated')
        docs=[]
        for item in payload.get('items',[]):
            doc=item.get('doc',item)
            if isinstance(doc,str): doc=json.loads(doc)
            if doc.get('source')=='chart_oi_close' and str(doc.get('sig_date'))==prior.strftime('%Y%m%d') and doc.get('cut','99')<='15:25' and not doc.get('degraded'):
                docs.append(doc)
        selected={}
        for doc in sorted(docs,key=lambda d:(d.get('cut',''),d.get('ts',0)),reverse=True):
            for row in doc.get('oi_levels',[]):
                if len(row)==5 and row[0] not in selected: selected[row[0]]=row
        cache[str(prior)]=selected
        save()
    return cache

def calculate(day, cut, symbol, side, sessions, bars):
    previous=[]
    for source,rows in sorted(sessions.items(),reverse=True):
        if source<day and 0<(datetime.fromisoformat(day)-datetime.fromisoformat(source)).days<=10 and symbol in rows:
            previous.append((source,rows[symbol]))
        if len(previous)==3: break
    levels=sorted({float(w[0]) for _,row in previous if str(row[2])>=day for walls in row[3:5] for w in walls if isinstance(w,list) and len(w)>1 and isinstance(w[0],(int,float)) and math.isfinite(w[0]) and w[0]>0})
    if not levels:return {'oi_broken':None,'oi_break_time':None}
    end=datetime.fromisoformat(day+'T'+cut)
    start=datetime.fromisoformat(day+'T09:15')
    first=None;before=None
    while start+timedelta(minutes=5)<=end and start.strftime('%H:%M')<='15:25':
        hm=start.strftime('%H:%M');bar=bars.get(hm)
        # Missing bars cannot establish the earliest crossing.
        if not bar:return {'oi_broken':None,'oi_break_time':None}
        op,close=bar;baseline=op if before is None else before
        if any(baseline<=level<close if side=='bull' else baseline>=level>close for level in levels):
            first=(start+timedelta(minutes=5)).strftime('%H:%M');break
        before=close;start+=timedelta(minutes=5)
    if end<=datetime.fromisoformat(day+'T09:15'):return {'oi_broken':None,'oi_break_time':None}
    return {'oi_broken':first is not None,'oi_break_time':first}

async def enrich(client, cut, doc, cfg, token_fn):
    sessions=await load_lines(client,cut,cfg,token_fn)
    if sessions is None:return
    day=cut.strftime('%Y-%m-%d');bars=state(day)['bars']
    for side in ('bull','bear'):
        for row in doc[side]:row.update(calculate(day,cut.strftime('%H:%M'),row['s'],side,sessions,bars.get(row['s'],{})))
    save()
