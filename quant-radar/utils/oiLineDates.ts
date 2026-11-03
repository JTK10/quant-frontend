import archive from '@/data/oi-line-breaks/manifest.json';
import type {LineSession} from '@/app/oi-line-breaks/types';

export function koratSessions(today:string):LineSession[]{
  const sessions:LineSession[]=[...archive.sessions];
  const latest=archive.sessions.at(-1)!.date;
  const first=new Date(latest+'T00:00:00Z').getTime()+86400000;
  const end=new Date(today+'T00:00:00Z').getTime();
  if(!Number.isFinite(end))return sessions;
  const start=Math.max(first,end-44*86400000);
  for(let time=start;time<=end;time+=86400000){
    const day=new Date(time),weekday=day.getUTCDay();
    if(weekday!==0&&weekday!==6)sessions.push({date:day.toISOString().slice(0,10),cuts:0,
      coverage:'live_capture',last_cut:'',bytes:0});
  }
  return sessions;
}
