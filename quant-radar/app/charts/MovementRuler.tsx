"use client";
import {useRef,useState} from "react";
import type {ISeriesApi} from "lightweight-charts";
export default function MovementRuler({series}:{series:React.RefObject<ISeriesApi<"Candlestick">|null>}) {
 const [active,setActive]=useState(false);
 const [m,setM]=useState<{x:number;y:number;ex:number;ey:number;p:number;end:number}|null>(null);
 const drag=useRef(false);
 return <>
 <button type="button" aria-pressed={active} title="Measure movement: drag between two prices" className="absolute left-2 top-10 z-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] text-sky-200" onClick={e=>{e.stopPropagation();setActive(v=>!v);setM(null);drag.current=false;}}>RULER{active?" ON":""}</button>
 {active && <div className="absolute inset-0 z-10" style={{cursor:"crosshair",touchAction:"none"}} onPointerDown={e=>{
 const b=e.currentTarget.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,p=series.current?.coordinateToPrice(y);
 if(p==null||!Number.isFinite(p)||p<=0)return;
 e.currentTarget.setPointerCapture(e.pointerId);drag.current=true;setM({x,y,ex:x,ey:y,p,end:p});
 }} onPointerMove={e=>{
 if(!drag.current)return;const b=e.currentTarget.getBoundingClientRect(),ex=Math.max(0,Math.min(b.width,e.clientX-b.left)),ey=Math.max(0,Math.min(b.height,e.clientY-b.top)),end=series.current?.coordinateToPrice(ey);
 if(end==null||!Number.isFinite(end))return;setM(v=>v?{...v,ex,ey,end}:v);
 }} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}>
 {m&&<><svg className="pointer-events-none absolute inset-0 h-full w-full"><rect x={Math.min(m.x,m.ex)} y={Math.min(m.y,m.ey)} width={Math.max(1,Math.abs(m.ex-m.x))} height={Math.max(1,Math.abs(m.ey-m.y))} fill="rgba(56,189,248,.15)" stroke="#38bdf8"/><line x1={m.x} y1={m.y} x2={m.ex} y2={m.ey} stroke="#38bdf8" strokeDasharray="4 3"/></svg><div className="pointer-events-none absolute left-2 bottom-12 rounded border border-sky-400 bg-slate-950 px-3 py-2 text-xs text-sky-200">{(m.end-m.p).toFixed(2)} pts / {((m.end/m.p-1)*100).toFixed(2)}%<br/>{m.p.toFixed(2)} to {m.end.toFixed(2)}</div></>}
 </div>}
 </>;
}
