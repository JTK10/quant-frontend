import {NextRequest,NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {requireApiSession} from '@/utils/auth';
import {getTodayIstDate} from '@/utils/backend';
import {foldPallas,PALLAS_DATES,type PallasDocument} from '@/utils/pallas';
import {readPallasFeed,newPallasReadBudget,pallasInflight} from '@/utils/pallasFeed';
import {pallasAsOf} from '@/utils/pallasTime';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
let authCache:{token:string;until:number}|undefined;
const shareRead=pallasInflight<PallasDocument[]>();
const shareAuth=pallasInflight<void>();
const json=(body:unknown,status=200,cacheHeaders?:Record<string,string>)=>NextResponse.json(body,{status,headers:cacheHeaders??{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest){
  const denied=await requireApiSession(request);if(denied)return denied;
  const p=request.nextUrl.searchParams, mode=p.get('mode')??'live', date=p.get('date')??getTodayIstDate(),asof=p.get('asof'),symbol=p.get('symbol')??undefined;
  if(!['live','history','research'].includes(mode)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||
    (mode==='history'&&date>getTodayIstDate())||
    (asof&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(asof))||(symbol&&!/^[A-Z0-9 &_.-]{1,40}$/.test(symbol)))return json({error:'Invalid session, mode or time'},400);
  const limit=pallasAsOf(mode,date,asof);
  try{
    let docs:PallasDocument[];
    if(mode==='research'){
      if(!PALLAS_DATES.includes(date))return json({error:'No validated research session for this date'},404);
      docs=JSON.parse(await readFile(path.join(process.cwd(),'data','pallas',date+'.json'),'utf8'));
    }else{
      const {PANTHER_CLIENT_ID:id,PANTHER_CLIENT_SECRET:secret,PANTHER_TOKEN_URL:authUrl,PANTHER_SIGNALS_URL:feedUrl}=process.env;
      if(!id||!secret||!authUrl||!feedUrl)throw new Error('Feed configuration unavailable');
      if(!authCache||authCache.until<Date.now()){
        await shareAuth('token',async()=>{
        const r=await fetch(authUrl,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!r.ok)throw new Error('Feed authorization unavailable');const data=await r.json();authCache={token:data.access_token,until:Date.now()+Math.max(30,Number(data.expires_in??300)-60)*1000};
        });
      }
      const accessToken=authCache?.token;if(!accessToken)throw new Error('Feed authorization unavailable');
      docs=await shareRead(`${date}|${symbol??''}`,async()=>{
        const collected:PallasDocument[]=[],budget=newPallasReadBudget(),deadline=AbortSignal.timeout(40000);
        let url:URL|undefined=new URL(feedUrl);
        const visited=new Set<string>();
        url.searchParams.set('src','pallas');url.searchParams.set('sig_date',date.replaceAll('-',''));
        for(let page=0;url&&page<6;page++){
          if(visited.has(url.href))throw new Error('Repeated feed page');visited.add(url.href);
          const r=await fetch(url,{headers:{Authorization:'Bearer '+accessToken},cache:'no-store',signal:deadline});
          if(r.status===401)authCache=undefined;if(!r.ok)throw new Error('Feed unavailable');
          const {documents,next}=await readPallasFeed(r,date,symbol,budget);collected.push(...documents);
          if(next){const candidate=new URL(next,feedUrl);if(candidate.origin!==new URL(feedUrl).origin||candidate.pathname!==new URL(feedUrl).pathname)throw new Error('Invalid feed page');url=candidate;}else url=undefined;
        }
        if(url)throw new Error('Incomplete feed pages');
        return collected;
      });
    }
    if(mode==='history'&&!docs.length)return json({error:`No recorded Pallas data for ${date}`},404);
    const result=foldPallas(docs,date,limit,symbol);
    if(mode==='research'){result.mode='CAUSAL_RESEARCH';result.stale=false;result.status='Closed-candle replay · original receipt latency unavailable';for(const s of result.signals)s.OI_Age_Seconds=null;}
    if(mode==='history'){result.mode='HISTORICAL';result.stale=false;result.tick_connected=undefined;result.status='Recorded session · original alerts and AI scores';}
    const cacheHeader = (mode==='history'||mode==='research')
      ? {'Cache-Control':'private, max-age=3600, stale-while-revalidate=86400'}
      : {'Cache-Control':'private, max-age=15, stale-while-revalidate=30'};
    return json(result, 200, cacheHeader);
  }catch{return json({error:'Pallas data unavailable; current signals cannot be confirmed'},503);}
}
