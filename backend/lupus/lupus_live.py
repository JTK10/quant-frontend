"""Small VM2 consumer of Rusty's local adapter and Ocelot's existing EOD archive."""
import base64,csv,gzip,json,os,sys,time,urllib.request,urllib.parse
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from lupus_engine import Scanner,failures
ROOT=Path(os.environ.get('LUPUS_ROOT','/home/ubuntu/lupus'));IST=ZoneInfo('Asia/Kolkata')
def read(path,limit=4_000_000):
    if path.stat().st_size>limit:raise ValueError('File exceeds input budget')
    return json.loads(path.read_text(encoding='utf-8'))
def save(path,data):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data,separators=(',',':'),allow_nan=False),encoding='utf-8');os.replace(temp,path)
class Publisher:
    def __init__(self):self.cfg=read(Path('/home/ubuntu/ocelot/ords.json'),16000);self.token=None;self.until=0
    def request(self,url,data=None,headers=None):
        with urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers or {}),timeout=15) as r:
            body=r.read(4_000_001)
            if len(body)>4_000_000:raise ValueError('ORDS response exceeds budget')
            return json.loads(body) if body else {}
    def auth(self):
        if self.token and time.time()<self.until:return self.token
        basic=base64.b64encode((self.cfg['client_id']+':'+self.cfg['client_secret']).encode()).decode()
        d=self.request(self.cfg['base']+'/oauth/token',b'grant_type=client_credentials',{'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'})
        self.token=d['access_token'];self.until=time.time()+int(d.get('expires_in',3600))-60;return self.token
    def send(self,doc):
        url=self.cfg['base']+self.cfg['path'];headers={'Authorization':'Bearer '+self.auth()}
        d=self.request(url+'?'+urllib.parse.urlencode(dict(src=doc['source'],sig_date=doc['sig_date'])),headers=headers)
        if d.get('hasMore') or d.get('has_more'):raise ValueError('Read-back truncated')
        for item in d.get('items',[]):
            x=item.get('doc',item);x=json.loads(x) if isinstance(x,str) else x
            if x.get('source')==doc['source'] and x.get('Doc_ID')==doc['Doc_ID']:return
        self.request(url,json.dumps(doc,allow_nan=False).encode(),dict(headers,**{'Content-Type':'application/json'}))

def close_session(day,history):
    payload=read(ROOT/('close-'+day+'.json'),2_000_000)
    if payload['date']!=day:raise ValueError('Wrong EOD cash session')
    bars=payload['bars']
    if not bars:raise ValueError('No current-session archived candles')
    info=failures(day,bars,history)
    if info['complete_symbols']<.9*len(bars):raise ValueError('Incomplete EOD cash coverage; context not advanced')
    p=read(Path('/home/ubuntu/pallas/input')/(day.replace('-','')+'-1525.json'))
    if p['date']!=day or p['degraded']:raise ValueError('EOD OI capture missing/degraded')
    # Reuse the installed chart algorithm, with no DuckDB reader or broker call.
    sys.path.insert(0,'/home/ubuntu/ocelot')
    from chart_oi import build_levels
    rows=[]
    for symbol,chain in p['chains'].items():
        spot=p['baselines'].get(symbol,{}).get('spot')
        for strike,leg,ltp,oi,prev,vol in chain:rows.append([day,symbol,p['expiry'],strike,leg,spot,ltp,vol,oi,prev])
    info['walls']=[dict(symbol=r[0],wall_date=day,expiry=str(r[2]),line=w[0]) for r in build_levels(rows) for walls in r[3:5] for w in walls]
    history[day]=info
    # Bound only the derived working context; original inputs and archives remain intact.
    for old in sorted(history)[:-12]:history.pop(old)
    save(ROOT/'history.json',history)

def main():
    import fcntl
    ROOT.mkdir(exist_ok=True);(ROOT/'input').mkdir(exist_ok=True)
    lock=open(ROOT/'worker.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    pub=Publisher();day=None;scanner=None;last_health=0;error=None;failed={};closed_attempt=0
    while True:
        now=time.time();local=datetime.fromtimestamp(now,IST);today=local.date().isoformat();hm=local.strftime('%H:%M')
        if day!=today:
            day=today;history=read(ROOT/'history.json',8_000_000);path=ROOT/('state-'+day+'.json')
            scanner=Scanner(day,history,read(path,16_000_000) if path.exists() else None);sentpath=ROOT/('sent-'+day+'.json');sent=set(read(sentpath)) if sentpath.exists() else set();failed={};error=None
        for p in sorted((ROOT/'input').glob(day.replace('-','')+'-????.json')):
            cut=p.stem[-4:-2]+':'+p.stem[-2:]
            if cut in scanner.state['cuts'] or failed.get(cut)==p.stat().st_mtime:continue
            capture=Path('/home/ubuntu/pallas/input')/p.name
            if not capture.exists():continue
            try:
                current=read(capture)
                priors={b.get('prior_day') for b in current.get('baselines',{}).values() if b.get('prior_day') and b['prior_day']<day}
                if not priors or not scanner.prior or scanner.prior[-1]!=max(priors):raise ValueError('Previous-session context incomplete')
                if current.get('date')!=day or current.get('degraded'):raise ValueError('Degraded or mismatched Ocelot capture')
                data=read(p,500_000);scanner.ingest(data['rusty'],data['pdh'],now,data.get('opening_ce'));save(path,scanner.state);error=None
            except Exception as exc:failed[cut]=p.stat().st_mtime;error='Capture unavailable: '+str(exc)[:100]
        for doc in scanner.state['documents']:
            if doc['Doc_ID'] in sent:continue
            try:pub.send(doc);sent.add(doc['Doc_ID']);save(sentpath,sorted(sent))
            except Exception as exc:error='Publication unavailable: '+type(exc).__name__;break
        closed=local.weekday()>4 or not '09:15'<=hm<='15:30'
        last=scanner.state['documents'][-1] if scanner.state['documents'] else None
        overdue=not closed and hm>='09:24' and (last is None or now-last['input_ts']>600)
        if now-last_health>=60:
            state='ERROR' if error or overdue else 'CLOSED' if closed else 'READY' if last else 'PENDING'
            reason=error or ('Rusty capture delayed or missing' if overdue else 'Outside regular NSE session' if closed else 'Current Rusty inputs' if last else 'Waiting for first completed Rusty capture')
            health=dict(source='lupus_health',cap='LUPUS',name='LUPUS_HEALTH',event=state,side='NEUTRAL',ts=now,time=hm,cut=last['cut'] if last else '',
                sig_date=day.replace('-',''),date=day,detail=reason,Doc_ID=f'lupus|health|{day}|{int(now//(900 if closed else 300))}')
            save(ROOT/'health.json',health)
            if health['Doc_ID'] not in sent:
                try:pub.send(health);sent.add(health['Doc_ID']);save(sentpath,sorted(sent))
                except Exception as exc:error='Health publication unavailable: '+type(exc).__name__
            last_health=now
        # Existing Ocelot EOD archive is the only cash history updater. No added broker calls.
        if local.weekday()<5 and hm>='16:00' and day not in history and last and now-closed_attempt>900:
            closed_attempt=now
            try:close_session(day,history)
            except Exception as exc:error='History update unavailable: '+str(exc)[:100]
        time.sleep(15 if not closed else 60)
if __name__=='__main__':main()
