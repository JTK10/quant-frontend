import {NextRequest,NextResponse} from 'next/server';
import {requireApiSession} from '@/utils/auth';
import {istSessionDate} from '@/utils/sessionPolling';
import members from '@/app/rusty/sectors.json';
import industryFallback from './industryFallback.json';
import sectorOverrides from '../sectorOverrides.json';
import baseline from '../baselinePrepared.json';
import template from '../workspaceTemplate';
import runtime from '../workspaceRuntime';
const towerMembers: Record<string,string[]> = {...members};
const aliases: Record<string,string> = {
 Healthcare: 'PHARMA',
 'Automobile and Auto Components': 'AUTO',
 'Information Technology': 'IT',
 'Financial Services': 'FIN SERVICE',
};
function addMembers(sector: string, symbols: string[]) {
 towerMembers[sector] = [...new Set([...(towerMembers[sector] || []), ...symbols])];
}
for (const [sector, symbols] of Object.entries(industryFallback)) {
 addMembers(aliases[sector] || sector, symbols);
}
for (const [symbol, sector] of Object.entries(sectorOverrides)) {
 for (const name of Object.keys(towerMembers)) {
  towerMembers[name] = towerMembers[name].filter(member => member !== symbol);
  if (!towerMembers[name].length) delete towerMembers[name];
 }
 addMembers(sector, [symbol]);
}
addMembers('PVT BANK', ['CUB', 'KARURVYSYA', 'UJJIVANSFB']);
addMembers('PSU BANK', ['MAHABANK']);
addMembers('BANK', [...(towerMembers['PVT BANK'] || []), ...(towerMembers['PSU BANK'] || [])]);
addMembers('FIN SERVICE', towerMembers['BANK']);
export const dynamic='force-dynamic';
const htmlCache=new Map<string,string>();
const responseHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'};
export async function GET(request:NextRequest){
 const denied=await requireApiSession(request);if(denied)return denied;
 const date=request.nextUrl.searchParams.get('date')||istSessionDate();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return new NextResponse('Invalid date',{status:400});
 const cached=htmlCache.get(date);if(cached)return new NextResponse(cached,{headers:responseHeaders});
 const days=baseline as Record<string,Record<string,Record<string,number[]>>>;
 const earlier=Object.keys(days).filter(d=>d<date).sort();
 const savedHistory=days[earlier.at(-1)||'']||{};
 // Saved sector averages used the old members; do not compare changed groups
 // with those aggregates until a baseline with the new membership is built.
 const changedSectors=new Set<string>(Object.values(sectorOverrides));
 const history=Object.fromEntries(Object.entries(savedHistory).map(([cut,values])=>[
  cut,Object.fromEntries(Object.entries(values).filter(([key])=>!changedSectors.has(key.split('|')[0])))
 ]));
 const fields=['sector','symbol','direction','classification','ce_pct','pe_pct','move_pct','price','oi_bias','pdh_pdl_broken','pdh_pdl_break_time','rusty_level_source','ob_state','ob_broken_time','ob_retest_breakout_time'];
 const safe=(v:unknown)=>JSON.stringify(v).replace(/</g,'\\u003c');
 const payload=`const META=${safe({date,fields,dates:earlier,baselineThrough:earlier.at(-1)||'none'})};const MEMBERS=${safe(towerMembers)};const BASELINE=${safe(history)};\n${runtime}`;
 const html=template.replace('/*__PAYLOAD__*/',()=>payload);htmlCache.set(date,html);while(htmlCache.size>4)htmlCache.delete(htmlCache.keys().next().value!);
 return new NextResponse(html,{headers:responseHeaders});
}
