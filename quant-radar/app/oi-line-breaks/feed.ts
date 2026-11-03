import type {LineBoard} from './types';
import {istSessionDate,sessionPollingDelay} from '@/utils/sessionPolling';

type Ports={
  hidden:()=>boolean;
  read:(signal:AbortSignal)=>Promise<LineBoard>;
  onData:(board:LineBoard)=>void;
  onError:(message:string)=>void;
  onSettled:()=>void;
};

// An immutable historical cut loads once. Filters/rank mode are entirely local.
// A hidden tab defers its initial read; focus storms cannot create parallel reads.
export function createLineArchiveFeed(ports:Ports){
  let stopped=false,loaded=false,inFlight=false;
  let controller:AbortController|undefined;
  const load=async()=>{
    if(stopped||loaded||inFlight||ports.hidden())return;
    inFlight=true;controller=new AbortController();
    try{
      const board=await ports.read(controller.signal);
      if(!stopped){loaded=true;ports.onData(board);}
    }catch(error){
      if(!stopped&&!(error instanceof DOMException&&error.name==='AbortError'))
        ports.onError(error instanceof Error?error.message:'OI line board unavailable');
    }finally{inFlight=false;if(!stopped)ports.onSettled();}
  };
  void load();
  return {visibility:()=>{if(!ports.hidden())void load();},stop:()=>{stopped=true;controller?.abort();}};
}

const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const KORAT_POLL_MS=300000;
export function koratPollingDelay(date:string,now=Date.now()):number|null{
  if(sessionPollingDelay(date,KORAT_POLL_MS,now)===null)return null;
  const hm=clock.format(new Date(now));
  return hm>='09:14'&&hm<='15:40'?KORAT_POLL_MS:null;
}

type LivePorts={
  date:string;now:()=>number;hidden:()=>boolean;
  setTimer:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;
  clearTimer:(id:ReturnType<typeof setTimeout>)=>void;
  read:(day:string,signal:AbortSignal)=>Promise<LineBoard>;
  onDate:(day:string)=>void;onData:(board:LineBoard)=>void;
  onError:(message:string)=>void;onSettled:()=>void;
};
export function createLineLiveFeed(ports:LivePorts){
  let stopped=false,inFlight=false,loaded=false,lastAttempt=-Infinity,date=ports.date;
  let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  const clear=()=>{if(timer!==undefined)ports.clearTimer(timer);timer=undefined;};
  const roll=()=>{const today=istSessionDate(ports.now());if(today!==date){
    date=today;loaded=false;lastAttempt=-Infinity;controller?.abort();ports.onDate(today);
  }};
  const schedule=()=>{
    clear();if(stopped||ports.hidden())return;
    const delay=koratPollingDelay(date,ports.now());
    timer=ports.setTimer(()=>{timer=undefined;roll();if(!loaded||koratPollingDelay(date,ports.now())!==null)void load();else schedule();},delay??60000);
  };
  const load=async()=>{
    if(stopped||ports.hidden()||inFlight)return;
    roll();
    if(loaded&&(koratPollingDelay(date,ports.now())===null||ports.now()-lastAttempt<KORAT_POLL_MS)){schedule();return;}
    clear();inFlight=true;loaded=true;lastAttempt=ports.now();
    controller=new AbortController();const requested=date;
    try{
      const board=await ports.read(requested,controller.signal);
      if(board.date!==requested||!Array.isArray(board.setup)||!Array.isArray(board.move))throw Error('Invalid Korat live board');
      if(!stopped&&date===requested)ports.onData(board);
    }catch(error){
      if(!stopped&&date===requested&&!(error instanceof DOMException&&error.name==='AbortError'))
        ports.onError(error instanceof Error?error.message:'Korat feed unavailable');
    }finally{inFlight=false;if(!stopped){ports.onSettled();schedule();}}
  };
  const visibility=()=>{clear();if(stopped||ports.hidden())return;roll();
    if(!loaded||koratPollingDelay(date,ports.now())!==null)void load();else schedule();};
  void load();
  return {visibility,stop:()=>{stopped=true;clear();controller?.abort();}};
}
