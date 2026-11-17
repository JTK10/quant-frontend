import {NextRequest,NextResponse} from 'next/server';
import {requireApiSession} from '@/utils/auth';
import {getTodayIstDate} from '@/utils/backend';
import type {FlowData,FlowPoint} from '@/app/charts/flowBand';
export const dynamic='force-dynamic';
export const maxDuration=30;
const SOURCE='chart_flow_v1';
let token={value:'',until:0},authPending:Promise<string>|undefined;
type Session={bySymbol:Map<string,FlowPoint[]>;lastCut:string|null};
const cache=new Map<string,{until:number;data:Session}>(),pending=new Map<string,Promise<Session>>();
async function accessToken(){
  if(token.until>Date.now())return token.value;
  if(authPending)return authPending;
  authPending=(async()=>{
    const {PANTHER_CLIENT_ID:id,PANTHER_CLIENT_SECRET:secret,PANTHER_TOKEN_URL:url}=process.env;
    if(!id||!secret||!url)throw new Error('Feed not configured');
    const r=await fetch(url,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('Feed authentication failed');const data=await r.json();
    if(typeof data.access_token!=='string'||!data.access_token)throw new Error('Missing feed token');
    token={value:data.access_token,until:Date.now()+Math.max(0,Number(data.expires_in??300)-60)*1000};return token.value;
  })();
  try{return await authPending;}finally{authPending=undefined;}
}
async function readSession(date:string):Promise<Session>{
  const saved=cache.get(date);if(saved&&saved.until>Date.now())return saved.data;
  if(pending.has(date))return pending.get(date)!;
  const promise=(async()=>{
    const endpoint=process.env.PANTHER_SIGNALS_URL;if(!endpoint)throw new Error('Feed not configured');
    const url=new URL(endpoint);url.searchParams.set('src',SOURCE);url.searchParams.set('sig_date',date.replaceAll('-',''));
    const r=await fetch(url,{headers:{Authorization:'Bearer '+await accessToken()},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(r.status===401)token={value:'',until:0};if(!r.ok||!r.body)throw new Error('Feed unavailable');
    const reader=r.body.getReader(),chunks:Uint8Array[]=[];let total=0;
    try{while(true){const next=await reader.read();if(next.done)break;total+=next.value.length;if(total>1_000_000)throw new Error('Flow byte budget exceeded');chunks.push(next.value);}}finally{await reader.cancel();}
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(payload.hasMore||!Array.isArray(payload.items)||payload.items.length>80)throw new Error('Incomplete flow feed');
    const cuts=new Map<string,{available:number;rows:unknown[][]}>();
    for(const item of payload.items){
      const doc=typeof item.doc==='string'?JSON.parse(item.doc):item.doc??item;
      if(doc.source!==SOURCE||doc.date!==date||String(doc.sig_date)!==date.replaceAll('-','')||doc.version!=='chart-flow-v1'||!/^\d{2}:\d{2}$/.test(doc.cut)||doc.cut<'09:20'||doc.cut>'15:30'||!Array.isArray(doc.rows)||doc.rows.length>400)throw new Error('Invalid flow document');
      const nominal=Date.parse(date+'T'+doc.cut+':00+05:30')/1000;
      if(!Number.isFinite(doc.available_at)||doc.available_at<nominal)throw new Error('Invalid flow availability');
      if(!cuts.has(doc.cut)||cuts.get(doc.cut)!.available<doc.available_at)cuts.set(doc.cut,{available:doc.available_at,rows:doc.rows});
    }
    const bySymbol=new Map<string,FlowPoint[]>();
    for(const [cut,doc] of [...cuts].sort(([a],[b])=>a.localeCompare(b))){
      const seen=new Set<string>();
      for(const row of doc.rows){
        const [symbol,value]=row;
        if(typeof symbol!=='string'||!/^[A-Z0-9 &._-]{1,30}$/.test(symbol)||seen.has(symbol)||(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1)))throw new Error('Invalid flow row');
        seen.add(symbol);const points=bySymbol.get(symbol)??[];
        points.push({time:Date.parse(date+'T'+cut+':00+05:30')/1000,available:doc.available,value:value as number|null});bySymbol.set(symbol,points);
      }
    }
    const data={bySymbol,lastCut:[...cuts.keys()].sort().at(-1)??null};
    cache.delete(date);cache.set(date,{until:Date.now()+(date===getTodayIstDate()?300000:3600000),data});if(cache.size>16)cache.delete(cache.keys().next().value!);
    return data;
  })();pending.set(date,promise);
  try{return await promise;}finally{pending.delete(date);}
}
export async function GET(request:NextRequest){
  const denied=await requireApiSession(request);if(denied)return denied;
  const symbol=(request.nextUrl.searchParams.get('symbol')??'').toUpperCase(),date=request.nextUrl.searchParams.get('date')??getTodayIstDate();
  if(!/^[A-Z0-9 &._-]{1,30}$/.test(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>getTodayIstDate())return NextResponse.json({error:'Invalid symbol or date'},{status:400,headers:{'Cache-Control':'private, no-store'}});
  try{
    const session=await readSession(date),points=session.bySymbol.get(symbol)??[];
    const last=points.filter(p=>p.value!==null).at(-1),now=Date.now()/1000;
    const ist=new Date(Date.now()+19800000).toISOString().slice(11,16),market=date===getTodayIstDate()&&ist>='09:20'&&ist<='15:35';
    const data:FlowData={symbol,date,points,lastCut:last?new Date((last.time+19800)*1000).toISOString().slice(11,16):null,stale:Boolean(market&&(!last||now-last.available>900))};
    return NextResponse.json(data,{headers:{'Cache-Control':date===getTodayIstDate()?'private, max-age=300':'private, max-age=3600'}});
  }catch{return NextResponse.json({error:'Flow feed unavailable'},{status:503,headers:{'Cache-Control':'private, no-store'}});}
}
