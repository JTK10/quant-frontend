/* Dated production snapshots. One fetch per selected date, eight-date memory cache. */
'use strict';
window.LupusHistory=(()=>{
 const cache=new Map();let pending=null;
 const holidays=new Set(['2026-01-26','2026-03-03','2026-03-26','2026-03-31','2026-04-03','2026-04-14','2026-05-01','2026-05-28','2026-06-26','2026-09-14','2026-10-02','2026-10-20','2026-11-10','2026-11-24','2026-12-25']);
 const istDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function dates(saved,today=istDate()){
   const values=new Set(saved.map(s=>s.date));
   for(let d=new Date('2026-10-01T00:00:00Z');d.toISOString().slice(0,10)<=today;d.setUTCDate(d.getUTCDate()+1)){
     const day=d.toISOString().slice(0,10);if(d.getUTCDay()!==0&&d.getUTCDay()!==6&&!holidays.has(day))values.add(day);
   }
   return [...values].filter(d=>d<=today).sort();
 }
 async function load(day){
   if(cache.has(day))return cache.get(day);
   if(pending?.day===day)return pending.promise;
   pending?.controller.abort();
   const controller=new AbortController();
   const task={day,controller,promise:null};
   task.promise=(async()=>{
     if(document.hidden)await new Promise((resolve,reject)=>{
       const clean=()=>{document.removeEventListener('visibilitychange',visible);controller.signal.removeEventListener('abort',abort);};
       const visible=()=>{if(!document.hidden){clean();resolve();}};
       const abort=()=>{clean();reject(new DOMException('Aborted','AbortError'));};
       document.addEventListener('visibilitychange',visible);controller.signal.addEventListener('abort',abort,{once:true});
     });
     const response=await fetch('/api/panther-signals?'+new URLSearchParams({date:day,sources:'lupus',view:'lupus'}),{cache:'default',signal:controller.signal});
     if(response.status===401){window.location.assign('/login?next=%2Flupus');throw new Error('Please sign in');}
     if(!response.ok)throw new Error('Historical Lupus feed unavailable ('+response.status+')');
     const data=await response.json();
     if(data.date!==day||!data.cuts||Array.isArray(data.cuts))throw new Error('Historical session mismatch');
     if(Object.keys(data.cuts).length){cache.set(day,data);while(cache.size>8)cache.delete(cache.keys().next().value);}
     return data;
   })().finally(()=>{if(pending===task)pending=null;});
   pending=task;return task.promise;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pending?.controller.abort();});
 window.addEventListener('pagehide',()=>pending?.controller.abort());
 return {load,dates,istDate};
})();
