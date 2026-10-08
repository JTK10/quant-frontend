const ist = new Intl.DateTimeFormat('en-GB', {
  timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit',
  weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
});

export function istSessionDate(now=Date.now()):string {
  const parts=Object.fromEntries(ist.formatToParts(new Date(now)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Null suppresses network polling. Callers may check the clock again without fetching.
// This covers weekends; exchange holidays still require an authoritative calendar.
export function sessionPollingDelay(date:string|undefined, interval:number, now=Date.now()):number|null {
  const parts=Object.fromEntries(ist.formatToParts(new Date(now)).map(p=>[p.type,p.value]));
  const today=`${parts.year}-${parts.month}-${parts.day}`;
  if((date&&date!==today)||parts.weekday==='Sat'||parts.weekday==='Sun')return null;
  const time=`${parts.hour}:${parts.minute}`;
  return time>='09:14'&&time<='15:35'?interval:300000;
}
