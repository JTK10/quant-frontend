'use client';
import {useEffect,useRef,useState} from 'react';
import type {ChartBar} from '../charts/LiveCandleChart';
import {SetupCandles} from './setupCandles';
export function useSetupCandles(symbols:string[],date:string,cut:string){
  const [state,setState]=useState<{date:string;cut:string;bars:Map<string,ChartBar[]>}>({date:'',cut:'',bars:new Map()});
  const client=useRef<SetupCandles|null>(null);
  const key=[...new Set(symbols)].sort().join('|');
  useEffect(()=>{
    const instance=new SetupCandles({url:process.env.NEXT_PUBLIC_CHART_STREAM_URL??'wss://140.238.241.210.sslip.io',onData:(bars,date,cut)=>setState({date,cut,bars})});
    client.current=instance;const visible=()=>instance.visibility();document.addEventListener('visibilitychange',visible);
    return()=>{instance.stop();client.current=null;document.removeEventListener('visibilitychange',visible);};
  },[]);
  useEffect(()=>{client.current?.configure(key?key.split('|'):[],date,cut);},[key,date,cut]);
  return state.date===date&&state.cut===cut?state.bars:new Map<string,ChartBar[]>();
}
