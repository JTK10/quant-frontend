"""Isolated minute-triggered optional publisher over existing saved Pallas cuts."""
import argparse,base64,fcntl,json,os,time
from pathlib import Path
from datetime import datetime,timedelta,timezone
from urllib.request import Request,urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
from model import build_rows,VERSION

IST=timezone(timedelta(hours=5,minutes=30))
CUTS=[f'{m//60:02}:{m%60:02}' for m in range(560,931,5)]
SOURCE='chart_flow_v1'

def save(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,separators=(',',':'),allow_nan=False));os.replace(tmp,path)

def document(day,cut,rows,available):
    return dict(source=SOURCE,cap='CHART_FLOW',name='',side='NEUTRAL',Doc_ID=f'chart-flow|v1|{day}|{cut}',sig_date=day.replace('-',''),date=day,cut=cut,time=cut+':00',ts=available,available_at=available,version=VERSION,rows=rows)

class Transport:
    def __init__(self,cfg,token_path=None):
        self.cfg=cfg;self.token=None;self.token_path=token_path
        if token_path and token_path.exists():
            try:
                cached=json.loads(token_path.read_bytes())
                if cached['until']>time.time():self.token=cached['token']
            except (ValueError,KeyError):pass
    def request(self,method,url,body=None,auth=True):
        headers={'Content-Type':'application/json'}
        if auth:
            if not self.token:
                basic=base64.b64encode((self.cfg['client_id']+':'+self.cfg['client_secret']).encode()).decode()
                r=Request(self.cfg['base'].rstrip('/')+'/oauth/token',data=b'grant_type=client_credentials',headers={'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'})
                with urlopen(r,timeout=10) as f:credentials=json.load(f)
                self.token=credentials['access_token']
                if self.token_path:
                    tmp=self.token_path.with_suffix('.tmp')
                    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
                    with os.fdopen(fd,'w') as f:json.dump(dict(token=self.token,until=time.time()+max(0,float(credentials.get('expires_in',300))-60)),f)
                    os.replace(tmp,self.token_path)
            headers['Authorization']='Bearer '+self.token
        r=Request(url,data=json.dumps(body,separators=(',',':'),allow_nan=False).encode() if body else None,headers=headers,method=method)
        try:
            with urlopen(r,timeout=10) as f:
                data=f.read(1_000_001)
                if len(data)>1_000_000:raise ValueError('Flow feed byte budget exceeded')
                return json.loads(data) if data.strip() and data.lstrip()[:1] in (b'{',b'[') else {}
        except HTTPError as error:
            if error.code==401:
                self.token=None
                if self.token_path:self.token_path.unlink(missing_ok=True)
            raise
    def read(self,day):
        url=self.cfg['base']+self.cfg['path']+'?'+urlencode(dict(src=SOURCE,sig_date=day.replace('-','')))
        data=self.request('GET',url)
        if data.get('hasMore') or len(data.get('items',[]))>80:raise ValueError('Incomplete flow feed')
        result={}
        for item in data.get('items',[]):
            doc=item.get('doc',item)
            if isinstance(doc,str):doc=json.loads(doc)
            if doc.get('source')!=SOURCE or doc.get('date')!=day:raise ValueError('Flow source/date mismatch')
            result[doc['Doc_ID']]=doc
        return result

def run(args):
    root=Path(args.root);root.mkdir(parents=True,exist_ok=True)
    with (root/'worker.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:return
        now=datetime.now(IST);day=args.date or now.strftime('%Y-%m-%d')
        if not args.flush_only and now.weekday()<5 and '09:20'<=now.strftime('%H:%M')<='15:40':
            count=0
            for cut in CUTS:
                if cut>now.strftime('%H:%M'):break
                filename=day+'-'+cut.replace(':','')+'.json'
                if (root/'sent'/filename).exists() or (root/'outbox'/filename).exists():continue
                source=Path(args.input)/(day.replace('-','')+'-'+cut.replace(':','')+'.json')
                if not source.exists():continue
                if source.stat().st_size>4_000_000:raise ValueError('Input byte budget exceeded')
                current=json.loads(source.read_bytes())
                if current.get('date')!=day or current.get('cut')!=cut+':00':raise ValueError('Capture identity mismatch')
                before=datetime.fromisoformat(day+'T'+cut)-timedelta(minutes=5)
                previous=Path(args.input)/(before.strftime('%Y%m%d-%H%M')+'.json')
                prev=json.loads(previous.read_bytes()) if previous.exists() and previous.stat().st_size<=4_000_000 else None
                doc=document(day,cut,build_rows(current,prev),current['exported_at'])
                save(root/'outbox'/filename,dict(document=doc,attempts=0,next_try=0))
                count+=1
                if count>=args.batch:break
        paths=[root/'outbox'/(day+'-'+cut.replace(':','')+'.json') for cut in CUTS]
        pending=[]
        for p in paths:
            if not p.exists():continue
            record=json.loads(p.read_bytes())
            if record['attempts']<8 and record['next_try']<=time.time():pending.append((p,record))
            if len(pending)>=args.batch:break
        if not pending:return
        transport=Transport(json.loads(Path(args.config).read_bytes()),root/'.oauth.json');published=transport.read(day)
        for path,record in pending:
            record['attempts']+=1;record['next_try']=time.time()+min(900,15*2**(record['attempts']-1));save(path,record)
            doc=record['document']
            existing=published.get(doc['Doc_ID'])
            if existing and existing.get('rows')!=doc['rows']:raise ValueError('Existing publication differs; no overwrite')
            if not existing:transport.request('POST',transport.cfg['base']+transport.cfg['path'],doc)
        readback=transport.read(day)
        for path,record in pending:
            doc=record['document'];seen=readback.get(doc['Doc_ID'])
            if not seen or seen.get('rows')!=doc['rows']:raise ValueError('Publication read-back failed')
            (root/'sent').mkdir(exist_ok=True);os.replace(path,root/'sent'/path.name)
        save(root/'health.json',dict(date=day,updated_at=time.time(),last_cut=pending[-1][1]['document']['cut'],published=len(pending),version=VERSION))
        print(json.dumps(dict(status='SENT',date=day,cuts=[r['document']['cut'] for _,r in pending])))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',default='/home/ubuntu/chart-flow');p.add_argument('--input',default='/home/ubuntu/pallas/input');p.add_argument('--config',default='/home/ubuntu/ocelot/ords.json');p.add_argument('--date');p.add_argument('--flush-only',action='store_true');p.add_argument('--batch',type=int,default=3)
    a=p.parse_args()
    if not 1<=a.batch<=12:raise ValueError('Batch exceeds budget')
    run(a)
