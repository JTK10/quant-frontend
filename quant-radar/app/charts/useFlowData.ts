'use client';
import {useEffect,useState} from 'react';
import {istSessionDate,sessionPollingDelay} from '@/utils/sessionPolling';
import type {FlowData} from './flowBand';
const cache=new Map<string,{until:number;data:FlowData}>();
const pending=new Map<string,{promise:Promise<FlowData>;controller:AbortController;refs:number;settled:boolean}>();
function acquire(symbol:string,date:string){
  const key=symbol+'|'+date,cached=cache.get(key);
  if(cached&&cached.until>Date.now())return {promise:Promise.resolve(cached.data),release:()=>{}};
  let slot=pending.get(key);
  if(!slot){
    const controller=new AbortController();
    slot={controller,refs:0,settled:false,promise:Promise.resolve(null as unknown as FlowData)};
    const entry=slot;
    entry.promise=fetch('/api/chart-flow?symbol='+encodeURIComponent(symbol)+'&date='+date,{cache:'default',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(async r=>{
      if(!r.ok)throw new Error('Flow feed unavailable');
      const data=await r.json() as FlowData;
      if(data.symbol!==symbol||data.date!==date||!Array.isArray(data.points))throw new Error('Flow session mismatch');
      cache.delete(key);cache.set(key,{until:Date.now()+(date===istSessionDate()?300000:3600000),data});
      if(cache.size>100)cache.delete(cache.keys().next().value!);
      return data;
    }).finally(()=>{entry.settled=true;if(pending.get(key)===entry)pending.delete(key);});
    pending.set(key,entry);
  }
  const entry=slot;entry.refs++;let released=false;
  return {promise:entry.promise,release:()=>{if(released)return;released=true;if(--entry.refs===0&&!entry.settled){entry.controller.abort();if(pending.get(key)===entry)pending.delete(key);}}};
}
export function useFlowData(symbol:string,date:string,enabled:boolean){
  const [data,setData]=useState<FlowData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{
    let stopped=false,inFlight=false,attempted=false;
    let timer:ReturnType<typeof setTimeout>|undefined,release:(()=>void)|undefined;
    setData(null);setError('');setLoading(enabled);
    if(!enabled)return;
    const schedule=()=>{clearTimeout(timer);if(stopped||document.hidden||date!==istSessionDate())return;const delay=sessionPollingDelay(date,300000);if(delay!==null)timer=setTimeout(()=>{if(date===istSessionDate()&&sessionPollingDelay(date,300000)!==null)void refresh();},delay);};
    const refresh=async()=>{
      if(stopped||inFlight||document.hidden)return;
      clearTimeout(timer);inFlight=true;attempted=true;
      const task=acquire(symbol,date);release=task.release;
      try{const value=await task.promise;if(!stopped){setData(value);setError('');}}
      catch{if(!stopped)setError('Flow unavailable · last saved values retained');}
      finally{task.release();release=undefined;inFlight=false;if(!stopped){setLoading(false);schedule();}}
    };
    const visible=()=>{clearTimeout(timer);if(!document.hidden&&(!attempted||sessionPollingDelay(date,300000)!==null))void refresh();};
    document.addEventListener('visibilitychange',visible);void refresh();
    return()=>{stopped=true;clearTimeout(timer);release?.();document.removeEventListener('visibilitychange',visible);};
  },[symbol,date,enabled]);
  return {data:enabled&&data?.symbol===symbol&&data.date===date?data:null,error:enabled?error:'',loading:enabled&&loading};
}
