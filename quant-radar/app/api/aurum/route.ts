import {NextRequest,NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {requireApiSession} from '@/utils/auth';
import {istSessionDate} from '@/utils/sessionPolling';
import {foldAurum,readAurumFeed} from '@/utils/aurumFeed';
import manifest from '@/data/aurum/manifest.json';

export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=30;
const json=(value:unknown,status=200,cache='private, no-store')=>NextResponse.json(value,{status,headers:{'Cache-Control':cache}});
export async function GET(request:NextRequest){
  const denied=await requireApiSession(request);if(denied)return denied;
  const today=istSessionDate(),date=request.nextUrl.searchParams.get('date')??today;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>today)return json({error:'Invalid Aurum session'},400);
  try{
    if(manifest.dates.includes(date)){
      const raw=await readFile(path.join(process.cwd(),'data','aurum',date+'.json'),'utf8');
      if(Buffer.byteLength(raw)>128*1024)throw Error('Aurum history size exceeded');
      const saved=JSON.parse(raw);
      if(saved.date!==date||saved.source!=='aurum'||saved.mode!=='historical')throw Error('Aurum history mismatch');
      return json({...saved,state:saved.status,message:saved.status==='UNAVAILABLE'?'No validated option-chain history for this session':'Historical Aurum replay · entries were not issued live'},200,'private, max-age=3600, stale-while-revalidate=86400');
    }
    const docs=await readAurumFeed(date,today);
    return json(foldAurum(docs,date,today,manifest.dates),200,date<today?'private, max-age=3600, stale-while-revalidate=86400':'private, max-age=60, stale-while-revalidate=60');
  }catch{return json({error:'Aurum feed unavailable; current results cannot be confirmed'},503);}
}
