"""Osprey's bounded consumer of committed Pallas exports."""
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import argparse
import base64
import fcntl
import gzip
import json
import os
import pickle
import re
import sqlite3
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from osprey_engine import Engine, clock, minute

HOME = Path(__file__).resolve().parent
PALLAS = Path('/home/ubuntu/pallas/input')
RUSTY = Path('/home/ubuntu/lupus/input')
RVOL = Path('/home/ubuntu/ocelot/rusty_rvol_data')
CONFIG = Path('/home/ubuntu/ocelot/ords.json')
IST = ZoneInfo('Asia/Kolkata')
CUTS = tuple(clock(slot) for slot in range(555, 926, 5))
ENGINE_VERSION = 'osprey-live-v1'
MAX_DOCUMENT = 96 * 1024
MAX_ROWS_BYTES = 512 * 1024
ROUTE = re.compile(r'\b(?:CE|PE)_(?:BUILD|UNWIND)\b')
ROW_FIELDS = (
    'ce_pct','pe_pct','oi_bias',
    'symbol','side','score','first','last','state','confirmed','strengthening',
    'oi_5m','oi_5m_route','oi_15m','oi_15m_route','rvol','rvol_sessions',
    'sector','sector_strength','sector_samples','sector_source','move_pct',
)
sys.path.insert(0, '/home/ubuntu/market-calendar')


def encode(value):
    return json.dumps(value, separators=(',', ':'), allow_nan=False).encode()


def read_json(path, limit):
    with path.open('rb') as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('Input exceeds size limit')
    return json.loads(raw)


def volume_lookup(day):
    # Reuse Rusty's retained same-slot volume data. Load each day once.
    merged = read_json(RVOL/'seed.json', 8_000_000)['symbols']
    for path in sorted(RVOL.glob('????-??-??.json'))[-25:]:
        if path.stem >= day:
            continue
        saved = read_json(path, 500_000)
        if saved['date'] != path.stem:
            raise ValueError('Invalid volume archive date')
        for symbol, bars in saved['symbols'].items():
            merged.setdefault(symbol, {})[path.stem] = bars
    averages = {}
    for symbol, days in merged.items():
        sums = {}
        for date in sorted(d for d in days if d < day)[-20:]:
            for slot, volume in days[date].items():
                if isinstance(volume,(int,float)) and 0 <= volume:
                    total, count = sums.get(slot,(0,0))
                    sums[slot] = (total+volume,count+1)
        averages[symbol] = sums
    def lookup(_day,symbol,slot,volume):
        total, count = averages.get(symbol,{}).get(slot,(0,0))
        return (round(volume*count/total,2) if total else None,count)
    return lookup


def nominal_time(day,cut):
    return datetime.fromisoformat(f'{day}T{cut}').replace(tzinfo=IST).timestamp()


def source_for(day, cut, now):
    name = day.replace('-','')+'-'+cut.replace(':','')+'.json'
    source = read_json(PALLAS/name,4_000_000)
    if source['date'] != day or source['cut'][:5] != cut or source.get('degraded') is not False:
        raise ValueError('Unhealthy or misdated capture')
    nominal = nominal_time(day,cut)
    published = source['exported_at']
    if not nominal <= published <= min(now,nominal+180):
        raise ValueError('Capture timestamp outside expected window')
    source['chains'] = {symbol: rows for symbol, rows in source['chains'].items()
        if nominal-120 <= source['chain_received'].get(symbol,0) <= published}
    if not source['chains']:
        raise ValueError('No fresh underlying chains')
    source.pop('quotes',None)
    try:
        rusty = read_json(RUSTY/name,700_000)
        raw = rusty['rusty']
        if raw['date'] != day or raw['cut'][:5] != cut or not nominal-120 <= raw['ts'] <= now:
            rusty = None
    except (OSError,ValueError,TypeError,KeyError):
        rusty = None
    return source,rusty


def documents(day,cut,rows,source,now,recovered=False):
    snapshot = []
    for mode, values in rows.items():
        for row in values:
            item = {key: row[key] for key in ROW_FIELDS if row.get(key) is not None}
            item['mode'] = mode
            summary = ' · '.join(dict.fromkeys(ROUTE.findall(row.get('evidence',''))))
            if summary:
                item['evidence'] = summary
            snapshot.append(item)
    hhmm=cut.replace(':','')
    base = dict(cap='OSPREY',engine=ENGINE_VERSION,date=day,sig_date=day.replace('-',''),
                cut=cut,time=cut,ts=now,chain_exported_at=source['exported_at'],recovered=recovered)
    identifier=f'osprey|{ENGINE_VERSION}|{base["sig_date"]}|{hhmm}'
    raw = encode(snapshot)
    if len(raw) > MAX_ROWS_BYTES:
        raise ValueError('Expanded rows exceed budget')
    payload = base64.b64encode(gzip.compress(raw,compresslevel=4,mtime=0)).decode()
    result = (
        dict(base,source=f'osprey-{hhmm}',Doc_ID=identifier,kind='SNAPSHOT',
             encoding='gzip+base64',payload=payload),
        dict(base,source='osprey',Doc_ID=identifier+'|index',kind='INDEX'),
    )
    if any(len(encode(doc))>MAX_DOCUMENT for doc in result):
        raise ValueError('Publication exceeds budget')
    return result


class Publisher:
    def __init__(self):
        cfg=read_json(CONFIG,64_000)
        self.base=cfg['base'].rstrip('/')
        location=urlsplit(self.base)
        path=cfg['path']
        if location.scheme!='https' or not location.hostname or location.username or not path.startswith('/') or path.startswith('//'):
            raise ValueError('HTTPS ORDS configuration required')
        self.url=self.base+path
        self.basic=base64.b64encode((cfg['client_id']+':'+cfg['client_secret']).encode()).decode()
        self.token=''
        self.expiry=0

    def request(self,method,url,headers,data=None,limit=524_288):
        try:
            with urlopen(Request(url,data=data,headers=headers,method=method),timeout=10) as response:
                raw=response.read(limit+1)
        except HTTPError as error:
            if error.code==401:
                self.expiry=0
            raise RuntimeError(f'ORDS HTTP {error.code}') from None
        if len(raw)>limit:
            raise ValueError('ORDS response exceeds budget')
        return raw

    def auth(self):
        if time.time()>=self.expiry:
            result=json.loads(self.request('POST',self.base+'/oauth/token',
                {'Authorization':'Basic '+self.basic,'Content-Type':'application/x-www-form-urlencoded'},
                b'grant_type=client_credentials',limit=64_000))
            self.token=result['access_token']
            self.expiry=time.time()+max(1,float(result.get('expires_in',300))-60)
        return {'Authorization':'Bearer '+self.token,'Content-Type':'application/json'}

    def exists(self,doc):
        params=urlencode(dict(src=doc['source'],sig_date=doc['sig_date']))
        body=json.loads(self.request('GET',self.url+'?'+params,self.auth()))
        if not isinstance(body.get('items'),list) or len(body['items'])>75 or body.get('hasMore'):
            raise ValueError('Incomplete ORDS read-back')
        for item in body['items']:
            item=item.get('doc',item)
            item=json.loads(item) if isinstance(item,str) else item
            if item.get('Doc_ID')==doc['Doc_ID'] and item.get('source')==doc['source'] and item.get('date')==doc['date']:
                return True
        return False

    def put(self,doc):
        self.request('POST',self.url,self.auth(),encode(doc),limit=64_000)


def database():
    db=sqlite3.connect(HOME/'state.sqlite')
    db.executescript("""
        CREATE TABLE IF NOT EXISTS checkpoint (day TEXT PRIMARY KEY, cursor TEXT, state BLOB);
        CREATE TABLE IF NOT EXISTS queue (
            seq INTEGER PRIMARY KEY, id TEXT UNIQUE, doc BLOB, attempts INTEGER DEFAULT 0,
            next REAL DEFAULT 0, sent INTEGER DEFAULT 0
        );
    """)
    return db


def enqueue(db,docs):
    db.executemany('INSERT OR IGNORE INTO queue (id,doc) VALUES (?,?)',
                   [(doc['Doc_ID'],encode(doc)) for doc in docs])


def deliver(db,publisher,now):
    # An index is usable only after the corresponding snapshot is acknowledged.
    row=db.execute("""SELECT q.seq,q.doc,q.attempts,q.next FROM queue q
        WHERE q.sent=0 AND q.attempts<8 AND q.next<=?
        AND (substr(q.id,-6)<>'|index' OR EXISTS (
            SELECT 1 FROM queue parent WHERE parent.id=substr(q.id,1,length(q.id)-6) AND parent.sent=1))
        ORDER BY q.seq LIMIT 1""",(now,)).fetchone()
    if not row:
        return
    seq,raw,attempts,_=row
    doc=json.loads(raw)
    with db:
        db.execute('UPDATE queue SET attempts=attempts+1,next=? WHERE seq=?',(now+min(1200,30*2**attempts),seq))
    if not attempts or not publisher.exists(doc):
        publisher.put(doc)
    with db:
        db.execute('UPDATE queue SET sent=1 WHERE seq=?',(seq,))
    print(f'Osprey published {doc["Doc_ID"]}',flush=True)


def engine_for(day):
    try:
        lookup=volume_lookup(day)
    except (OSError,ValueError,KeyError,TypeError):
        lookup=None
        print('Osprey RVOL unavailable',flush=True)
    return Engine(read_json(HOME/'sectors.json',96_000),lookup)


def health(day,engine,error,pending):
    tmp=HOME/'health.tmp'
    tmp.write_bytes(encode(dict(date=day,last_cut=clock(engine.last_cut) if engine else '',
                                 last_session=engine.day if engine else None,updated_at=time.time(),
                                 error=error,pending=pending)))
    tmp.replace(HOME/'health.json')


def checkpoint(db,day,cursor,engine,docs=()):
    # Own mode-0700 directory and database. Never import a checkpoint from outside it.
    state={k:v for k,v in vars(engine).items() if k not in ('rvol_lookup','sectors')}
    with db:
        enqueue(db,docs)
        db.execute('INSERT OR REPLACE INTO checkpoint VALUES(?,?,?)',(day,cursor,pickle.dumps(state)))


def run():
    import nse_calendar
    db=database()
    publisher=Publisher()
    engine=None
    active=None
    cursor=''
    while True:
        now=time.time()
        local=datetime.fromtimestamp(now,IST)
        day=local.date().isoformat()
        error=None
        try:
            if nse_calendar.regular_day(day) and '09:15' <= local.strftime('%H:%M') <= '15:32':
                if day!=active:
                    engine=engine_for(day)
                    saved=db.execute('SELECT cursor,state FROM checkpoint WHERE day=?',(day,)).fetchone()
                    cursor=saved[0] if saved else ''
                    if saved:
                        vars(engine).update(pickle.loads(saved[1]))
                    active=day
                cut=next((t for t in CUTS if t>cursor),None)
                if cut:
                    nominal=nominal_time(day,cut)
                    if now>=nominal:
                        try:
                            source,rusty=source_for(day,cut,now)
                        except (OSError,ValueError,KeyError,TypeError) as failure:
                            error=type(failure).__name__
                            if now>=nominal+180:
                                checkpoint(db,day,cut,engine)
                                cursor=cut
                        else:
                            rows=engine.process(source,rusty)
                            docs=documents(day,cut,rows,source,now,now-source['exported_at']>300) if rows and any(rows.values()) else ()
                            checkpoint(db,day,cut,engine,docs)
                            cursor=cut
            deliver(db,publisher,now)
        except (OSError,ValueError,RuntimeError,KeyError,TypeError) as failure:
            error=type(failure).__name__
            if engine is not None and engine.day==day and engine.last_cut and clock(engine.last_cut)>cursor:
                active=None
        pending=db.execute('SELECT count(*) FROM queue WHERE sent=0 AND attempts<8').fetchone()[0]
        health(day,engine,error,pending)
        time.sleep(5 if pending or (active==day and cursor<local.strftime('%H:%M') and cursor!=CUTS[-1]
                                   and '09:15'<=local.strftime('%H:%M')<='15:32') else 30)


def probe(day,last,publish):
    engine=engine_for(day)
    now=time.time()
    docs=None
    for cut in CUTS[:CUTS.index(last)+1]:
        source,rusty=source_for(day,cut,now)
        rows=engine.process(source,rusty)
        if rows is not None:
            docs=documents(day,cut,rows,source,now,True)
    if not docs or docs[0]['cut']!=last:
        raise RuntimeError('No probe result')
    rows=json.loads(gzip.decompress(base64.b64decode(docs[0]['payload'])))
    print(f'Archive probe {day} {last}: {len(rows)} rows, {len(encode(docs[0]))} bytes',flush=True)
    if publish:
        publisher=Publisher()
        for doc in docs:
            if not publisher.exists(doc):
                publisher.put(doc)
            if not publisher.exists(doc):
                raise RuntimeError('Probe read-back unavailable')
        print('Both source IDs verified in ORDS',flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--probe',nargs=2,metavar=('DATE','LAST_CUT'))
    parser.add_argument('--publish-probe',action='store_true')
    args=parser.parse_args()
    if args.probe:
        probe(*args.probe,args.publish_probe)
        return
    with (HOME/'worker.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        run()


if __name__=='__main__':
    main()
