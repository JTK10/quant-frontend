"""Notifications only: fresh confirmed Pallas AI>70 and Kairos2 ENTRY/EXIT.

Reads existing exports/ORDS; never writes scanner files or calls a broker.
Existing VM1 Kairos and morning health senders remain separate.
"""
import argparse
import base64
import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')
ROOT = Path(os.environ.get('TELEGRAM_RELAY_ROOT', '/home/ubuntu/telegram-signals'))
PALLAS = Path('/home/ubuntu/pallas')
MAX_AGE = 300


def epoch(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    iso = str(value).replace('Z', '+00:00')
    iso = re.sub(r'\.(\d+)(?=[+-]\d{2}:?\d{2}$)', lambda m: '.'+(m[1]+'000000')[:6], iso)
    parsed = datetime.fromisoformat(iso)
    if parsed.tzinfo is None:
        raise ValueError('Timestamp requires timezone')
    return parsed.timestamp()


def day(now):
    return datetime.fromtimestamp(now, IST).date().isoformat()


def save(path, data):
    temp = path.with_suffix('.tmp')
    with temp.open('w') as f:
        os.chmod(temp, 0o600)
        json.dump(data, f, allow_nan=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, path)


def bounded_json(req):
    with urllib.request.urlopen(req, timeout=10) as response:
        data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise ValueError('Response exceeds size bound')
        return json.loads(data)


def pallas_alert(event, now, enabled_at):
    try:
        issued = epoch(event['Issued_At'])
        score = event['AI_Score']
        if (event['Event_Type'] != 'CONFIRMED_CLOSE' or event['Confirmation_Status'] != 'CONFIRMED'
                or event.get('Recovered') is not False or event.get('AI_Status') != 'SCORED'
                or isinstance(score, bool) or not isinstance(score, (float, int))
                or not math.isfinite(score) or not .70 < score <= 1
                or event['Date'] != day(now) or day(issued) != day(now)
                or not enabled_at <= issued <= now or now-issued > MAX_AGE):
            return None
        clock = datetime.fromtimestamp(issued, IST).strftime('%H:%M:%S')
        message = (f"PALLAS · {event['Side']} · AI {score*100:.1f}%\n"
                   f"{event['Symbol']} {event['Selected_Strike']} · {event['Expiry']}\n"
                   f"Confirmed {clock} IST · Spot {event['Breakout_Spot']}\n"
                   f"Reference premium ₹{event['Reference_Premium']} (not a fill)\n"
                   "https://quant-radar-ai.vercel.app/pallas")
        return {'id':'pallas|'+event['Event_ID'], 'issued':issued, 'text':message}
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def kairos_alert(doc, now, enabled_at):
    try:
        issued = epoch(doc['ts'])
        kind = doc.get('event', doc.get('kind'))
        if (doc.get('source') != 'kairos2' or kind not in ('ENTRY','EXIT')
                or doc.get('mode') != 'paper' or doc.get('sig_date') != day(now).replace('-','')
                or day(issued) != day(now) or not enabled_at <= issued <= now or now-issued > MAX_AGE):
            return None
        title = 'PAPER BUY' if kind == 'ENTRY' else 'PAPER EXIT'
        message = f"KAIROS 2.0 · {title}\n{doc['name']}\n{doc['time']} IST · ₹{doc['entry']} · Qty {doc['quantity']} ({doc['lots']} lots)"
        if kind == 'ENTRY':
            score = doc.get('ai_score')
            if isinstance(score,(int,float)) and not isinstance(score,bool) and math.isfinite(score):
                message += f"\nAI {score*100:.1f}%"
            message += f" · Stop ₹{doc.get('stop_premium','—')}"
        else:
            message += f"\n{str(doc.get('reason','')).replace('_',' ')} · Gross P&L ₹{doc.get('pnl','—')}"
        message += '\nhttps://quant-radar-ai.vercel.app/kairos'
        return {'id':'kairos2|'+doc['Doc_ID'], 'issued':issued, 'text':message}
    except (KeyError,TypeError,ValueError,OverflowError):
        return None


class Relay:
    def __init__(self, persist=True):
        if persist: ROOT.mkdir(parents=True, exist_ok=True)
        self.path = ROOT/'state.json'
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {'enabled_at':time.time(),'date':day(time.time()),'seen':{}}
        self.token, self.token_until = None, 0
        self.cfg = json.loads(Path('/home/ubuntu/ocelot/ords.json').read_text())
        if persist: save(self.path,self.state)

    def kairos_docs(self, date):
        if time.time() >= self.token_until:
            basic = base64.b64encode((self.cfg['client_id']+':'+self.cfg['client_secret']).encode()).decode()
            result = bounded_json(urllib.request.Request(self.cfg['base']+'/oauth/token',data=b'grant_type=client_credentials',headers={'Authorization':'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'}))
            self.token, self.token_until = result['access_token'],time.time()+int(result.get('expires_in',3600))-60
        query = urllib.parse.urlencode({'src':'kairos2','sig_date':date.replace('-','')})
        result = bounded_json(urllib.request.Request(self.cfg['base']+self.cfg['path']+'?'+query,headers={'Authorization':'Bearer '+self.token}))
        docs=[]
        for row in result.get('items',[])[:5000]:
            doc=row.get('doc',row)
            if isinstance(doc,str): doc=json.loads(doc)
            if isinstance(doc,dict): docs.append(doc)
        if result.get('hasMore'):
            raise ValueError('Incomplete ORDS page; notification scan skipped')
        return docs

    def send(self, alert):
        identifier=alert['id']
        if identifier in self.state['seen'] and self.state['seen'][identifier]['status'] != 'retry':
            return
        previous=self.state['seen'].get(identifier,{})
        if time.time()<previous.get('retry_at',0): return
        # Persist before transmission. Telegram offers no idempotency key;
        # ambiguous network outcomes are not replayed after restart.
        self.state['seen'][identifier]={'status':'sending','issued':alert['issued']}
        save(self.path,self.state)
        payload=json.dumps({'chat_id':os.environ['TELEGRAM_CHAT_ID'],'text':alert['text'],'disable_web_page_preview':True}).encode()
        req=urllib.request.Request('https://api.telegram.org/bot'+os.environ['TELEGRAM_BOT_TOKEN']+'/sendMessage',data=payload,headers={'Content-Type':'application/json'})
        try:
            result=bounded_json(req)
            self.state['seen'][identifier]['status']='sent' if result.get('ok') else 'rejected'
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                retry_after = 60
                try:
                    body=json.loads(exc.read(16000))
                    retry_after=max(1,min(300,int(body.get('parameters',{}).get('retry_after',60))))
                except (TypeError,ValueError): pass
                self.state['seen'][identifier].update(status='retry',retry_at=time.time()+retry_after)
            else:
                self.state['seen'][identifier]['status']='rejected' if 400<=exc.code<500 else 'uncertain'
            print('Telegram HTTP status:',exc.code,flush=True)
        except Exception as exc:
            self.state['seen'][identifier]['status']='uncertain'
            print('Telegram delivery uncertain:',type(exc).__name__,flush=True)
        save(self.path,self.state)

    def poll(self):
        now=time.time()
        if self.state['date'] != day(now):
            self.state.update(date=day(now),seen={})
        cutoff=self.state['enabled_at']
        alerts=[]
        for path in sorted((PALLAS/'events'/day(now)).glob('CONFIRMED_CLOSE_*.json'))[:300]:
            try:
                if path.stat().st_size>32000: raise ValueError('Event too large')
                alert=pallas_alert(json.loads(path.read_text()),now,cutoff)
                if alert: alerts.append(alert)
            except (OSError,ValueError,TypeError): pass
        error=None
        try:
            for doc in self.kairos_docs(day(now)):
                alert=kairos_alert(doc,now,cutoff)
                if alert: alerts.append(alert)
        except Exception as exc:
            error=type(exc).__name__
            if isinstance(exc,urllib.error.HTTPError) and exc.code==401: self.token_until=0
        for alert in sorted(alerts,key=lambda a:(a['issued'],a['id'])):
            self.send(alert)
        save(self.path,self.state)
        save(ROOT/'health.json',{'date':day(now),'checked_at':datetime.fromtimestamp(now,IST).isoformat(),'status':'READY' if not error else 'ORDS_READ_ERROR','error':error,'pallas_threshold':'>0.70','seen':len(self.state['seen']),'delivery_statuses':{status:sum(x['status']==status for x in self.state['seen'].values()) for status in ('sent','uncertain','rejected','retry','sending')}})


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--probe',action='store_true'); args=parser.parse_args()
    if not os.environ.get('TELEGRAM_BOT_TOKEN') or not os.environ.get('TELEGRAM_CHAT_ID'):
        raise RuntimeError('Telegram credentials unavailable')
    relay=Relay(persist=not args.probe)
    if args.probe:
        result=bounded_json(urllib.request.Request('https://api.telegram.org/bot'+os.environ['TELEGRAM_BOT_TOKEN']+'/getMe'))
        if not result.get('ok'): raise RuntimeError('Telegram bot unavailable')
        relay.kairos_docs(day(time.time()))
        print('Telegram bot and source-isolated Kairos2 read verified; no messages sent.'); return
    import fcntl
    with (ROOT/'service.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        while True:
            current=datetime.now(IST)
            if current.weekday()<5 and '09:15'<=current.strftime('%H:%M')<='15:40':
                try: relay.poll()
                except Exception as exc: print('Relay error:',type(exc).__name__,flush=True)
                time.sleep(20)
            else:
                save(ROOT/'health.json',{'date':day(time.time()),'checked_at':current.isoformat(),'status':'STANDBY','pallas_threshold':'>0.70'})
                time.sleep(20)


if __name__=='__main__': main()
