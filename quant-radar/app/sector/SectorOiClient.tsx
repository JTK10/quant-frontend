"use client";
import {useEffect,useState} from 'react';
import {buildTradingViewUrl} from '@/utils/backend';
import type {SectorOiBoard} from '@/utils/sectorOi';
import SectorBarChart from './SectorBarChart';
const format=(v:number|null)=>v===null?'—':v.toFixed(2);
const colors={BULL:'#63d6ad',BEAR:'#ff8592',NEUTRAL:'#a0aabd',UNAVAILABLE:'#778396'};
export default function SectorOiClient({board,error,date}:{board:SectorOiBoard|null;error:string;date:string}){
 const [previous,setPrevious]=useState(board);useEffect(()=>{if(board)setPrevious(board);},[board]);const shown=board??previous;
 return <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6">
  <div className="my-3 text-xs text-slate-400">{date} · {shown?.cut||'—'} IST · Net OI breadth = (bull − bear) / valid OI stocks × 100. Price is supporting context.</div>
  {error&&<p role="status" className="my-3 text-xs text-amber-300">{error}{shown?' Displaying the last received snapshot; it may be stale.':''}</p>}
  {!shown?<p className="mt-12 text-center text-sm text-slate-400">Waiting for this session’s Rusty data.</p>:<>
   <SectorBarChart sectors={shown.sectors.filter(s=>s.net!==null).map(s=>({sec:s.sec,net:s.net!,n:s.valid}))} selected={null} onSelect={sec=>{if(sec)document.getElementById('sector-'+sec)?.scrollIntoView({behavior:'smooth',block:'start'});}}/>
   <p className="my-3 text-xs text-slate-400">Uses Rusty’s existing sector groups and directional flow classifications. Neutral/choppy rows count as neutral. Unknown, conflicting or missing OI is excluded and shown as missing. Groups can overlap. {shown.unmapped} received stocks are outside these groups. OI changes use the opening baseline; scores are breadth, not win probabilities.</p>
   <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">{shown.sectors.map(s=><section key={s.sec} id={'sector-'+s.sec} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
    <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">{s.sec}</h2><b style={{color:s.net===null?'#a0aabd':s.net>=0?colors.BULL:colors.BEAR}}>{s.net===null?'No OI data':`${s.net>0?'+':''}${s.net.toFixed(1)} pp`}</b></div>
    <div className="my-2 flex flex-wrap gap-3 text-xs"><span style={{color:colors.BULL}}>Bull {s.bull}</span><span style={{color:colors.BEAR}}>Bear {s.bear}</span><span>Neutral {s.neutral}</span><span className="text-slate-400">Valid OI {s.valid}/{s.total} · Missing {s.missing}</span></div>
    <div className="mb-3 flex h-1.5 overflow-hidden rounded bg-slate-700" aria-label={`${s.sec}: ${s.bull} bull, ${s.bear} bear, ${s.neutral} neutral, ${s.missing} missing`}>{[['BULL',s.bull],['BEAR',s.bear],['NEUTRAL',s.neutral],['UNAVAILABLE',s.missing]].map(([key,n])=><span key={key} style={{width:`${Number(n)/s.total*100}%`,background:colors[key as keyof typeof colors]}}/>)}</div>
    <div className="max-h-[55vh] overflow-auto"><table className="w-full text-left text-[11px]"><thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>{['Stock','OI setup','CE %','PE %','Move %'].map(h=><th className="px-1 py-2" key={h}>{h}</th>)}</tr></thead><tbody>{s.stocks.map(r=><tr key={r.symbol} className="border-t border-slate-800"><td className="px-1 py-2"><a href={buildTradingViewUrl(r.symbol,r.symbol)} target="_blank" rel="noopener noreferrer">{r.symbol} ↗</a></td><td className="px-1 py-2" style={{color:colors[r.direction]}}><b className="text-[9px]">{r.direction}</b><br/>{r.classification}</td><td className="px-1 py-2">{format(r.ce)}</td><td className="px-1 py-2">{format(r.pe)}</td><td className="px-1 py-2">{format(r.move)}</td></tr>)}</tbody></table></div>
   </section>)}</div>
  </>}
 </div>;
}
