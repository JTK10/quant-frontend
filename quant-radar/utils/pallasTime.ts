// Explicit trading timezone, independent of browser/Vercel host timezone.
export function pallasSessionDate(now:number=Date.now()):string {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
}
export function pallasSessionRollover(mode:string,current:string,now:number=Date.now()):string|null {
  if(mode!=='live')return null;
  const today=pallasSessionDate(now);
  return today===current?null:today;
}
