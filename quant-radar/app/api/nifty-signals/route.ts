import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/utils/auth";
import { getTodayIstDate } from "@/utils/backend";
import history from "@/data/nifty-paper-history.json";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const denied=await requireApiSession(request); if(denied) return denied;
  const date=request.nextUrl.searchParams.get("date")??getTodayIstDate();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date) return NextResponse.json({error:"Invalid date"},{status:400});
  if(history.dates.includes(date)) return NextResponse.json({date,mode:"RESEARCH_REPLAY",status:"Historical research results; entries were not issued live",signals:history.signals.filter(s=>s.date===date)});
  try {
    const {PANTHER_CLIENT_ID:id,PANTHER_CLIENT_SECRET:secret,PANTHER_TOKEN_URL:authUrl,PANTHER_SIGNALS_URL:feedUrl}=process.env;
    if(!id||!secret||!authUrl||!feedUrl) throw new Error();
    const auth=await fetch(authUrl,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials",cache:"no-store",signal:AbortSignal.timeout(10000)});
    if(!auth.ok) throw new Error();
    const token=(await auth.json()).access_token; const url=new URL(feedUrl);
    url.searchParams.set("src","nifty_paper_signals"); url.searchParams.set("sig_date",date.replaceAll("-",""));
    const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:"no-store",signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error();
    const docs=((await response.json()).items??[]).flatMap((item:Record<string,unknown>)=>{try{return [typeof item.doc==="string"?JSON.parse(item.doc):item.doc??item];}catch{return [];}}).filter((d:{source:string;sig_date:string})=>d.source==="nifty_paper_signals"&&String(d.sig_date)===date.replaceAll("-",""));
    docs.sort((a:{ts:number},b:{ts:number})=>b.ts-a.ts);
    const d=docs[0];
    if(d) d.stale=date===getTodayIstDate() && (!d.checked_at || Date.now()-Date.parse(d.checked_at)>7*60*1000);
    return NextResponse.json(d?{date,mode:"LIVE_PAPER",status:d.status,reason:d.reason,checked_at:d.checked_at,stale:d.stale,levels_date:d.levels_date,expiry:d.expiry,support:d.support,resistance:d.resistance,signals:d.signals??[]}:{date,mode:"LIVE_PAPER",status:"No scanner report available for this date",signals:[]},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Signal feed unavailable; no current results can be confirmed"},{status:503});}
}
