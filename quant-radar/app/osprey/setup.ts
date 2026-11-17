import {computeFlowBand} from '../charts/flowBand';
import type {ChartBar} from '../charts/LiveCandleChart';
import type {OspreyRow} from './model';

export type SetupMatch={kind:'PRIMARY'|'BREAKOUT';contact:'BODY'|'WICK';cut:string};
const dayOf=(time:number)=>new Date((time+19800)*1000).toISOString().slice(0,10);
const slotOf=(time:number)=>new Date((time+19800)*1000).toISOString().slice(11,16);
export function evaluateOspreySetup(row:OspreyRow,bars:readonly ChartBar[]|undefined,date:string,cut:string):SetupMatch|null{
  if(row.state!=='Confirmed'||!row.confirmed||row.confirmed>cut||!['BULL','BEAR'].includes(row.side)||!bars?.length)return null;
  const end=Date.parse(date+'T'+cut+':00+05:30')/1000;
  if(!Number.isFinite(end)||end>Date.now()/1000)return null;
  const history=[...bars].filter(b=>b.time+300<=end).sort((a,b)=>a.time-b.time);
  const current=history.findLast(b=>b.time===end-300);
  if(!current)return null;
  const days=[...new Set(history.map(b=>dayOf(b.time)))].filter(d=>d<date).sort();
  const prior=history.filter(b=>dayOf(b.time)===days.at(-1)&&slotOf(b.time)>='09:15'&&slotOf(b.time)<='15:25');
  if(new Set(prior.map(b=>b.time)).size!==75)return null;
  const pdh=Math.max(...prior.map(b=>b.high)),pdl=Math.min(...prior.map(b=>b.low));
  const bull=row.side==='BULL';
  if(bull?current.close<=pdh:current.close>=pdl)return null;
  const band=computeFlowBand(history,[],300,end).at(-1);
  if(!band||band.time!==current.time)return null;
  const ema=(band.upper+band.lower)/2,epsilon=current.close*1e-10;
  if(current.low>band.upper+epsilon||current.high<band.lower-epsilon)return null;
  const bodyLow=Math.min(current.open,current.close),bodyHigh=Math.max(current.open,current.close);
  const contact=bodyLow<=band.upper+epsilon&&bodyHigh>=band.lower-epsilon?'BODY':'WICK';
  if(bull?bodyLow>ema+epsilon:bodyHigh<ema-epsilon)return {kind:'PRIMARY',contact,cut};
  const previous=history.findLast(b=>b.time<current.time);
  if(!previous)return null;
  const levels=[bull?pdh:pdl,...(row.setup_oi&&row.setup_oi.date<date?row.setup_oi.levels:[])];
  const breaks=levels.some(level=>bull?previous.close<=level&&current.high>level:previous.close>=level&&current.low<level);
  return breaks?{kind:'BREAKOUT',contact,cut}:null;
}
