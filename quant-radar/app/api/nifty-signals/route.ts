import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/utils/auth";
import { getTodayIstDate } from "@/utils/backend";
import history from "@/data/nifty-paper-history.json";
import { fetchNiftyFeed } from "@/utils/niftyFeed";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied=await requireApiSession(request); if(denied) return denied;
  const date=request.nextUrl.searchParams.get("date")??getTodayIstDate();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) return NextResponse.json({error:"Invalid date"},{status:400});
  if(history.dates.includes(date)) return NextResponse.json({date,mode:"RESEARCH_REPLAY",status:"Historical research results; entries were not issued live",signals:history.signals.filter(s=>s.date===date)});
  try {
    const response=await fetchNiftyFeed("nifty_paper_signals",date);
    const docs=(response.items??[]).flatMap((item:Record<string,unknown>)=>{try{return [typeof item.doc==="string"?JSON.parse(item.doc):item.doc??item];}catch{return [];}}).filter((d:{source:string;sig_date:string})=>d.source==="nifty_paper_signals"&&String(d.sig_date)===date.replaceAll("-",""));
    docs.sort((a:{ts:number},b:{ts:number})=>b.ts-a.ts);
    const d=docs[0];
    if(d) d.stale=date===getTodayIstDate() && (!d.checked_at || Date.now()-Date.parse(d.checked_at)>7*60*1000);
    return NextResponse.json(d?{date,mode:"LIVE_PAPER",status:d.status,reason:d.reason,checked_at:d.checked_at,stale:d.stale,levels_date:d.levels_date,expiry:d.expiry,support:d.support,resistance:d.resistance,signals:d.signals??[]}:{date,mode:"LIVE_PAPER",status:"No scanner report available for this date",signals:[]},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Signal feed unavailable; no current results can be confirmed"},{status:503});}
}
