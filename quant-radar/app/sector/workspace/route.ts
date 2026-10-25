import {NextRequest,NextResponse} from 'next/server';
import {requireApiSession} from '@/utils/auth';
import {istSessionDate} from '@/utils/sessionPolling';
import members from '@/app/rusty/sectors.json';
import baseline from '../baseline.json';
import template from '../workspaceTemplate';
import runtime from '../workspaceRuntime';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const denied=await requireApiSession(request);if(denied)return denied;
 const date=request.nextUrl.searchParams.get('date')||istSessionDate();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))return new NextResponse('Invalid date',{status:400});
 const days=baseline as Record<string,Record<string,Record<string,number>>>;
 const earlier=Object.keys(days).filter(d=>d<date).sort();
 const buckets:Record<string,Record<string,number[]>>={};
 for(const d of earlier)for(const [cut,stats]of Object.entries(days[d]))for(const [key,v]of Object.entries(stats))((buckets[cut]??={})[key]??=[]).push(v);
 const history=Object.fromEntries(Object.entries(buckets).map(([cut,stats])=>[cut,Object.fromEntries(Object.entries(stats).map(([k,a])=>[k,[a.reduce((x,y)=>x+y,0)/a.length,a.length]]))]));
 const fields=['sector','symbol','direction','classification','ce_pct','pe_pct','move_pct','price','oi_bias','pdh_pdl_broken','pdh_pdl_break_time','rusty_level_source','oi_line_broken','oi_line_break_time','ob_state','ob_broken_time','ob_retest_breakout_time'];
 const safe=(v:unknown)=>JSON.stringify(v).replace(/</g,'\\u003c');
 const payload=`const META=${safe({date,fields,dates:earlier,baselineThrough:earlier.at(-1)||'none'})};const MEMBERS=${safe(members)};const BASELINE=${safe(history)};\n${runtime}`;
 return new NextResponse(template.replace('/*__PAYLOAD__*/',()=>payload),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN'}});
}
