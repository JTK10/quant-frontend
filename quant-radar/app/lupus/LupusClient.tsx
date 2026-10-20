'use client';
import {useEffect,useRef,useState} from 'react';
import {addChartWatchlistSymbol,readChartWatchlist,CHART_WATCHLIST_STORAGE_KEY,CHART_WATCHLIST_UPDATED_EVENT} from '@/utils/chartWatchlist';
import {istSessionDate,sessionPollingDelay} from '@/utils/sessionPolling';

export default function LupusClient(){
  const [mode,setMode]=useState<'live'|'replay'>('live');
  const [ready,setReady]=useState(false);
  const frame=useRef<HTMLIFrameElement>(null);
  useEffect(()=>{
    const sync=()=>frame.current?.contentWindow?.postMessage({type:'LUPUS_WATCHLIST',symbols:readChartWatchlist()},window.location.origin);
    const receive=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow||event.data?.type!=='LUPUS_ADD_WATCHLIST')return;
      const symbol=event.data.symbol;
      if(typeof symbol!=='string'||!/^\w[\w& .-]{0,39}$/.test(symbol))return;
      addChartWatchlistSymbol(symbol);sync();
    };
    const storage=(event:StorageEvent)=>{if(event.key===CHART_WATCHLIST_STORAGE_KEY||event.key===null)sync();};
    window.addEventListener('message',receive);window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);window.addEventListener('storage',storage);
    if(ready)sync();
    return()=>{window.removeEventListener('message',receive);window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);window.removeEventListener('storage',storage);};
  },[ready,mode]);
  useEffect(()=>{
    if(mode!=='live'||!ready)return;
    let stopped=false,inFlight=false,loaded=false,date=istSessionDate(),lastRequested=0;
    let timer:ReturnType<typeof setTimeout>;let controller:AbortController|undefined;
    const post=(data:unknown)=>frame.current?.contentWindow?.postMessage({type:'LUPUS_LIVE',...data as object},window.location.origin);
    const schedule=()=>{clearTimeout(timer);if(stopped||document.hidden)return;const delay=sessionPollingDelay(date,300000);timer=setTimeout(()=>{
      if(istSessionDate()!==date){date=istSessionDate();lastRequested=0;loaded=false;post({date,snapshot:null,message:'Waiting for current-session Rusty data'});}
      if(sessionPollingDelay(date,300000)!==null)void load();else schedule();
    },delay??60000);};
    const load=async()=>{
      if(stopped||document.hidden||inFlight)return;
      if(istSessionDate()!==date){date=istSessionDate();loaded=false;post({date,snapshot:null,message:'Waiting for current-session Rusty data'});}
      if(loaded&&Date.now()-lastRequested<300000){schedule();return;}
      lastRequested=Date.now();inFlight=true;loaded=true;controller=new AbortController();clearTimeout(timer);
      try{
        const response=await fetch('/api/panther-signals?'+new URLSearchParams({date,sources:'lupus,lupus_health',latestCycle:'1'}),{cache:'default',signal:controller.signal});
        if(response.status===401){window.location.assign('/login?next=%2Flupus');return;}
        if(!response.ok)throw new Error('Lupus feed unavailable');
        const docs=await response.json();if(!Array.isArray(docs))throw new Error('Invalid Lupus feed');
        const snapshot=docs.filter(d=>d.source==='lupus').sort((a,b)=>String(a.cut).localeCompare(String(b.cut))||a.ts-b.ts).at(-1)??null;
        const health=docs.filter(d=>d.source==='lupus_health').sort((a,b)=>a.ts-b.ts).at(-1);
        const closed=health?.event==='CLOSED'||sessionPollingDelay(date,300000)===null;
        const stale=!!snapshot&&!closed&&Date.now()/1000-snapshot.ts>600;
        if(!stopped)post({date,snapshot,message:health?.event==='ERROR'?health.detail:stale?'Rusty/Lupus input delayed':health?.detail??(snapshot?'Current Rusty inputs':'Waiting for Lupus/Rusty data'),stale,health:health?.event});
      }catch(e){if(!stopped&&!(e instanceof DOMException&&e.name==='AbortError'))post({date,error:e instanceof Error?e.message:'Feed unavailable'});}
      finally{inFlight=false;schedule();}
    };
    const visibility=()=>{clearTimeout(timer);if(!document.hidden&&(!loaded||sessionPollingDelay(date,300000)!==null))void load();else schedule();};
    document.addEventListener('visibilitychange',visibility);void load();
    return()=>{stopped=true;controller?.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[mode,ready]);
  return <section style={{height:'100dvh',display:'flex',flexDirection:'column',background:'#0a1018'}}>
    <div style={{display:'flex',gap:8,alignItems:'center',padding:'8px 14px',borderBottom:'1px solid #233143',color:'#9cadc0',fontSize:12}}>
      {(['live','replay'] as const).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>{if(mode!==m){setReady(false);setMode(m);}}} style={{padding:'6px 12px',border:'1px solid '+(mode===m?'#487b66':'#233143'),borderRadius:6,color:mode===m?'#61dfb1':'#9cadc0',background:mode===m?'#153128':'transparent'}}>{m==='live'?'Live scanner':'Historical replay'}</button>)}
      <span>{mode==='live'?'Uses current Rusty captures · five-minute signals':'Select a session · cached production history'}</span>
    </div>
    <iframe ref={frame} key={mode} title={mode==='live'?'Lupus live scanner':'Lupus historical replay'} src={`/lupus-preview/index.html?embedded=1&mode=${mode}`} onLoad={()=>setReady(true)} style={{width:'100%',flex:1,minHeight:0,border:0}}/>
  </section>;
}
