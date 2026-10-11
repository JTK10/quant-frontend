"""Irbis VM2: consume existing atomic exports; standard library; no broker orders."""
import base64, json, math, os, time, urllib.request, urllib.parse
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from irbis_engine import Model, freeze, rerank, clean

IST=ZoneInfo('Asia/Kolkata')
ROOT=Path(os.environ.get('IRBIS_ROOT','/home/ubuntu/irbis'))
INPUT=Path(os.environ.get('IRBIS_INPUT','/home/ubuntu/pallas/input'))
DECISIONS=('10:00','10:05','10:10','10:15')

def stamp(epoch):return datetime.fromtimestamp(epoch,IST).isoformat()
def epoch(day,hm):return datetime.fromisoformat(day+'T'+hm+':00+05:30').timestamp()
def read(path,limit=4_000_000):
    if path.stat().st_size>limit:raise ValueError('Input exceeds size bound')
    return json.loads(path.read_text())
def save(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    # Inputs and documents are already validated. Avoid cloning the full chain
    # cache on each commit on the 1 GB host.
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(obj,separators=(',',':'),allow_nan=False));os.replace(temp,path)

def validate(p,day,now):
    if p['date']!=day or p['exported_at']>now+2:raise ValueError('Wrong date or future export')
    cut=p['cut'][:5];instant=epoch(day,cut)
    if not instant<=p['exported_at']<=instant+180:raise ValueError('Export outside capture window')
    if p['degraded']:raise ValueError('Degraded upstream capture')
    for key in ('candles','chains','chain_received','baselines'):
        if not isinstance(p[key],dict):raise ValueError('Invalid capture schema')
    # Invalid/stale symbol chains cannot silently contribute to ranking.
    p['chains']={s:rows for s,rows in p['chains'].items() if isinstance(p['chain_received'].get(s),(int,float)) and
                 instant-5<=p['chain_received'][s]<=p['exported_at']}
    if len(p['chains'])<.9*len(p['chain_received']):raise ValueError('Insufficient fresh chain coverage')
    for s,b in list(p['candles'].items()):
        if epoch(day,b['time'][:5])+300!=instant:raise ValueError('Incorrect cash candle boundary')
        if not all(isinstance(b.get(k),(int,float)) and math.isfinite(b[k]) for k in ('open','high','low','close','volume')):
            raise ValueError('Cash volume/OHLC unavailable; exporter update required')
        if b['volume']<0 or b['low']<=0 or not b['low']<=min(b['open'],b['close'])<=max(b['open'],b['close'])<=b['high']:
            raise ValueError('Invalid cash candle')
    return p

class Worker:
    def __init__(self,root=ROOT,now=None):
        self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True)
        self.model=Model(self.root/'irbis_model.json');self.startup=now or time.time();self.state=None;self.error=None
    def start(self,day):
        self.path=self.root/'state'/f'{day}.json'
        self.state=read(self.path,16_000_000) if self.path.exists() else dict(day=day,bars={},snapshots={},processed=[],frozen=None,documents=[],prior_day=None,last_cut=None)
    def doc(self,cut,state,candidates,reason,now,recovered=False,**extra):
        day=self.state['day']
        return dict(source='irbis',cap='IRBIS',sig_date=day.replace('-',''),date=day,kind='SNAPSHOT',
            Doc_ID=f'irbis|{self.model.id}|{day}|{cut}',Date=day,Time=datetime.fromtimestamp(now,IST).strftime('%H:%M:%S'),
            Issued_At=stamp(now),Available_At=stamp(now),Health_At=stamp(now),Recovered=recovered,Model_ID=self.model.id,
            State=state,Cut=cut,Decision_Time=cut,Frozen_At='10:00',OI_Cut={'10:00':'09:55','10:05':'10:00','10:10':'10:05','10:15':'10:10'}.get(cut),
            Candidates=clean(candidates[:5]),Total_Candidates=len(candidates),Reason=reason,**extra)
    def ingest(self,p,now):
        day=self.state['day'];cut=p['cut'][:5]
        if cut in self.state['processed']:return
        p=validate(p,day,now)
        # Persist previous cash morning and same-expiry prior OI independently.
        for sym,b in (p['candles'].items() if cut<='10:15' else []):
            bar=dict(hm=b['time'][:5],o=b['open'],h=b['high'],l=b['low'],c=b['close'],v=b['volume'])
            existing={x['hm']:x for x in self.state['bars'].get(sym,[])};existing.setdefault(bar['hm'],bar)
            self.state['bars'][sym]=sorted(existing.values(),key=lambda b:b['hm'])
        if cut in ('09:45','09:55','10:00','10:05','10:10'):
            self.state['snapshots'][cut]=dict(expiry=p['expiry'],chains=p['chains'])
        prior_days={x.get('prior_day') for x in p['baselines'].values() if x.get('prior_day') and x['prior_day']<day}
        if prior_days:self.state['prior_day']=max(prior_days)
        snapshots=self.state['snapshots'];recovered=p['exported_at']<self.startup or now-epoch(day,cut)>180
        if cut=='10:00':
            prior_day=self.state['prior_day'];pc=self.root/'prior'/f'{prior_day}-cash.json';po=self.root/'prior'/f'{prior_day}-chain.json'
            prior=read(pc).get('bars',{}) if pc.exists() else {}
            prev=read(po) if po.exists() else {}
            if not all(x in snapshots for x in ('09:45','09:55')):raise ValueError('Missing 09:45/09:55 chain snapshots')
            if any(snapshots[x]['expiry']!=p['expiry'] for x in ('09:45','09:55')):raise ValueError('Expiry changed before freeze')
            # Match prior-session date per symbol, never substitute stale data.
            prior={s:b for s,b in prior.items() if p['baselines'].get(s,{}).get('prior_day')==prior_day}
            frozen,coverage=freeze(self.model,day,self.state['bars'],prior,prev,snapshots['09:45'],snapshots['09:55'],p['baselines'])
            self.state['frozen']=frozen
            adequate=coverage['cash_ready']>=.9*len(snapshots['09:55']['chains'])
            if not adequate:
                frozen=[];self.state['frozen']=None;coverage['reason']='Incomplete morning cash coverage; ranking suppressed'
            state=('READY' if frozen else 'EMPTY') if adequate else 'ERROR'
            self.state['documents'].append(self.doc(cut,state,frozen,'10:00 shortlist frozen' if frozen else coverage.get('reason','No qualifying setup'),now,recovered,Coverage=coverage))
        elif cut in DECISIONS:
            frozen=self.state['frozen']
            if frozen is None:raise ValueError('10:00 freeze unavailable; later discovery disabled')
            current={'10:05':'10:00','10:10':'10:05','10:15':'10:10'}[cut]
            old={'10:05':'09:55','10:10':'10:00','10:15':'10:05'}[cut]
            if not all(x in snapshots for x in ('09:55',current,old)):raise ValueError('Missing OI rerank snapshot')
            if any(snapshots[x]['expiry']!=p['expiry'] for x in ('09:55',current,old)):raise ValueError('Expiry changed during morning')
            ranked=rerank(frozen,self.state['bars'],snapshots['09:55'],snapshots[current],snapshots[old],cut)
            self.state['documents'].append(self.doc(cut,'READY' if ranked else 'EMPTY',ranked,'OI rerank; confirmation requires both legs and VWAP',now,recovered))
        if cut=='10:00':save(self.root/'prior'/f'{day}-cash.json',dict(date=day,bars=self.state['bars']))
        if cut=='15:25':save(self.root/'prior'/f'{day}-chain.json',dict(date=day,expiry=p['expiry'],chains=p['chains']))
        self.state['processed'].append(cut);self.state['last_cut']=cut;save(self.path,self.state)
        self.error=None

class Publisher:
    def __init__(self):
        self.cfg=read(Path('/home/ubuntu/ocelot/ords.json'),16000);self.token=None;self.expires=0
    def request(self,url,data=None,headers=None):
        with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers or {}),timeout=15) as response:
            body=response.read(2_000_001)
            if len(body)>2_000_000:raise ValueError('ORDS response exceeds bound')
            return json.loads(body) if body else {}
    def auth(self):
        if self.token and time.time()<self.expires:return self.token
        basic=base64.b64encode((self.cfg['client_id']+':'+self.cfg['client_secret']).encode()).decode()
        data=self.request(self.cfg['base']+'/oauth/token',b'grant_type=client_credentials',{'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'})
        self.token=data['access_token'];self.expires=time.time()+int(data.get('expires_in',3600))-60
        return self.token
    def send(self,doc):
        token=self.auth();url=self.cfg['base']+self.cfg['path'];headers={'Authorization':'Bearer '+token}
        # Read-back before a durable outbox send handles uncertain prior POSTs.
        data=self.request(url+'?'+urllib.parse.urlencode(dict(src='irbis',sig_date=doc['sig_date'])),headers=headers)
        for item in data.get('items',[]):
            value=item.get('doc',item);value=json.loads(value) if isinstance(value,str) else value
            if value.get('source')=='irbis' and value.get('Doc_ID')==doc['Doc_ID']:return
        self.request(url,json.dumps(clean(doc),allow_nan=False).encode(),dict(headers,**{'Content-Type':'application/json'}))

def main():
    import fcntl
    ROOT.mkdir(parents=True,exist_ok=True)
    lock=open(ROOT/'worker.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    worker=Worker();publisher=Publisher();sent_path=ROOT/'sent.json';sent=set(read(sent_path)) if sent_path.exists() else set()
    last_health=0;failed={}
    while True:
        now=time.time();local=datetime.fromtimestamp(now,IST);day=local.date().isoformat()
        if worker.state is None or worker.state['day']!=day:worker.start(day);failed={}
        for path in sorted(INPUT.glob(day.replace('-','')+'-????.json')):
            cut=path.stem[-4:-2]+':'+path.stem[-2:]
            if not ('09:20'<=cut<='10:15' or cut=='15:25'):continue
            if cut in worker.state['processed'] or failed.get(cut)==path.stat().st_mtime:continue
            try:worker.ingest(read(path),now)
            except Exception as exc:
                worker.error=type(exc).__name__+': '+str(exc)[:120];failed[cut]=path.stat().st_mtime
                print('Irbis input',cut,worker.error,flush=True)
        for doc in worker.state['documents']:
            if doc['Doc_ID'] in sent:continue
            try:publisher.send(doc);sent.add(doc['Doc_ID']);save(sent_path,sorted(sent))
            except Exception as exc:worker.error='Publication unavailable: '+type(exc).__name__;break
        if now-last_health>=60:
            closed=local.weekday()>=5 or not '09:15'<=local.strftime('%H:%M')<='15:30'
            overdue=not closed and local.strftime('%H:%M')>='10:03' and worker.state['frozen'] is None
            if overdue and not worker.error:worker.error='10:00 input coverage incomplete; shortlist unavailable'
            status='ERROR' if worker.error else ('CLOSED' if closed else ('READY' if worker.state['frozen'] is not None else 'PENDING'))
            health=dict(date=day,status=status,reason=worker.error or ('Outside regular NSE session' if closed else 'Waiting for morning captures' if status=='PENDING' else 'Morning scanner running'),
                        last_cut=worker.state['last_cut'],model_id=worker.model.id,model_trained_through=worker.model.manifest['trained_through'],
                        model_families=sorted({k.split('_')[0] for k in worker.model.bundle['models']}),heartbeat=stamp(now),pid=os.getpid())
            save(ROOT/'health.json',health)
            # One health document per five minutes (15 minutes outside session).
            slot=int(now//(900 if closed else 300))
            doc=worker.doc('HEALTH',status,[],health['reason'],now)
            doc.update(kind='HEALTH',Doc_ID=f'irbis|health|{day}|{slot}',Last_Cut=worker.state['last_cut'])
            if doc['Doc_ID'] not in sent:
                try:publisher.send(doc);sent.add(doc['Doc_ID']);save(sent_path,sorted(sent))
                except Exception as exc:print('Irbis health publish:',type(exc).__name__,flush=True)
            last_health=now
        time.sleep(15)

if __name__=='__main__':main()
