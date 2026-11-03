import {getSharedOrdsToken,invalidateSharedOrdsToken} from './aurumFeed';
import {resultCache} from './resultCache';
import type {LineBoard,LineEvidence,LineRow,LineSession} from '@/app/oi-line-breaks/types';
import {lineKey} from '@/app/oi-line-breaks/types';

type Doc={source:string;sig_date:string;date:string;Doc_ID:string;kind:string;decision_cut:string;
  ts:number;available_at:string;version:number;prior_day?:string;coverage?:string;
  coverage_counts?:{eligible:number;cash:number;ranked:number;wicks_complete:boolean;status:string};
  source_days?:string[];setup?:unknown[];move?:unknown[];evidence?:Record<string,unknown>;recovered?:boolean};
const cached=resultCache<Doc[]>({maxEntries:8,maxBytes:2*1024*1024});

async function sourceDocs(source:string,date:string,ttl:number):Promise<Doc[]>{
  return cached(`${source}|${date}`,ttl,async()=>{
    const endpoint=process.env.PANTHER_SIGNALS_URL;
    if(!endpoint)throw Error('Korat live feed configuration unavailable');
    const url=new URL(endpoint);url.searchParams.set('src',source);url.searchParams.set('sig_date',date.replaceAll('-',''));
    const response=await fetch(url,{headers:{Authorization:'Bearer '+await getSharedOrdsToken()},
      cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(response.status===401)invalidateSharedOrdsToken();
    if(!response.ok||!response.body)throw Error('Korat ORDS feed unavailable');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
      if(bytes>650_000)throw Error('Korat feed exceeded byte budget');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(payload.hasMore||!Array.isArray(payload.items)||payload.items.length>80)
      throw Error('Korat source/date feed incomplete');
    const docs:Doc[]=[];
    for(const item of payload.items){
      const doc=typeof item.doc==='string'?JSON.parse(item.doc):item.doc??item;
      if(!doc||doc.source!==source||String(doc.sig_date)!==date.replaceAll('-','')||doc.date!==date)
        throw Error('Korat source/date isolation failed');
      docs.push(doc);
    }
    return docs;
  });
}

type PackedRow=[number,number,string,'BULL'|'BEAR',number,'CE'|'PE',string,number,number,number,number|null,boolean,boolean|null,boolean|null];
type PackedEvidence=[string,string,number,number,string,number,number];
function unpack(raw:unknown):LineRow{
  if(!Array.isArray(raw)||raw.length!==14||!Number.isInteger(raw[0])||!Number.isInteger(raw[1])||
    typeof raw[2]!=='string'||!['BULL','BEAR'].includes(raw[3])||!Number.isFinite(raw[4])||
    !['CE','PE'].includes(raw[5])||typeof raw[6]!=='string'||typeof raw[11]!=='boolean'||
    ![null,true,false].includes(raw[12])||![null,true,false].includes(raw[13]))throw Error('Invalid Korat row');
  const row=raw as PackedRow;
  return {rank:row[0],direction_rank:row[1],symbol:row[2],direction:row[3],strike:row[4],leg:row[5],
    break_cut:row[6],respected_days:row[7],trapped_buildup_days:row[8],fresh_oi_share_pct:row[9],
    move_pct:row[10],qualified:row[11],pdh_broken:row[12],pdl_broken:row[13]};
}

function validTime(doc:Doc,date:string,now:number){
  const instant=Date.parse(`${date}T${doc.decision_cut}:00+05:30`);
  const available=Date.parse(doc.available_at);
  return /^\d{2}:\d{2}$/.test(doc.decision_cut)&&Number.isFinite(instant)&&instant<=now+2000&&
    Number.isFinite(doc.ts)&&doc.ts*1000<=now+2000&&Number.isFinite(available)&&available<=now+2000;
}

export async function readLiveKorat(date:string,cutRequest:string,sessions:LineSession[],now=Date.now(),after?:string){
  const indexes=await sourceDocs('oi_line_breaks_index',date,20_000);
  const good=indexes.filter(doc=>doc.kind==='INDEX'&&doc.version===1&&
    doc.Doc_ID===`oi-line-breaks|v1|${date.replaceAll('-','')}|INDEX|${doc.decision_cut.replace(':','')}`&&
    validTime(doc,date,now)).sort((a,b)=>a.decision_cut.localeCompare(b.decision_cut));
  if(good.length>75)throw Error('Korat index cut budget exceeded');
  const cuts=[...new Set(good.map(doc=>doc.decision_cut))];
  const chosen=cutRequest==='latest'?good.at(-1):good.find(doc=>doc.decision_cut===cutRequest);
  if(!chosen){
    if(cutRequest!=='latest'&&cuts.length)throw Error('Requested Korat cut is unavailable');
    return {source:'oi-line-breaks',mode:'live',status:'PENDING',date,cut:'',cuts,prior_day:'',
      coverage:'pending',sessions,setup:[],move:[],evidence:{},asof:null,stale:false};
  }
  const currentTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now));
  const market=currentTime>='09:20'&&currentTime<='15:35';
  const stale=market&&now-Date.parse(`${date}T${chosen.decision_cut}:00+05:30`)>11*60*1000;
  if(cutRequest==='latest'&&after===chosen.decision_cut)
    return {source:'oi-line-breaks',date,cut:chosen.decision_cut,cuts,unchanged:true,
      status:stale?'STALE':chosen.coverage_counts?.status??'READY',stale};
  const source='oi_line_breaks_'+chosen.decision_cut.replace(':','');
  const snapshots=await sourceDocs(source,date,cutRequest==='latest'?20_000:3_600_000);
  const doc=snapshots.find(item=>item.kind==='SNAPSHOT'&&item.version===1&&
    item.decision_cut===chosen.decision_cut&&validTime(item,date,now)&&
    item.Doc_ID===`oi-line-breaks|v1|${date.replaceAll('-','')}|SNAPSHOT|${item.decision_cut.replace(':','')}`);
  if(!doc||!Array.isArray(doc.setup)||!Array.isArray(doc.move)||!doc.evidence||
    doc.setup.length>400||doc.move.length>400||doc.prior_day!==chosen.prior_day)
    throw Error('Korat published snapshot unavailable or inconsistent');
  const setup=doc.setup.map(unpack),move=doc.move.map(unpack);
  const evidence:Record<string,LineEvidence>={};
  for(const row of [...setup,...move]){
    const raw=doc.evidence[lineKey(row)];
    if(!Array.isArray(raw)||raw.length!==7)throw Error('Korat exact-strike evidence missing');
    const item=raw as PackedEvidence;
    evidence[lineKey(row)]={respected_dates:item[0],trapped_dates:item[1],fresh_oi_added:item[2],
      net_oi_change:item[3],prior_day_evidence:item[4],first_oi:item[5],last_oi:item[6]};
  }
  return {source:'oi-line-breaks',mode:'live',status:stale?'STALE':doc.coverage_counts?.status??'READY',
    date,cut:chosen.decision_cut,cuts,prior_day:doc.prior_day??'',coverage:doc.coverage??'all_nearby_strikes',
    sessions,setup,move,evidence,asof:doc.available_at,stale,coverage_counts:doc.coverage_counts,recovered:doc.recovered===true};
}
