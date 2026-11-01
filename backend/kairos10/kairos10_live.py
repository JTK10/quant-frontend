"""Isolated Aurum-powered PAPER worker. No broker order API or new data stream."""
import asyncio
import json
import os
from pathlib import Path
import sys
import time

from kairos10_engine import Trader,MODEL,day,epoch,stamp,hm
from kairos10_features import Features,read,entry_hold,validate_capture
from native_kairos2_live import Broker,Publisher as NativePublisher,bounded_response

ROOT=Path(os.environ.get('KAIROS10_ROOT','/home/ubuntu/kairos10'))
INPUT=Path(os.environ.get('KAIROS10_INPUT','/home/ubuntu/pallas/input'))
AURUM=Path(os.environ.get('KAIROS10_AURUM','/home/ubuntu/aurum'))


class Publisher(NativePublisher):
    async def read(self,date):
        rows=await bounded_response(self.client,'GET',self.cfg['base']+self.cfg['path'],
            params={'src':'kairos10','sig_date':date.replace('-','')},headers=await self.headers())
        if rows.get('hasMore') or len(rows.get('items',[]))>1500:raise ValueError('Incomplete/big publication readback')
        docs=[]
        for item in rows.get('items',[]):
            value=item.get('doc',item);doc=json.loads(value) if isinstance(value,str) else value
            if doc.get('source')=='kairos10' and doc.get('sig_date')==date.replace('-',''):docs.append(doc)
        return docs

    async def send_once(self,doc,persist):
        if any(d.get('Doc_ID')==doc['Doc_ID'] for d in await self.read(doc['date'])):return
        if doc.get('_publish_attempted'):raise ValueError('Uncertain publication retained for readback; no blind repost')
        doc['_publish_attempted']=True;persist()
        public={k:v for k,v in doc.items() if not k.startswith('_')}
        await bounded_response(self.client,'POST',self.cfg['base']+self.cfg['path'],
            headers=await self.headers(),content=json.dumps(public,allow_nan=False))


class Runner:
    def __init__(self,root,aurum,input_root,calendar,now):
        self.root=Path(root);self.input=Path(input_root);self.calendar=calendar
        self.trader=Trader(self.root,now);self.features=Features(self.root,aurum,calendar,now)
        self.date=None;self.next_quote=0;self.next_scan=0;self.last_health=0
        self.error=None;self.publish_error=None;self.failure_keys={};self.closed_files=set()

    def ingest_current(self,now):
        date=day(now)
        if date!=self.date:
            self.date=date;self.features.start(date);self.failure_keys={};self.closed_files=set()
        # At most21 prefixes. Each is parsed once after successful evaluation;
        # a delayed Nifty cache may cause bounded retries until cut+90 only.
        for path in sorted(self.input.glob(date.replace('-','')+'-????.json')):
            cut=path.stem[-4:-2]+':'+path.stem[-2:]
            if not '09:20'<=cut<='11:00' or cut in self.closed_files:continue
            if epoch(date+'T'+cut+':00+05:30')>now:continue
            cache=Path(self.features.aurum)/'nifty-cache.json'
            key=(path.stat().st_mtime_ns,cache.stat().st_mtime_ns if cache.exists() else None)
            if self.failure_keys.get(cut)==key:continue
            try:
                p=read(path);events=self.features.evaluate(p,now)
                if cut in self.features.state['evaluated'] or not '09:40'<=cut<='10:55':self.closed_files.add(cut)
                for event in events:
                    if not self.trader.state['taken'] and not self.trader.state['position']:
                        self.trader.state['intents'].append(event)
                if events:self.trader.save()
                self.trader.state['last_cut']=cut
                self.failure_keys.pop(cut,None);self.error=None
            except (OSError,ValueError,KeyError,TypeError) as exc:
                self.failure_keys[cut]=key;self.error=cut+': '+type(exc).__name__
                # Old missing context cannot cause a retroactive purchase.
                if now>epoch(date+'T'+cut+':00+05:30')+90:self.closed_files.add(cut)

    async def entries(self,broker,now,opening,closing):
        state=self.trader.state
        if state['taken'] or state['position']:return
        keep=[]
        for event in state['intents']:
            due=epoch(event['Entry_Due_At'])
            if now>due+90:
                self.trader.reject(event,now,'Exact next-cut entry deadline expired')
            else:keep.append(event)
        state['intents']=keep
        if not keep:return
        # First eligible cut wins; later candidates never rank across time.
        events=sorted(keep,key=lambda e:(e['Signal_Time'],-e['AI_Score'],e['Symbol']))
        for event in events:
            due=epoch(event['Entry_Due_At'])
            if now<due:break
            if now<self.next_quote:break
            path=self.input/(event['Date'].replace('-','')+'-'+hm(due)[:5].replace(':','')+'.json')
            if not path.exists():break
            p=read(path)
            if not entry_hold(event,p,now):
                self.trader.reject(event,now,'PDH/PDL and opening-range entry hold or fresh exact-cut capture failed')
                state['intents']=[e for e in state['intents'] if e['Event_ID']!=event['Event_ID']];continue
            event['entry_hold_passed']=True
            contract=event.get('_contract')
            if contract is None:
                attempts=event.get('_metadata_attempts',0)
                if attempts>=3:
                    self.trader.reject(event,now,'Contract metadata retry limit reached')
                    state['intents']=[e for e in state['intents'] if e['Event_ID']!=event['Event_ID']];continue
                event['_metadata_attempts']=attempts+1;self.trader.save()
                contract=await broker.contract(event)
                event['_contract']=contract;self.trader.save()
            q=await broker.quote(contract['key']);now=time.time();self.next_quote=now+5
            if q['quote_at']<due:break
            entered=self.trader.enter(event,contract,q,now,opening,closing)
            state['last_decision']=dict(symbol=event['Symbol'],confirmation=event['Signal_Time'],due=hm(due)[:5],
                cut=event['Signal_Time'],score=event['AI_Score'],at=stamp(now),status='ENTERED' if entered else 'WAITING_OR_SKIPPED',
                reason='Paper position open' if entered else state['status'])
            if entered:break
            if event['Event_ID'] in state['seen']:
                state['intents']=[e for e in state['intents'] if e['Event_ID']!=event['Event_ID']]
                continue
            break
        self.trader.save()

    async def tick(self,broker,now):
        t=self.trader;t.roll(now)
        regular=self.calendar.regular_day(day(now))
        if not regular:
            t.state['status']='Exit pending: market closed; position retained' if t.state['position'] else self.calendar.closed_reason(day(now))
            return
        clock=hm(now)
        # Reuse native verified market timings only during a useful live window.
        if not t.state['position'] and not '09:14:00'<=clock<='11:02:00':
            t.state['status']='Daily paper trade complete' if t.state['taken'] else 'Waiting for09:45-11:00 entry session'
            return
        sessions=await broker.timings(now)
        if not sessions:
            t.state['status']='Waiting for verified NSE session' if sessions is None else 'NSE closed; no entries'
            return
        opening,closing=sessions[0]
        if not opening<=now<closing:
            t.state['status']='Exit pending: market closed; position retained' if t.state['position'] else 'NSE closed; no entries'
            return
        if t.state['position']:
            if now>=self.next_quote:
                quote=await broker.quote(t.state['position']['opt_key']);t.mark(quote,time.time());self.next_quote=time.time()+5
            return
        if t.state['taken']:
            t.state['status']='Daily paper trade complete';return
        if now>=self.next_scan:
            self.ingest_current(now);self.next_scan=now+5
        t.state['status']='Waiting for next-cut entry' if t.state['intents'] else 'Waiting for Aurum pullback score>=30/100'
        await self.entries(broker,now,opening,closing)


async def run():
    import fcntl
    import httpx
    sys.path.insert(0,'/home/ubuntu/market-calendar');import nse_calendar
    ROOT.mkdir(parents=True,exist_ok=True)
    lock=(ROOT/'service.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    runner=Runner(ROOT,AURUM,INPUT,nse_calendar,time.time())
    async with httpx.AsyncClient(timeout=httpx.Timeout(8.,connect=5.),follow_redirects=False,
        limits=httpx.Limits(max_connections=2,max_keepalive_connections=2)) as client:
        broker,publisher=Broker(client),Publisher(client)
        async def publishing():
            while True:
                if runner.trader.state['pending']:
                    doc=runner.trader.state['pending'][0]
                    try:
                        await publisher.send_once(doc,runner.trader.save)
                        runner.trader.state['pending']=[d for d in runner.trader.state['pending'] if d['Doc_ID']!=doc['Doc_ID']]
                        runner.trader.save();runner.publish_error=None
                    except Exception as exc:
                        runner.publish_error=type(exc).__name__;await asyncio.sleep(30)
                await asyncio.sleep(1)
        task=asyncio.create_task(publishing())
        try:
            while True:
                now=time.time()
                try:await runner.tick(broker,now)
                except Exception as exc:
                    runner.error=type(exc).__name__
                    runner.trader.state['status']='Waiting for required data; position retained' if runner.trader.state['position'] else 'Waiting for required Aurum/option data'
                    runner.next_quote=time.time()+5
                if now-runner.last_health>=60:
                    runner.trader.health(now,extra=dict(data_error=runner.error,publish_error=runner.publish_error,
                        aurum_health_available=(AURUM/'health.json').is_file(),paper_only=True))
                    runner.last_health=now
                await asyncio.sleep(1)
        finally:
            task.cancel();runner.trader.save()


if __name__=='__main__':asyncio.run(run())
