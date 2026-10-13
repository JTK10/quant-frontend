"""Isolated KAIROS9 PAPER worker. Existing captures only; no order API."""
import base64,fcntl,hashlib,json,os,time,urllib.request,urllib.parse
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from kairos9_features import Model,candidates,capture,read,minute,hm
from kairos_option_ai import OptionContractSelector,KairosOptionTrailingEngine,fees,size_lots
IST=ZoneInfo('Asia/Kolkata')
ROOT=Path(os.getenv('KAIROS9_ROOT','/home/ubuntu/kairos9'))
INPUT=Path('/home/ubuntu/pallas/input');IRBIS=Path('/home/ubuntu/irbis');OC=Path('/home/ubuntu/ocelot')
def epoch(day,cut):return datetime.fromisoformat(day+'T'+cut+':00+05:30').timestamp()
def save(path,data):
    tmp=path.with_suffix('.tmp')
    with tmp.open('w') as f:json.dump(data,f,separators=(',',':'),allow_nan=False);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)
def request(url,data=None,headers=None):
    with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers or {}),timeout=8) as r:
        body=r.read(2_000_001)
        if len(body)>2_000_000:raise ValueError('Response exceeds bound')
        return json.loads(body) if body else {}
def contract_metadata(signal,contract):
    # Single GET at decision time validates expiry, strike, lot and instrument.
    universe=read(OC/'universe.json')
    if universe.get('day')!=signal['Date']:raise ValueError('Stale universe')
    token=read(OC/'tokens.json',16000)
    if isinstance(token,list):token=token[0]
    if isinstance(token,dict):token=token.get('access_token') or token.get('token')
    if not isinstance(token,str) or not token:raise ValueError('Broker credential unavailable')
    query=urllib.parse.urlencode(dict(instrument_key=universe['eq'][signal['Symbol']],expiry_date=signal['Expiry']))
    response=request('https://api.upstox.com/v2/option/contract?'+query,headers={'Authorization':'Bearer '+token})
    if response.get('status')!='success':raise ValueError('Contract metadata unavailable')
    matches=[r for r in response['data'] if r.get('underlying_symbol')==signal['Symbol'] and r.get('expiry')==signal['Expiry'] and r.get('segment')=='NSE_FO' and r.get('instrument_type')==contract['leg'] and float(r.get('strike_price',0))==contract['strike']]
    if len(matches)!=1:raise ValueError('Ambiguous contract metadata')
    m=matches[0];lot=m.get('lot_size')
    if not isinstance(lot,int) or lot<=0 or m.get('minimum_lot',lot)!=lot:raise ValueError('Invalid market lot')
    return dict(lot_size=lot,key=m['instrument_key'],name=m['trading_symbol'])
class Publisher:
    def __init__(self):self.cfg=read(OC/'ords.json',16000);self.token=None;self.expiry=0
    def send(self,doc,before_post):
        if not self.token or time.time()>=self.expiry:
            basic=base64.b64encode((self.cfg['client_id']+':'+self.cfg['client_secret']).encode()).decode()
            auth=request(self.cfg['base']+'/oauth/token',b'grant_type=client_credentials',{'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'})
            self.token=auth['access_token'];self.expiry=time.time()+int(auth.get('expires_in',3600))-60
        url=self.cfg['base']+self.cfg['path'];headers={'Authorization':'Bearer '+self.token}
        data=request(url+'?'+urllib.parse.urlencode(dict(src='kairos9',sig_date=doc['sig_date'])),headers=headers)
        if data.get('hasMore'):raise ValueError('Read-back pagination requires review')
        for r in data.get('items',[]):
            d=r.get('doc',r);d=json.loads(d) if isinstance(d,str) else d
            if d.get('source')=='kairos9' and d.get('Doc_ID')==doc['Doc_ID']:return
        if doc.get('_publish_attempted'):
            raise ValueError('Uncertain prior publication; read-back only, no blind retry')
        doc['_publish_attempted']=True
        before_post() # Durable send intent BEFORE network mutation.
        public={k:v for k,v in doc.items() if not k.startswith('_')}
        request(url,json.dumps(public,allow_nan=False).encode(),dict(headers,**{'Content-Type':'application/json'}))
class Worker:
    def __init__(self,root=ROOT):
        self.root=root;root.mkdir(parents=True,exist_ok=True);self.model=Model(root/'kairos9_model.json');self.path=root/'state.json'
        self.state=read(self.path,2_000_000) if self.path.exists() else dict(schema=1,date='',seen=[],taken=False,pending_entry=None,position=None,outbox=[],status='Starting')
        if self.state.get('schema')!=1:raise ValueError('Unknown state schema')
    def emit(self,kind,now,payload,identity):
        day=self.state['date'];doc=dict(source='kairos9',cap='KAIROS9',mode='paper',engine=self.model.bundle['model_id'],date=day,sig_date=day.replace('-',''),kind=kind,event=kind,name='',side='NEUTRAL',time=datetime.fromtimestamp(now,IST).strftime('%H:%M:%S'),ts=now,exit_ai_active=False,execution='observed_5min_snapshot')
        doc.update(payload)
        doc['Doc_ID']='kairos9|'+day+'|'+kind+'|'+identity
        if not any(d['Doc_ID']==doc['Doc_ID'] for d in self.state['outbox']):
            if len(self.state['outbox'])>=128:raise ValueError('Durable outbox full; fail closed')
            self.state['outbox'].append(doc)
    def tick(self,now):
        local=datetime.fromtimestamp(now,IST);day=local.date().isoformat();cut=hm(minute(local.strftime('%H:%M'))//5*5)
        s=self.state
        if s['date']!=day:
            if s['position'] or s['pending_entry']:
                s['status']='Previous-session position/entry unresolved; manual review required';self.persist();return
            s.update(date=day,seen=[],taken=False,status='Waiting for current session')
        if local.weekday()>=5 or not '09:20'<=cut<='15:20':s['status']='Outside regular session';self.persist();return
        if cut in s['seen']:return
        path=INPUT/(day.replace('-','')+'-'+cut.replace(':','')+'.json')
        if not path.exists():return
        p=read(path)
        if p['date']!=day or p['cut'][:5]!=cut or p['degraded'] or not epoch(day,cut)<=p['exported_at']<=now or now-p['exported_at']>180 or now-epoch(day,cut)>180:raise ValueError('Stale/degraded capture')
        if s['position']:
            pos=s['position']
            if p['expiry']!=pos['Expiry']:raise ValueError('Position expiry mismatch')
            q=self.quote(p,pos,now)
            engine=KairosOptionTrailingEngine(pos['entry'],pos['entry_time']);engine.__dict__.update(pos['engine'])
            engine.update_quote(cut,q['ltp'],q['bid']);pos['engine']=engine.__dict__
            pnl=(q['bid']-pos['entry'])*pos['qty']-fees(pos['entry'],q['bid'],pos['qty'])['Total']
            payload=self.payload(pos);payload.update(entry=q['bid'],opt_ltp=q['bid'],pnl=pnl,pnl_pct=(q['bid']/pos['entry']-1)*100,reason=engine.exit_reason or 'Observed bid mark')
            self.emit('EXIT' if engine.is_closed else 'MTM',now,payload,cut)
            if engine.is_closed:s['position']=None
        elif s['pending_entry']:
            pending=s['pending_entry'];target=pending['entry_time']
            if cut>target:s['pending_entry']=None;s['status']='Exact entry capture missed; skipped'
            elif cut==target:
                if p['expiry']!=pending['Expiry']:raise ValueError('Entry expiry mismatch')
                q=self.quote(p,pending,now);lots=size_lots(q['ask'],pending['lot_size'],35000)
                if lots<1:s['pending_entry']=None;s['status']='One lot exceeds premium budget'
                else:
                    qty=lots*pending['lot_size']
                    if q.get('ask_qty',0)<qty:raise ValueError('Entry displayed depth insufficient')
                    pos=dict(pending,entry=q['ask'],qty=qty,lots=lots,engine=KairosOptionTrailingEngine(q['ask'],cut).__dict__)
                    s['position']=pos;s['pending_entry']=None
                    self.emit('ENTRY',now,self.payload(pos),pending['Cut']);s['status']='Paper position open'
        elif not s['taken'] and len(s['outbox'])<100 and '10:10'<=cut<='11:00':
            # Wait for Irbis to finish this cut; no decision using later rankings.
            signals=candidates(self.model,INPUT,IRBIS,day,cut)
            ir=read(IRBIS/'state'/f'{day}.json',2_000_000)
            if not any(d.get('Cut')==cut for d in ir['documents']):return
            if signals:
                signal=signals[0];signal['Date']=day
                if not epoch(day,cut)-5<=p['chain_received'].get(signal['Symbol'],0)<=p['exported_at']:raise ValueError('Stale decision chain')
                chain=p.get('quotes',{}).get(signal['Symbol'],[])
                contract=OptionContractSelector.select_best_contract(chain,signal['Spot'],signal['Side'])
                s['taken']=True
                if contract is None:s['status']='No measured liquid contract; day skipped'
                else:
                    meta=contract_metadata(signal,contract)
                    s['pending_entry']=dict(signal,Strike=contract['strike'],Leg=contract['leg'],entry_time=hm(minute(cut)+5),**meta)
                    s['status']='Waiting for exact T+5 observed ask'
        s['seen'].append(cut);self.persist()
    def quote(self,p,pos,now):
        q=[q for q in p.get('quotes',{}).get(pos['Symbol'],[]) if q['strike']==pos['Strike'] and q['leg']==pos['Leg']]
        if len(q)!=1 or not OptionContractSelector.valid(q[0]):raise ValueError('Missing/invalid measured quote')
        if not epoch(p['date'],p['cut'][:5])-5<=p['chain_received'].get(pos['Symbol'],0)<=p['exported_at']:raise ValueError('Stale symbol quote')
        if pos.get('qty') and q[0].get('bid_qty',0)<pos['qty']:raise ValueError('Exit displayed depth insufficient; retained pending')
        return q[0]
    def payload(self,p):
        return dict(name=p['name'],underlying=p['Symbol'],side=p['Side'],signal_id='kairos9|'+p['Date']+'|'+p['Symbol']+'|'+p['Cut'],opt_key=p['key'],opt_name=p['name'],entry_price=p['entry'],entry_fill=p['entry'],entry=p['entry'],quantity=p['qty'],qty=p['qty'],capital_used=p['entry']*p['qty'],ai_score=p['Win_Prob'],selection_score=p['Score'],feature_spread_imputed=True,stop_pct=p['engine']['stop'],stop_premium=p['entry']*(1+p['engine']['stop']/100),lots=p['lots'],lot_size=p['lot_size'],expiry=p['Expiry'],strike=p['Strike'],leg=p['Leg'],entry_time=p['entry_time'],budget=35000)
    def persist(self):save(self.path,self.state)
def main():
    ROOT.mkdir(parents=True,exist_ok=True);lock=(ROOT/'worker.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    worker=Worker();publisher=Publisher();health_at=0;publish_at=0
    while True:
        now=time.time();error=None
        try:worker.tick(now)
        except Exception as exc:error=type(exc).__name__;worker.state['status']='Input/execution unavailable: '+error;worker.persist()
        if now-health_at>=60:
            doc=dict(status=worker.state['status'],pid=os.getpid(),heartbeat=datetime.fromtimestamp(now,IST).isoformat(),date=worker.state['date'],source='kairos9',mode='paper',model_id=worker.model.bundle['model_id'],trained_through=worker.model.bundle['trained_through'],exit_ai_active=False)
            save(ROOT/'health.json',doc)
            slot=str(int(now//900))
            if len(worker.state['outbox'])<100 and worker.state.get('health_slot')!=slot:
                worker.emit('HEALTH',now,dict(status=doc['status'],reason=doc['status']),slot)
                worker.state['health_slot']=slot
            worker.persist();health_at=now
        if now>=publish_at and worker.state['outbox']:
            try:publisher.send(worker.state['outbox'][0],worker.persist);worker.state['outbox'].pop(0);worker.persist();publish_at=now+1
            except Exception:publish_at=now+60
        time.sleep(15)
if __name__=='__main__':main()
