// Explicit trading timezone, independent of browser/Vercel host timezone.
export function pallasSessionDate(now:number=Date.now()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
}
export function pallasSessionRollover(mode:string,current:string,now:number=Date.now()):string|null {
  if(mode!=='live')return null;
  const today=pallasSessionDate(now);
  return today===current?null:today;
}
export function pallasPreviousWeekday(now:number=Date.now()):string {
  const day=new Date(pallasSessionDate(now)+'T12:00:00Z');
  do {day.setUTCDate(day.getUTCDate()-1);} while(day.getUTCDay()===0||day.getUTCDay()===6);
  return day.toISOString().slice(0,10);
}
export function pallasAsOf(mode:string,date:string,asof:string|null,now:number=Date.now()):number {
  const requested=asof?Date.parse(`${date}T${asof.length===5?asof+':00':asof}+05:30`):
    mode==='research'?Date.parse(`${date}T11:30:00+05:30`):
    mode==='history'?Date.parse(`${date}T23:59:59.999+05:30`):now;
  return mode==='research'?requested:Math.min(requested,now);
}
