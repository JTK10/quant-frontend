'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {DatePicker} from '@/components/Controls';
import {istSessionDate,sessionPollingDelay} from '@/utils/sessionPolling';
import {mergeRustySnapshots,rustyCut,rustyExpectedCut,rustyNextPoll} from '@/utils/rustyFeed';
import RustyClient,{type Snap} from './RustyClient';

export default function RustyFeed({dateStr,followToday}:{dateStr:string;followToday:boolean}){
  const router=useRouter();
  const [snaps,setSnaps]=useState<Snap[]>([]);
  const snapshots=useRef<Snap[]>([]),hasLoaded=useRef(false),lastRequested=useRef(0);
  const catalog=useRef<string[]>([]);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [enabled,setEnabled]=useState(true);
  const [loadingCut,setLoadingCut]=useState('');
  const selectedCut=useRef<string|null>(null);
  const failedCut=useRef<string|null>(null);
  const requestRefresh=useRef<()=>void>(()=>{});
  const requestCut=useRef<(cut:string|null)=>void>(()=>{});
  const movingDate=useRef(false);
  const closed=dateStr==='2026-10-02';
  useEffect(()=>{
    if(closed)return;
    let disposed=false,inFlight=false,done=hasLoaded.current,retried='',pendingCut:string|undefined;
    let data=snapshots.current,latest=rustyCut(data.at(-1)??{});
    let timer:ReturnType<typeof setTimeout>|undefined,selectionTimer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
    const missing=(cut:string|null):cut is string=>!!cut&&!data.some(s=>rustyCut(s)===cut);
    const schedule=(delay=rustyNextPoll(dateStr))=>{
      clearTimeout(timer);
      if(!disposed&&enabled&&!document.hidden&&delay!==null)timer=setTimeout(()=>void load(),delay);
    };
    const load=async(manual=false,requestedCut?:string,bypassCache=false)=>{
      if(disposed||document.hidden)return;
      if(inFlight){if(requestedCut)pendingCut=requestedCut;return;}
      if(followToday&&istSessionDate()!==dateStr){if(!movingDate.current){movingDate.current=true;router.replace('/rusty');}return;}
      if(done&&!manual&&(sessionPollingDelay(dateStr,300000)===null||Date.now()-lastRequested.current<15000)){schedule();return;}
      clearTimeout(timer);inFlight=true;lastRequested.current=Date.now();controller=new AbortController();
      if(requestedCut)setLoadingCut(requestedCut);
      try{
        const p=new URLSearchParams({date:dateStr,sources:'rusty',view:'rusty'});
        // Include the last cut again so corrected/re-published snapshots replace it.
        if(requestedCut)p.set('cut',requestedCut);else if(latest)p.set('after',latest);
        const response=await fetch('/api/panther-signals?'+p,{cache:bypassCache?'reload':'default',signal:controller.signal});
        if(response.status===401){window.location.assign('/login?next=%2Frusty');return;}
        const body=await response.json();
        if(!response.ok||!Array.isArray(body.snapshots)||!Array.isArray(body.cuts))throw new Error(body.error||'Rusty feed unavailable');
        if(disposed)return;
        const updates=body.snapshots.filter((s:Snap)=>s.source==='rusty');
        if(!updates.length&&(requestedCut||data.length))throw new Error('Requested Rusty snapshot is unavailable');
        if(requestedCut&&!updates.some((s:Snap)=>rustyCut(s)===requestedCut))throw new Error('Requested Rusty snapshot is unavailable');
        data=mergeRustySnapshots(data,updates);latest=rustyCut(data.at(-1)??{});
        catalog.current=[...new Set<string>([...catalog.current,...body.cuts.filter((c:unknown)=>typeof c==='string'&&/^\d{2}:\d{2}$/.test(c))])].sort();
        const byCut=new Map(data.map(s=>[rustyCut(s),s]));
        done=true;hasLoaded.current=true;snapshots.current=data;
        setSnaps(catalog.current.map(cut=>byCut.get(cut)??{cut}));setLoaded(true);
        if(!missing(selectedCut.current)){setError('');failedCut.current=null;}
      }catch(e){
        if(!disposed&&(!requestedCut||selectedCut.current===requestedCut)&&!(e instanceof DOMException&&e.name==='AbortError')){
          if(requestedCut)failedCut.current=requestedCut;
          setError(e instanceof Error?e.message:'Rusty feed unavailable');
        }
      }finally{
        inFlight=false;
        if(disposed)return;
        setLoadingCut(missing(selectedCut.current)?selectedCut.current:'');
        if(pendingCut){const next=pendingCut;pendingCut=undefined;if(next===selectedCut.current&&missing(next)){void load(true,next);return;}}
        const expected=rustyExpectedCut(dateStr);
        // One bounded retry captures delayed publications; normal cadence is 5m.
        if(sessionPollingDelay(dateStr,300000)===300000&&expected&&latest<expected&&retried!==expected){retried=expected;schedule(60000);}
        else schedule();
      }
    };
    const visibility=()=>{clearTimeout(timer);clearTimeout(selectionTimer);if(!document.hidden){if(missing(selectedCut.current)&&failedCut.current!==selectedCut.current)void load(true,selectedCut.current);else if(!done||(enabled&&sessionPollingDelay(dateStr,300000)!==null))void load();}};
    requestRefresh.current=()=>{clearTimeout(selectionTimer);pendingCut=undefined;failedCut.current=null;void load(true,selectedCut.current??undefined,true);};
    requestCut.current=cut=>{
      selectedCut.current=cut;failedCut.current=null;pendingCut=undefined;clearTimeout(selectionTimer);setError('');
      setLoadingCut(missing(cut)?cut:'');
      // A drag emits many intermediate times. Fetch only where the user stops,
      // then keep that snapshot locally; browser history caching stays enabled.
      if(missing(cut))selectionTimer=setTimeout(()=>void load(true,cut),200);
    };
    if(!done)void load();else if(missing(selectedCut.current)&&failedCut.current!==selectedCut.current)void load(true,selectedCut.current);else schedule();
    document.addEventListener('visibilitychange',visibility);
    return()=>{disposed=true;clearTimeout(timer);clearTimeout(selectionTimer);controller?.abort();document.removeEventListener('visibilitychange',visibility);requestRefresh.current=()=>{};requestCut.current=()=>{};};
  // Date changes remount this component; toggling auto does not discard board data.
  },[dateStr,followToday,closed,enabled,router]);
  useEffect(()=>{
    if(!followToday)return;
    const timer=setInterval(()=>{if(!document.hidden&&istSessionDate()!==dateStr&&!movingDate.current){movingDate.current=true;router.replace('/rusty');}},60000);
    return()=>clearInterval(timer);
  },[dateStr,followToday,router]);
  return <RustyClient snaps={snaps} dateStr={dateStr}
    onCutChange={cut=>requestCut.current(cut)}
    controls={<><DatePicker/>{!closed&&<><button type="button" className="latest" onClick={()=>setEnabled(v=>!v)}>{enabled?'AUTO 5M':'AUTO OFF'}</button><button type="button" className="latest" onClick={()=>requestRefresh.current()}>Refresh</button></>}</>}
    status={error?`Refresh failed: ${error} · Use Refresh to retry${selectedCut.current?` ${selectedCut.current}`:''}.`:loadingCut?`Loading snapshot ${loadingCut}…`:undefined}
    emptyMessage={closed?<><strong>Market closed — Gandhi Jayanti</strong><p>October 2, 2026 is an NSE trading holiday.</p><a href="/rusty?date=2026-10-01">View October 1 snapshots ↗</a></>:!loaded?'Loading Rusty snapshots…':undefined}/>;
}
