import {resultCache} from './resultCache';
import type {AurumResponse, AurumSignal} from '@/app/aurum/types';

type Doc = Partial<AurumResponse> & {source?:string; sig_date?:string; kind?:string; Doc_ID?:string; ts?:number; checked_at?:string; error?:string; last_cut?:string};
let auth:{token:string;until:number}|undefined;
let authPending:Promise<string>|undefined;
const reads=resultCache<Doc[]>({maxEntries:16,maxBytes:2*1024*1024});

async function token() {
  if(auth && auth.until>Date.now())return auth.token;
  if(authPending)return authPending;
  authPending=(async()=>{
    const {PANTHER_CLIENT_ID:id,PANTHER_CLIENT_SECRET:secret,PANTHER_TOKEN_URL:url}=process.env;
    if(!id||!secret||!url)throw Error('Aurum feed configuration unavailable');
    const r=await fetch(url,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw Error('Aurum feed authorization unavailable');
    const d=await r.json(),seconds=Number(d.expires_in??300);
    if(typeof d.access_token!=='string'||!d.access_token)throw Error('Invalid Aurum authorization');
    auth={token:d.access_token,until:Date.now()+Math.max(0,(Number.isFinite(seconds)?seconds:300)-60)*1000};
    return auth.token;
  })();
  try{return await authPending;}finally{authPending=undefined;}
}

export async function readAurumFeed(date:string,today:string):Promise<Doc[]> {
  return reads(date,date===today?60000:3600000,async()=>{
    const endpoint=process.env.PANTHER_SIGNALS_URL;
    if(!endpoint)throw Error('Aurum feed configuration unavailable');
    const url=new URL(endpoint);url.searchParams.set('src','aurum');url.searchParams.set('sig_date',date.replaceAll('-',''));
    const access=await token();
    const response=await fetch(url,{headers:{Authorization:'Bearer '+access},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(response.status===401)auth=undefined;
    if(!response.ok||!response.body)throw Error('Aurum feed unavailable');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024)throw Error('Aurum feed exceeded one-megabyte budget');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!Array.isArray(payload.items)||payload.items.length>300||payload.hasMore)throw Error('Incomplete or oversized Aurum feed');
    const docs:Doc[]=[];
    for(const row of payload.items){
      let doc;try{doc=typeof row.doc==='string'?JSON.parse(row.doc):row.doc??row;}catch{throw Error('Malformed Aurum document');}
      if(doc?.source==='aurum'&&String(doc.sig_date)===date.replaceAll('-','')&&doc.date===date)docs.push(doc);
    }
    return docs;
  });
}

const time=(d:Doc)=>Number.isFinite(d.ts)?Number(d.ts)*1000:Date.parse(d.checked_at??d.asof??'');
export function foldAurum(docs:Doc[],date:string,today:string,available_dates:string[],now=Date.now()):AurumResponse {
  const dated=docs.filter(d=>d.source==='aurum'&&d.date===date&&String(d.sig_date)===date.replaceAll('-','')&&Number.isFinite(time(d))&&time(d)<=now+2000).sort((a,b)=>time(a)-time(b));
  const engine=dated.some(d=>d.engine==='aurum-v1.1')?'aurum-v1.1':'aurum-v1';
  const valid=dated.filter(d=>(d.engine??'aurum-v1')===engine);
  const snapshots=valid.filter(d=>d.kind==='SNAPSHOT'&&Array.isArray(d.signals));
  const board=snapshots.at(-1),health=valid.filter(d=>d.kind==='HEALTH').at(-1);
  const signals:AurumSignal[]=[];const seen=new Set<string>();
  // Health never replaces a successful board. Immutable signal IDs prevent a
  // later compact snapshot or uncertain publication from erasing prior rows.
  for(const snapshot of snapshots)for(const row of snapshot.signals??[]){
    if(!row||typeof row.id!=='string'||!row.id.startsWith(engine+'|'+date+'|')||seen.has(row.id))continue;
    if(signals.length>=250)throw Error('Aurum signal budget exceeded');
    if(typeof row.symbol!=='string'||!/^[A-Z0-9 &_.-]{1,40}$/.test(row.symbol)||!['BULL','BEAR'].includes(row.side)||typeof row.signal_time!=='string'||!/^\d{2}:\d{2}$/.test(row.signal_time)||row.signal_time<'09:35'||row.signal_time>(engine==='aurum-v1.1'?'11:30':'10:25')||Number(row.signal_time.slice(3))%5!==0)throw Error('Invalid Aurum signal');
    const signalAt=Date.parse(`${date}T${row.signal_time}:00+05:30`);
    if(!Number.isFinite(signalAt))throw Error('Invalid Aurum signal time');
    if(signalAt>now)continue;
    const scalar=(n:unknown)=>n===null||(typeof n==='number'&&Number.isFinite(n));
    if(!['entry','reference_price','ce_pct','pe_pct','oi_bias','bar_rvol','cum_rvol'].every(k=>scalar(row[k as keyof AurumSignal]))||
       (row.view!==null&&(typeof row.view!=='string'||row.view.length>100))||
       ![null,true,false].includes(row.pullback_confirmed))throw Error('Invalid Aurum signal fields');
    if(row.entry_time!=null&&row.entry_time!==row.signal_time)throw Error('Invalid Aurum entry boundary');
    seen.add(row.id);signals.push({id:row.id,symbol:row.symbol,side:row.side,signal_time:row.signal_time,
      entry_time:row.entry_time??null,entry:row.entry,reference_price:row.reference_price,ce_pct:row.ce_pct,
      pe_pct:row.pe_pct,oi_bias:row.oi_bias,view:row.view,bar_rvol:row.bar_rvol,cum_rvol:row.cum_rvol,
      pullback_confirmed:row.pullback_confirmed,rusty_status:typeof row.rusty_status==='string'?row.rusty_status:undefined,
      rusty_cut:row.rusty_cut===row.signal_time?row.rusty_cut:null,recovered:row.recovered===true,
      issued_at:typeof row.issued_at==='string'&&Number.isFinite(Date.parse(row.issued_at))?row.issued_at:undefined});
  }
  signals.sort((a,b)=>a.signal_time.localeCompare(b.signal_time)||a.symbol.localeCompare(b.symbol));
  const latest=health&&(!board||time(health)>=time(board))?health:board;
  const stale=date===today&&(!latest||(latest.status!=='CLOSED'&&now-time(latest)>20*60*1000)||['ERROR','DEGRADED'].includes(latest.status??'')||!!latest.stale);
  const state=latest?.status??'PENDING';
  const message=latest?.error??(state==='CLOSED'?'Morning scan closed · saved signals remain available':state==='ERROR'?'Input unavailable · last successful signals retained':state==='DEGRADED'?'Incomplete input coverage · available signals retained':state==='PENDING'?'Waiting for completed cash and option-chain captures':state==='READY'?'Confirmed Aurum signals · completed candles':state);
  return {source:'aurum',date,asof:board?.asof??latest?.asof??null,state,status:state,message,mode:date<today?'historical':'live',stale,engine,signals,available_dates} as AurumResponse;
}
