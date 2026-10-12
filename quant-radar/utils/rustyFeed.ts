import {istSessionDate,sessionPollingDelay} from './sessionPolling';

export type RustySnapshot = {source?:string;cut?:string;time?:string;bull?:unknown[];bear?:unknown[]};
export const rustyCut=(s:RustySnapshot)=>s.cut||s.time||'';
export function mergeRustySnapshots<T extends RustySnapshot>(previous:T[],updates:T[]):T[]{
  const byCut=new Map(previous.map(s=>[rustyCut(s),s]));
  for(const snap of updates)if(rustyCut(snap)&&(snap.source===undefined||snap.source==='rusty'))byCut.set(rustyCut(snap),snap);
  return [...byCut.values()].sort((a,b)=>rustyCut(a).localeCompare(rustyCut(b)));
}
// Poll after each five-minute cut, allowing 30s for capture/publication.
// The caller may make one 60s retry per missing cut; never an endless fast loop.
export function rustyNextPoll(date:string,now=Date.now()):number|null {
  const policy=sessionPollingDelay(date,300000,now);
  if(policy===null)return null;
  const start=Date.parse(`${istSessionDate(now)}T09:15:30+05:30`);
  // Allow a bounded post-close catch-up window through 15:40, then stop.
  // The landing page's local date clock resumes at the next IST session.
  if(now>=Date.parse(`${date}T15:40:30+05:30`))return null;
  const slot=Math.max(0,Math.floor((now-start)/300000)+1);
  return Math.max(1000,start+slot*300000-now);
}
export function rustyExpectedCut(date:string,now=Date.now()):string {
  const start=Date.parse(`${date}T09:15:00+05:30`);
  const minute=Math.min(940,555+Math.floor((now-start)/300000)*5);
  return minute<555?'':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
