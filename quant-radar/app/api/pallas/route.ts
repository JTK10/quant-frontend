import {NextRequest,NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {requireApiSession} from '@/utils/auth';
import {getTodayIstDate} from '@/utils/backend';
import {foldPallas,PALLAS_DATES,type PallasDocument} from '@/utils/pallas';
export const dynamic='force-dynamic';
let authCache:{token:string;until:number}|undefined;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){
  const denied=await requireApiSession(request);if(denied)return denied;
  const p=request.nextUrl.searchParams, mode=p.get('mode')??'live', date=p.get('date')??getTodayIstDate(),asof=p.get('asof'),symbol=p.get('symbol')??undefined;
  if(!['live','research'].includes(mode)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||
    (asof&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(asof))||(symbol&&!/^[A-Z0-9 &_.-]{1,40}$/.test(symbol)))return json({error:'Invalid session, mode or time'},400);
  let limit=asof?Date.parse(`${date}T${asof.length===5?asof+':00':asof}+05:30`):mode==='research'?Date.parse(`${date}T11:30:00+05:30`):Date.now();
  if(mode==='live')limit=Math.min(limit,Date.now());
  try{
    let docs:PallasDocument[];
    if(mode==='research'){
      if(!PALLAS_DATES.includes(date))return json({error:'No validated research session for this date'},404);
      docs=JSON.parse(await readFile(path.join(process.cwd(),'data','pallas',date+'.json'),'utf8'));
    }else{
      const {PANTHER_CLIENT_ID:id,PANTHER_CLIENT_SECRET:secret,PANTHER_TOKEN_URL:authUrl,PANTHER_SIGNALS_URL:feedUrl}=process.env;
      if(!id||!secret||!authUrl||!feedUrl)throw new Error('Feed configuration unavailable');
      if(!authCache||authCache.until<Date.now()){
        const r=await fetch(authUrl,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!r.ok)throw new Error('Feed authorization unavailable');const data=await r.json();authCache={token:data.access_token,until:Date.now()+Math.max(30,Number(data.expires_in??300)-60)*1000};
      }
      const accessToken=authCache.token;
      docs=[];let url:URL|undefined=new URL(feedUrl),bytes=0;
      url.searchParams.set('src','pallas');url.searchParams.set('sig_date',date.replaceAll('-',''));url.searchParams.set('limit','1000');
      for(let page=0;url&&page<6;page++){
        const r=await fetch(url,{headers:{Authorization:'Bearer '+accessToken},cache:'no-store',signal:AbortSignal.timeout(12000)});
        if(r.status===401)authCache=undefined;if(!r.ok)throw new Error('Feed unavailable');
        const text=await r.text();bytes+=Buffer.byteLength(text);if(bytes>6000000)throw new Error('Feed exceeded bounded budget');
        const data=JSON.parse(text);
        for(const item of data.items??[]){try{docs.push(typeof item.doc==='string'?JSON.parse(item.doc):item.doc??item);}catch{}}
        const next=data.links?.find((l:{rel:string;href:string})=>l.rel==='next')?.href;
        if(data.hasMore&&!next)throw new Error('Incomplete feed page');
        if(next){const candidate=new URL(next,feedUrl);if(candidate.origin!==new URL(feedUrl).origin)throw new Error('Invalid feed page');url=candidate;}else url=undefined;
      }
      if(url)throw new Error('Incomplete feed pages');
    }
    const result=foldPallas(docs,date,limit,symbol);
    if(mode==='research'){result.mode='CAUSAL_RESEARCH';result.stale=false;result.status='Closed-candle replay · original receipt latency unavailable';}
    return json(result);
  }catch{return json({error:'Pallas data unavailable; current signals cannot be confirmed'},503);}
}
