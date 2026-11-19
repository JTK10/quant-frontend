import {NextRequest, NextResponse} from 'next/server';
import {gunzipSync} from 'node:zlib';
import {requireApiSession} from '@/utils/auth';
import {getSharedOrdsToken, invalidateSharedOrdsToken} from '@/utils/aurumFeed';
import {resultCache} from '@/utils/resultCache';
import {istSessionDate} from '@/utils/sessionPolling';
import {MAX_BYTES, ROW_SCHEMA, projectBoard, selectSnapshotRows, validDate, validCut, type OspreyBoard} from '@/app/osprey/model';
import {ospreySetupLevels} from '@/utils/ospreySetupLevels';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;
const indexCache = resultCache<string[]>({maxEntries:16,maxBytes:128*1024});
const snapshotCache = resultCache<OspreyBoard>({maxEntries:16,maxBytes:4*MAX_BYTES});
const noStore = {'Cache-Control':'private, no-store'};

async function readDocuments(date:string, source:string, maxItems:number, maxBytes:number):Promise<(Record<string,unknown>&{cut:string})[]> {
  const endpoint=process.env.PANTHER_SIGNALS_URL;
  if (!endpoint) throw Error('Osprey origin unavailable');
  const url=new URL(endpoint);
  const day=date.replaceAll('-','');
  url.searchParams.set('src',source);
  url.searchParams.set('sig_date',day);
  const token=await getSharedOrdsToken();
  const response=await fetch(url,{
    headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(6500),redirect:'error',
  });
  if (response.status===401) invalidateSharedOrdsToken();
  if (!response.ok || !response.body) throw Error('Osprey origin unavailable');
  const reader=response.body.getReader();
  const chunks:Uint8Array[]=[];
  let bytes=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if (done) break;
      bytes+=value.byteLength;
      if (bytes>maxBytes) throw Error('Osprey response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(body.items) || body.items.length>maxItems || body.hasMore ||
      body.links?.some((link:{rel?:string})=>link.rel==='next')) throw Error('Invalid Osprey origin response');
  const now=Date.now();
  return body.items.map((item:{doc?:unknown})=>{
    const doc=typeof item?.doc==='string'?JSON.parse(item.doc):item?.doc??item;
    if (!doc || doc.source!==source || doc.cap!=='OSPREY' || doc.date!==date || String(doc.sig_date)!==day ||
        !validCut(doc.cut) || typeof doc.ts!=='number' || !Number.isFinite(doc.ts) || doc.ts*1000>now+2000 ||
        Date.parse(date+'T'+doc.cut+':00+05:30')>Math.min(now,doc.ts*1000)) throw Error('Invalid Osprey publication');
    return doc as Record<string,unknown> & {cut:string};
  });
}
const unavailable=(date:string):OspreyBoard=>({date,source:'osprey',cut:'',cuts:[],rows:[],available:false});

async function index(date:string):Promise<string[]> {
  const docs=await readDocuments(date,'osprey',76,128*1024);
  const cuts=[...new Set<string>(docs.map((doc:Record<string,unknown>&{cut:string})=>{
    if (doc.kind!=='INDEX') throw Error('Invalid Osprey index');
    return doc.cut;
  }))].sort();
  if (cuts.length!==docs.length) throw Error('Duplicate Osprey index');
  return cuts;
}

async function snapshot(date:string,cut:string) {
  const docs=await readDocuments(date,'osprey-'+cut.replace(':',''),2,224*1024);
  if (!docs.length) return unavailable(date);
  const doc=docs[0];
  const rows=selectSnapshotRows(docs.map(d=>{
    if (d.kind!=='SNAPSHOT' || d.cut!==cut) throw Error('Invalid Osprey snapshot');
    if (d.encoding!=='gzip+base64' || typeof d.payload!=='string' || d.payload.length>96*1024 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(d.payload)) throw Error('Invalid Osprey snapshot payload');
    return {id:d.Doc_ID,rows:JSON.parse(gunzipSync(Buffer.from(d.payload,'base64'),{maxOutputLength:512*1024}).toString('utf8'))};
  }));
  return projectBoard({...doc,rows,source:'osprey',available:true,cuts:[cut]},date,cut);
}

export async function GET(request: NextRequest) {
  const denied=await requireApiSession(request);
  if (denied) return denied;
  const today=istSessionDate();
  const date=request.nextUrl.searchParams.get('date')??today;
  const selected=request.nextUrl.searchParams.get('cut');
  if (!validDate(date)||date>today||(selected!==null&&!validCut(selected))) {
    return NextResponse.json({error:'Invalid Osprey session or cut'},{status:400,headers:noStore});
  }
  try {
    const historical=date!==today||selected!==null;
    const cuts=selected ? [] : await indexCache(date,historical?300000:45000,()=>index(date));
    const cut=selected??cuts.at(-1);
    if (!cut) return NextResponse.json(unavailable(date),{headers:noStore});
    const [board,setupLevels]=await Promise.all([snapshotCache(ROW_SCHEMA+'|'+date+'|'+cut,3600000,async()=>{
      const loaded=await snapshot(date,cut);
      if (!loaded.available) throw Error('Osprey snapshot unavailable');
      return loaded;
    }),ospreySetupLevels(date).catch(()=>({} as Awaited<ReturnType<typeof ospreySetupLevels>>))]);
    // Optional compact context piggybacks on the existing read; no per-stock API fan-out.
    const payload=JSON.stringify({...board,rows:board.rows.map(r=>r.state==='Confirmed'&&setupLevels[r.symbol]?{...r,setup_oi:setupLevels[r.symbol]}:r),cuts:cuts.length?cuts:board.cuts});
    if (Buffer.byteLength(payload)>MAX_BYTES) throw Error('Osprey browser response exceeded size budget');
    return new NextResponse(payload,{headers:{
      'Content-Type':'application/json',
      'Cache-Control':historical?'private, max-age=3600, stale-while-revalidate=86400':'private, max-age=45',
    }});
  } catch {
    return NextResponse.json({error:'Osprey feed unavailable'},{status:503,headers:noStore});
  }
}
