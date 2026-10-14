"""Isolated KAIROS9 PAPER worker. Existing captures only; no order API."""
import base64,fcntl,hashlib,json,math,os,time,urllib.request,urllib.parse
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
class BrokerMetadataError(RuntimeError):
    def __init__(self,reason,http_status=None,retryable=False):
        super().__init__(reason);self.http_status=http_status;self.retryable=retryable

_broker_client=None

def broker_get(url,headers):
    global _broker_client
    # Existing Kairos2/Ocelot HTTP client; GET contract metadata only.
    if not url.startswith('https://api.upstox.com/v2/option/contract?'):raise ValueError('Broker endpoint not permitted')
    import httpx
    try:
        if _broker_client is None:
            _broker_client=httpx.Client(timeout=httpx.Timeout(8.,connect=5.),follow_redirects=False,limits=httpx.Limits(max_connections=1,max_keepalive_connections=1,keepalive_expiry=30))
        with _broker_client.stream('GET',url,headers=dict(headers,Accept='application/json')) as response:
            code=response.status_code
            if code!=200:raise BrokerMetadataError('Broker metadata HTTP '+str(code),code,code in (408,429) or code>=500)
            body=bytearray()
            for chunk in response.iter_bytes():
                body.extend(chunk)
                if len(body)>2_000_000:raise BrokerMetadataError('Broker metadata exceeds size bound')
            return json.loads(body)
    except (httpx.TimeoutException,httpx.TransportError):raise BrokerMetadataError('Broker metadata transport unavailable',retryable=True) from None

def contract_metadata(signal,contract):
    # Single GET at decision time validates expiry, strike, lot and instrument.
    universe=read(OC/'universe.json')
    if universe.get('day')!=signal['Date']:raise ValueError('Stale universe')
    token=read(OC/'tokens.json',16000)
    if isinstance(token,list):token=token[0]
    if isinstance(token,dict):token=token.get('access_token') or token.get('token')
    if not isinstance(token,str) or not token:raise ValueError('Broker credential unavailable')
    query=urllib.parse.urlencode(dict(instrument_key=universe['eq'][signal['Symbol']],expiry_date=signal['Expiry']))
    response=broker_get('https://api.upstox.com/v2/option/contract?'+query,headers={'Authorization':'Bearer '+token})
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
        # Legacy taken may mean an exited trade; never clear it automatically.
        for k,v in dict(metadata_pending=None,decisions={},last_error=None,last_failure=None,metadata_attempts=0,daily_entries=None if self.state['taken'] else 0).items():self.state.setdefault(k,v)
    def emit(self,kind,now,payload,identity):
        day=self.state['date'];doc=dict(source='kairos9',cap='KAIROS9',mode='paper',engine=self.model.bundle['model_id'],date=day,sig_date=day.replace('-',''),kind=kind,event=kind,name='',side='NEUTRAL',time=datetime.fromtimestamp(now,IST).strftime('%H:%M:%S'),ts=now,exit_ai_active=False,execution='observed_5min_snapshot')
        doc.update(payload)
        doc['Doc_ID']='kairos9|'+day+'|'+kind+'|'+identity
        if not any(d['Doc_ID']==doc['Doc_ID'] for d in self.state['outbox']):
            if len(self.state['outbox'])>=128:raise ValueError('Durable outbox full; fail closed')
            self.state['outbox'].append(doc)
    def audit(self,cut,now,status,reason,signal=None,**extra):
        record=self.state['decisions'].setdefault(cut,{})
        record.update(cut=cut,status=status,reason=reason,at=datetime.fromtimestamp(now,IST).isoformat(),**extra)
        if signal:record.update(symbol=signal['Symbol'],side=signal['Side'],score=signal.get('Score'),model_output=signal.get('Win_Prob'))
        self.state['status']=reason
    def seen(self,cut):
        if cut not in self.state['seen']:self.state['seen'].append(cut)
    def skip(self,cut,now,reason,signal=None,phase='decision',**extra):
        self.audit(cut,now,'SKIPPED',reason,signal,**extra)
        payload=dict(reason=reason,decision_cut=cut,phase=phase,**extra)
        if signal:payload.update(name=signal['Symbol'],side=signal['Side'],signal_id='kairos9|'+self.state['date']+'|'+signal['Symbol']+'|'+cut)
        self.emit('SKIP',now,payload,cut+'|'+phase)
    def expire_pending(self,now):
        s=self.state;meta=s['metadata_pending'];pending=s['pending_entry']
        if meta and now>meta['deadline']:
            self.skip(meta['signal']['Cut'],now,'Metadata deadline expired; no entry placed',meta['signal'],'metadata_deadline')
            self.seen(meta['signal']['Cut']);s['metadata_pending']=None
        if pending and now>epoch(s['date'],pending['entry_time'])+180:
            self.skip(pending['Cut'],now,'Exact T+5 entry capture missed; no retrospective fill',pending,'entry_deadline');s['pending_entry']=None
    def resolve_metadata(self,now):
        s=self.state;pending=s['metadata_pending']
        if pending['attempts']>=3:
            self.skip(pending['signal']['Cut'],now,'Metadata attempt limit reached; no entry placed',pending['signal'],'metadata_limit')
            self.seen(pending['signal']['Cut']);s['metadata_pending']=None;self.persist();return False
        if now<pending['next_retry']:return False
        pending['attempts']+=1;s['metadata_attempts']+=1
        self.audit(pending['signal']['Cut'],now,'METADATA_PENDING','Resolving contract metadata',pending['signal'],attempts=pending['attempts'])
        self.persist() # Reserve attempt durably before a read-only broker request.
        try:meta=contract_metadata(pending['signal'],pending['contract'])
        except Exception as exc:
            code=getattr(exc,'http_status',None);reason=str(exc) if isinstance(exc,BrokerMetadataError) else 'Contract metadata '+type(exc).__name__
            failure=dict(cut=pending['signal']['Cut'],symbol=pending['signal']['Symbol'],reason=reason,http_status=code,at=datetime.fromtimestamp(now,IST).isoformat())
            s['last_error']=failure;s['last_failure']=failure
            delay=60 if code==429 else 30*pending['attempts']
            retry=bool(getattr(exc,'retryable',False)) and pending['attempts']<3 and now+delay<pending['deadline']
            if retry:
                pending['next_retry']=now+delay
                self.audit(pending['signal']['Cut'],now,'METADATA_RETRY',reason,pending['signal'],attempts=pending['attempts'],http_status=code,next_retry=pending['next_retry'])
            else:
                self.skip(pending['signal']['Cut'],now,reason+'; cut skipped without consuming daily entry',pending['signal'],'metadata_failed',attempts=pending['attempts'],http_status=code)
                self.seen(pending['signal']['Cut']);s['metadata_pending']=None
            self.persist();return False
        signal=pending['signal'];contract=pending['contract']
        s['pending_entry']=dict(signal,Strike=contract['strike'],Leg=contract['leg'],entry_time=hm(minute(signal['Cut'])+5),**meta)
        s['metadata_pending']=None;s['last_error']=None
        self.audit(signal['Cut'],now,'WAITING_ENTRY','Waiting for exact T+5 observed ask',signal,lot_size=meta['lot_size'],strike=contract['strike'],leg=contract['leg'])
        self.seen(signal['Cut']);self.persist();return True
    def tick(self,now):
        local=datetime.fromtimestamp(now,IST);day=local.date().isoformat();cut=hm(minute(local.strftime('%H:%M'))//5*5)
        s=self.state
        self.expire_pending(now)
        if s['date']!=day:
            if s['position'] or s['pending_entry']:
                s['status']='Previous-session position/entry unresolved; manual review required';self.persist();return
            if s['date']:
                folder=self.root/'sessions';folder.mkdir(exist_ok=True);save(folder/(s['date']+'.json'),s)
            s.update(date=day,seen=[],taken=False,metadata_pending=None,decisions={},last_error=None,last_failure=None,metadata_attempts=0,daily_entries=0,status='Waiting for current session')
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
            if engine.is_closed:s['position']=None;s['status']='Daily paper trade complete'
            else:s['status']='Paper position open'
            s['last_error']=None
        elif s['pending_entry']:
            pending=s['pending_entry'];target=pending['entry_time']
            if cut>target:
                self.skip(pending['Cut'],now,'Exact entry capture missed; no retrospective fill',pending,'entry_missed');s['pending_entry']=None
            elif cut==target:
                try:
                    if p['expiry']!=pending['Expiry']:raise ValueError('Entry expiry mismatch')
                    q=self.quote(p,pending,now)
                    if 200*(q['ask']-q['bid'])/(q['ask']+q['bid'])>5:raise ValueError('Entry spread exceeds 5%')
                    lot=pending['lot_size'];budget_lots=size_lots(q['ask'],lot,35000);depth=min(q.get('ask_qty',0),q.get('bid_qty',0))
                    if not isinstance(depth,(int,float)) or not math.isfinite(depth) or depth<0:raise ValueError('Invalid displayed depth')
                    lots=min(budget_lots,int(depth//lot))
                    if lots<1:raise ValueError('No whole lot fits premium budget and observed depth')
                except ValueError as exc:
                    self.skip(pending['Cut'],now,str(exc),pending,'entry_gate');s['pending_entry']=None
                else:
                    qty=lots*lot;pos=dict(pending,entry=q['ask'],qty=qty,lots=lots,engine=KairosOptionTrailingEngine(q['ask'],cut).__dict__)
                    s['position']=pos;s['pending_entry']=None;s['taken']=True;s['daily_entries']=1;s['last_error']=None
                    self.emit('ENTRY',now,self.payload(pos),pending['Cut'])
                    self.audit(pending['Cut'],now,'ENTERED','Paper position open',pending,entry_time=cut,quantity=qty,lots=lots,entry_ask=q['ask'])
        elif s['metadata_pending']:
            self.resolve_metadata(now)
            if s['metadata_pending']:return
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
                if contract is None:self.skip(cut,now,'No measured liquid contract at this cut',signal,'contract_gate')
                else:
                    s['metadata_pending']=dict(signal=signal,contract=contract,attempts=0,next_retry=now,deadline=epoch(day,cut)+180)
                    self.persist();self.resolve_metadata(now)
                    if s['metadata_pending']:return
            else:self.audit(cut,now,'NO_SIGNAL','No qualifying signal at this cut')
        elif not s['taken']:s['status']='Waiting for entry window' if cut<'10:10' else 'Entry window ended; no paper entry'
        self.seen(cut);self.persist()
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
        except Exception as exc:
            error=type(exc).__name__;worker.state['status']='Input/execution unavailable: '+error
            failure=dict(at=datetime.fromtimestamp(now,IST).isoformat(),reason=worker.state['status'])
            worker.state['last_error']=failure;worker.state['last_failure']=failure;worker.persist()
        if now-health_at>=60:
            doc=dict(status=worker.state['status'],pid=os.getpid(),heartbeat=datetime.fromtimestamp(now,IST).isoformat(),date=worker.state['date'],source='kairos9',mode='paper',model_id=worker.model.bundle['model_id'],trained_through=worker.model.bundle['trained_through'],exit_ai_active=False,daily_entries=worker.state['daily_entries'],metadata_attempts=worker.state['metadata_attempts'],last_error=worker.state['last_error'],last_failure=worker.state['last_failure'],last_decision=list(worker.state['decisions'].values())[-1] if worker.state['decisions'] else None)
            save(ROOT/'health.json',doc)
            slot=str(int(now//900))
            if len(worker.state['outbox'])<100 and worker.state.get('health_slot')!=slot:
                worker.emit('HEALTH',now,dict(status=doc['status'],reason=doc['status'],daily_entries=doc['daily_entries'],metadata_attempts=doc['metadata_attempts'],last_error=doc['last_error'],last_failure=doc['last_failure'],last_decision=doc['last_decision']),slot)
                worker.state['health_slot']=slot
            worker.persist();health_at=now
        if now>=publish_at and worker.state['outbox']:
            try:publisher.send(worker.state['outbox'][0],worker.persist);worker.state['outbox'].pop(0);worker.persist();publish_at=now+1
            except Exception:publish_at=now+60
        time.sleep(15)
if __name__=='__main__':main()
