"use client";
import {useEffect,useRef,useState,type RefObject} from "react";
import type {IChartApi,ISeriesApi,Logical} from "lightweight-charts";
type Point={logical:number;price:number};
type Measure={start:Point;end:Point};
export default function MovementRuler({series,chart,interval}:{series:RefObject<ISeriesApi<"Candlestick">|null>;chart:RefObject<IChartApi|null>;interval:number}) {
 const [active,setActive]=useState(false),[shift,setShift]=useState(false),[m,setM]=useState<Measure|null>(null),[revision,redraw]=useState(0);
 const drag=useRef(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
 const down=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.closest('input,textarea,[contenteditable=true]'))return;if(e.key==='Shift')setShift(true);if(e.key==='Escape'){setActive(false);setM(null);drag.current=false;}};
 const up=(e:KeyboardEvent)=>{if(e.key==='Shift')setShift(false);};
 const blur=()=>{setShift(false);drag.current=false;};window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 const observer=new ResizeObserver(()=>redraw(v=>v+1));if(root.current)observer.observe(root.current);
 return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);observer.disconnect();};
 },[]);
 useEffect(()=>{let scale:ReturnType<IChartApi['timeScale']>|undefined;const changed=()=>redraw(v=>v+1);const frame=requestAnimationFrame(()=>{scale=chart.current?.timeScale();scale?.subscribeVisibleLogicalRangeChange(changed);});return()=>{cancelAnimationFrame(frame);try{scale?.unsubscribeVisibleLogicalRangeChange(changed);}catch{}};},[chart]);
 const enabled=active||shift;
 const point=(e:React.PointerEvent<HTMLDivElement>):Point|null=>{const b=e.currentTarget.getBoundingClientRect(),scale=chart.current?.timeScale();const x=Math.max(0,Math.min(b.width-65,e.clientX-b.left)),y=Math.max(0,Math.min(b.height-28,e.clientY-b.top));const price=series.current?.coordinateToPrice(y),logical=scale?.coordinateToLogical(x);return price!=null&&price>0&&Number.isFinite(price)&&logical!=null?{price,logical:Math.round(logical)}:null;};
 const scale=chart.current?.timeScale(),x1=m?scale?.logicalToCoordinate(m.start.logical as Logical):null,x2=m?scale?.logicalToCoordinate(m.end.logical as Logical):null,y1=m?series.current?.priceToCoordinate(m.start.price):null,y2=m?series.current?.priceToCoordinate(m.end.price):null;
 const valid=m&&x1!=null&&x2!=null&&y1!=null&&y2!=null;
 const change=m?m.end.price-m.start.price:0,color=change>=0?'#2962ff':'#f23645';
 const bars=m?Math.abs(m.end.logical-m.start.logical):0;
 const t1=m?scale?.coordinateToTime(x1??0):null,t2=m?scale?.coordinateToTime(x2??0):null;
 const minutes=typeof t1==='number'&&typeof t2==='number'?Math.round(Math.abs(t2-t1)/60):bars*interval;
 const duration=minutes>=1440?`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`:minutes>=60?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${minutes}m`;
 void revision;
 return <div ref={root} className="pointer-events-none absolute inset-0 z-10">
 <button type="button" aria-label="Measure price movement" aria-pressed={active} title="Ruler: drag to measure. Hold Shift for quick measure. Escape to clear." className="pointer-events-auto absolute left-2 top-10 z-20 flex items-center gap-1 rounded border px-2 py-1 text-[10px]" style={{background:active?'#2962ff':'#131722',borderColor:active?'#2962ff':'#363a45',color:'#d1d4dc'}} onClick={e=>{e.stopPropagation();setActive(v=>!v);setM(null);drag.current=false;}}><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M3 13 13 3l4 4L7 17zM6 10l2 2m1-5 2 2m1-5 2 2"/></svg>Ruler</button>
 {m&&<button type="button" aria-label="Clear measurement" className="pointer-events-auto absolute left-20 top-10 z-20 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-[10px] text-slate-300" onClick={()=>setM(null)}>Clear</button>}
 {enabled&&<div className="pointer-events-auto absolute inset-0" style={{cursor:'crosshair',touchAction:'none'}} onPointerDown={e=>{if(e.button!==0)return;const p=point(e);if(!p)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current=true;setM({start:p,end:p});}} onPointerMove={e=>{if(!drag.current)return;const p=point(e);if(p)setM(v=>v?{...v,end:p}:v);}} onPointerUp={()=>{drag.current=false;}} onPointerCancel={()=>{drag.current=false;}}/>}
 {valid&&<><svg className="absolute inset-0 h-full w-full" style={{overflow:'hidden'}}><rect x={Math.min(x1,x2)} y={Math.min(y1,y2)} width={Math.max(1,Math.abs(x2-x1))} height={Math.max(1,Math.abs(y2-y1))} fill={change>=0?'rgba(41,98,255,.18)':'rgba(242,54,69,.18)'} stroke={color}/><path d={`M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`} fill="none" stroke={color} strokeDasharray="4 3"/><circle cx={x1} cy={y1} r="3" fill={color}/><circle cx={x2} cy={y2} r="3" fill={color}/></svg><div className="absolute rounded px-3 py-2 text-center text-xs font-medium text-white shadow-lg" style={{background:color,left:Math.max(4,Math.min((x1+x2)/2-100,(root.current?.clientWidth??400)-210)),top:Math.max(72,Math.min(Math.min(y1,y2)-65,(root.current?.clientHeight??400)-90)),minWidth:190}}>{change>=0?'+':''}{change.toFixed(2)} ({change>=0?'+':''}{(change/m.start.price*100).toFixed(2)}%)<br/>{bars} bars · {duration}<div className="mt-1 text-[10px] opacity-80">{m.start.price.toFixed(2)} → {m.end.price.toFixed(2)}</div></div></>}
 </div>;
}
