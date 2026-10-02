"use client";
import { useEffect, useMemo, useState } from "react";
import { DatePicker } from "@/components/Controls";
import { getTodayIstDate } from "@/utils/backend";
import LiveCandleChart, { type ChartBar, type Timeframe, type TradeOverlay } from "../charts/LiveCandleChart";
import { useOIData } from "../charts/useOIData";
import "../charts/charts.css";
import "./signals.css";
type Signal={ time:string; entry_time?:string; side:"BULL"|"BEAR"; strategy:string; entry:number; stop:number; target:number; outcome:string; generated_at?:string; exit_time?:string };
type Report={date:string; mode:string; status:string; checked_at?:string; stale?:boolean; signals:Signal[]};
const EMPTY_BARS:ChartBar[]=[];
const EMPTY_SIGNALS:Signal[]=[];
const frames:Timeframe[]=["5m","15m","30m","1h"];
const stamp=(date:string,time:string)=>Date.parse(`${date}T${time}:00+05:30`)/1000;
const id=(s:Signal)=>`${s.time}-${s.side}-${s.strategy}`;
export default function NiftySignalsChart({initialDate,streamUrl}:{initialDate?:string;streamUrl:string}) {
  const date=initialDate??getTodayIstDate();
  const [timeframe,setTimeframe]=useState<Timeframe>("5m");
  const [report,setReport]=useState<Report|null>(null);
  const [failure,setFailure]=useState<{date:string;message:string}|null>(null);
  const [history,setHistory]=useState<{date:string;bars:ChartBar[]}|null>(null);
  const [selected,setSelected]=useState("");
  const [walls,setWalls]=useState(true);
  const {data:oiData,error:oiError}=useOIData("NIFTY 50",date);
  const current=report?.date===date?report:null;
  const signals=current?.signals??EMPTY_SIGNALS;
  const active=signals.find(s=>id(s)===selected)??signals.at(-1);
  const bars=history?.date===date?history.bars:EMPTY_BARS;
  const isToday=date===getTodayIstDate();
  const overlays=useMemo<TradeOverlay[]>(()=>signals.map(s=>({id:id(s),time:s.generated_at?Date.parse(s.generated_at)/1000:stamp(date,s.entry_time??s.time),side:s.side,entry:s.entry,stop:s.stop,target:s.target,endTime:s.exit_time?stamp(date,s.exit_time)+60:undefined})),[date,signals]);
  // Current-day closing OI must never become a historical trade level.
  const priorOI=useMemo(()=>oiData?.date===date?{...oiData,intraday:[]}:null,[oiData,date]);
  useEffect(()=>{
    const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const response=await fetch(`/api/nifty-signals?date=${date}`,{cache:"no-store",signal:controller.signal});
        if(!response.ok) throw new Error("Signal feed unavailable");
        const next=await response.json();
        if(!controller.signal.aborted){setReport(next);setFailure(null);}
      }catch{if(!controller.signal.aborted)setFailure({date,message:"Signal feed unavailable"});}
      finally{if(!controller.signal.aborted)timer=setTimeout(poll,isToday?10000:60000);}
    };
    void poll();
    fetch(`/api/chart-history?symbol=NIFTY%2050&date=${date}`,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(r=>{if(!controller.signal.aborted)setHistory({date,bars:r.bars??[]});}).catch(()=>{});
    return()=>{controller.abort();clearTimeout(timer);};
  },[date,isToday]);
  const replay=current?.mode==="RESEARCH_REPLAY";
  const closed=current?.status?.startsWith("Market closed");
  const status=failure?.date===date?failure.message:closed?"Market closed":current?.stale?"Scanner report delayed":!current?"Loading signals…":active?active.outcome==="OPEN"?"Trade open":active.outcome:current.status.startsWith("Data unavailable")?"OI unavailable · no entry":current.status.startsWith("No scanner")?"No scanner data":current.status.startsWith("Outside")?"Entry window 10:30–14:00":isToday?"Waiting for signal":"No signals";
  return <div className="charts-workspace">
    <header className="charts-toolbar"><strong className="text-sm mr-3">NIFTY 50</strong><div className="chart-timeframes">{frames.map(f=><button key={f} className={timeframe===f?"active":""} onClick={()=>setTimeframe(f)}>{f}</button>)}</div><div className="ml-auto flex items-center gap-3"><span className="text-xs text-slate-400">{replay?"REPLAY":"PAPER"}</span><DatePicker/></div></header>
    <div className="nifty-trade-bar"><div className={`nifty-direction ${active?.side==="BEAR"?"bear":"bull"}`}><b>{active?active.side==="BULL"?"↗ BULL":"↘ BEAR":status}</b>{active&&<small>{active.time} IST</small>}</div>{active&&<><div className="nifty-trade-price entry"><small>ENTRY</small><b>{active.entry.toFixed(2)}</b></div><div className="nifty-trade-price stop"><small>STOP LOSS <em>−{Math.abs(active.entry-active.stop).toFixed(2)} pts</em></small><b>{active.stop.toFixed(2)}</b></div><div className="nifty-trade-price target"><small>TARGET <em>+{Math.abs(active.target-active.entry).toFixed(2)} pts</em></small><b>{active.target.toFixed(2)}</b></div><div className={`nifty-outcome ${active.outcome.toLowerCase()}`}><b>{active.outcome==="TARGET"?"✓ TARGET HIT":active.outcome==="STOP"?"STOP HIT":status}</b><small>1 : 3{active.exit_time?` · ${active.exit_time} IST`:""}</small></div></>}{signals.length>1&&<select aria-label="Select signal" className="bg-slate-900 border border-slate-600 rounded p-1" value={active?id(active):""} onChange={e=>setSelected(e.target.value)}>{signals.map(s=><option key={id(s)} value={id(s)}>{s.time} {s.side}</option>)}</select>}<button className={`nifty-wall-toggle ${walls?"text-purple-300":"text-slate-500"}`} onClick={()=>setWalls(!walls)}>OI levels {walls?"ON":"OFF"}</button></div>
    <div className="chart-canvas flex-1 min-h-0"><LiveCandleChart symbol="NIFTY 50" streamUrl={isToday&&!closed?streamUrl:""} timeframe={timeframe} initialBars={bars} sessionDate={date} strictSession mutedOI={Boolean(active)} oiData={walls?priorOI:null} tradeSignals={overlays} selectedTradeId={active?id(active):undefined}/></div>
    <footer className="charts-footer"><span>{replay?"Historical replay":closed?"Market closed":"Live candles · paper signals"} · IST</span><span>{oiError?"OI unavailable":priorOI?.previous.length?"Prior-session OI":"Loading OI"}{current?.checked_at?` · scan ${new Date(current.checked_at).toLocaleTimeString("en-GB",{timeZone:"Asia/Kolkata"})}`:""}</span><span>Powered by TradingView Lightweight Charts™</span></footer>
  </div>;
}
