'use client';
import {useEffect,useRef} from 'react';
import {addChartWatchlistSymbol,readChartWatchlist,CHART_WATCHLIST_STORAGE_KEY,CHART_WATCHLIST_UPDATED_EVENT} from '@/utils/chartWatchlist';
export default function SectorWorkspace({date}:{date:string}){
 const frame=useRef<HTMLIFrameElement>(null);
 const sync=()=>frame.current?.contentWindow?.postMessage({type:'SECTOR_WATCHLIST',symbols:readChartWatchlist()},window.location.origin);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||event.data?.type!=='SECTOR_ADD_WATCHLIST')return;
   const symbol=event.data.symbol;if(typeof symbol!=='string'||!/^\w[\w& .-]{0,39}$/.test(symbol))return;
   addChartWatchlistSymbol(symbol);sync();
  };
  const storage=(event:StorageEvent)=>{if(event.key===CHART_WATCHLIST_STORAGE_KEY||event.key===null)sync();};
  window.addEventListener('message',receive);window.addEventListener('storage',storage);window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);
  return()=>{window.removeEventListener('message',receive);window.removeEventListener('storage',storage);window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);};
 },[date]);
 return <iframe ref={frame} onLoad={sync} key={date} title="Sector Scope — sector, flow and stock review" src={`/sector/workspace?date=${encodeURIComponent(date)}`} className="h-dvh w-full border-0"/>;
}
