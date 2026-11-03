import {NextRequest,NextResponse} from 'next/server';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {requireApiSession} from '@/utils/auth';
import {resultCache} from '@/utils/resultCache';
import manifest from '@/data/oi-line-breaks/manifest.json';
import {istSessionDate} from '@/utils/sessionPolling';
import {koratSessions} from '@/utils/oiLineDates';
import {readLiveKorat} from '@/utils/oiLineLive';
import type {LineBoard,LineEvidence,LineRow} from '@/app/oi-line-breaks/types';
import {lineKey} from '@/app/oi-line-breaks/types';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;

type PackedRow=[number,number,string,'BULL'|'BEAR',number,'CE'|'PE',string,number,number,number,number|null,boolean,boolean,boolean];
type PackedEvidence=[string,string,number,number,string,number,number];
type Archive={version:number;date:string;prior_day:string;coverage:string;setup:Record<string,PackedRow[]>;move:Record<string,PackedRow[]>;evidence:Record<string,PackedEvidence>};
const archives=resultCache<Archive>({maxEntries:2,maxBytes:20*1024*1024});
const reply=(body:unknown,status=200,live=false)=>NextResponse.json(body,{status,headers:{'Cache-Control':status===200?(live?'private, max-age=30, stale-while-revalidate=30':'private, max-age=3600, stale-while-revalidate=86400'):'private, no-store'}});

async function readArchive(date:string):Promise<Archive>{
  return archives(date,3600000,async()=>{
    const file=path.join(process.cwd(),'data','oi-line-breaks',`${date}.json.gz`);
    const compressed=await readFile(file);
    if(compressed.byteLength>1_000_000)throw Error('Archive size exceeded');
    const raw=gunzipSync(compressed,{maxOutputLength:15*1024*1024});
    const archive=JSON.parse(raw.toString('utf8')) as Archive;
    if(archive.version!==1||archive.date!==date||!archive.setup||!archive.move||!archive.evidence||
      Object.keys(archive.setup).length>75||Object.keys(archive.move).length>75)throw Error('Archive schema mismatch');
    return archive;
  });
}

function unpack(row:PackedRow):LineRow{
  if(!Array.isArray(row)||row.length!==14||typeof row[2]!=='string'||!['BULL','BEAR'].includes(row[3])||
    !['CE','PE'].includes(row[5])||!Number.isFinite(row[4]))throw Error('Invalid ranked row');
  return {rank:row[0],direction_rank:row[1],symbol:row[2],direction:row[3],strike:row[4],leg:row[5],
    break_cut:row[6],respected_days:row[7],trapped_buildup_days:row[8],fresh_oi_share_pct:row[9],
    move_pct:row[10],qualified:row[11],pdh_broken:row[12],pdl_broken:row[13]};
}

export async function GET(request:NextRequest){
  const denied=await requireApiSession(request);if(denied)return denied;
  const today=istSessionDate();
  const sessions=koratSessions(today);
  const date=request.nextUrl.searchParams.get('date')??today;
  const session=sessions.find(item=>item.date===date);
  if(!session)return reply({error:'No validated OI line board for this session'},404);
  const requestedCut=request.nextUrl.searchParams.get('cut')??'latest';
  if(requestedCut!=='latest'&&!/^\d{2}:\d{2}$/.test(requestedCut))return reply({error:'Invalid Korat cut'},400);
  try{
    if(!manifest.sessions.some(item=>item.date===date)){
      const after=request.nextUrl.searchParams.get('after')??undefined;
      if(after&&!/^\d{2}:\d{2}$/.test(after))return reply({error:'Invalid Korat cursor'},400);
      const live=await readLiveKorat(session.date,requestedCut,sessions,Date.now(),after);
      return reply({...live,mode:date===today?'live':'historical'},200,date===today);
    }
    const archive=await readArchive(session.date);
    const cuts=Object.keys(archive.setup).sort();
    const cut=requestedCut==='latest'?cuts.at(-1):requestedCut;
    if(!cut||!/^\d{2}:\d{2}$/.test(cut)||!archive.setup[cut]||!archive.move[cut])
      return reply({error:'No completed five-minute board at this cut'},400);
    const setup=archive.setup[cut].map(unpack),move=archive.move[cut].map(unpack);
    if(setup.length>400||move.length>400)throw Error('Board row budget exceeded');
    const evidence:Record<string,LineEvidence>={};
    for(const row of [...setup,...move]){
      const identity=lineKey(row),saved=archive.evidence[identity];
      if(!saved||saved.length!==7)throw Error('Missing exact-strike evidence');
      evidence[identity]={respected_dates:saved[0],trapped_dates:saved[1],fresh_oi_added:saved[2],
        net_oi_change:saved[3],prior_day_evidence:saved[4],first_oi:saved[5],last_oi:saved[6]};
    }
    const board:LineBoard={source:'oi-line-breaks',mode:'historical',status:'READY',date:session.date,cut,cuts,prior_day:archive.prior_day,
      coverage:archive.coverage,sessions,setup,move,evidence};
    return reply(board);
  }catch{return reply({error:'Saved OI line board could not be read'},503);}
}
