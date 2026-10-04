import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {foldPallas,PALLAS_DATES,pallasAiScore,passesPallasAi} from '../utils/pallas.ts';
const counts=[10,47,43,17,19];
const aiCounts=[4,44,1,2,3];
for(const [i,date] of PALLAS_DATES.entries()){
 const docs=JSON.parse(await fs.readFile(`data/pallas/${date}.json`,'utf8'));
 const end=Date.parse(`${date}T11:30:00+05:30`);
 assert.equal(foldPallas(docs,date,end).signals.length,counts[i]);
 const events=foldPallas(docs,date,end).signals;
 assert.equal(events.filter(s=>passesPallasAi(s)).length,aiCounts[i]);
 assert.ok(events.every(s=>pallasAiScore(s)!==null&&s.AI_Scored_At===s.Issued_At));
 for(let m=555;m<=690;m+=5){
  const hm=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
  const limit=Date.parse(`${date}T${hm}:00+05:30`),full=foldPallas(docs,date,limit,'TEST');
  const prefix=docs.filter(d=>Date.parse(d.available_at)<=limit);
  assert.deepEqual(full,foldPallas(prefix,date,limit,'TEST'));
  assert.ok(full.signals.every(s=>Date.parse(s.Issued_At)<=limit));
 }
 console.log(`PASS ${date}: ${counts[i]} signals, all 28 causal prefixes`);
}
const date=PALLAS_DATES[0],docs=JSON.parse(await fs.readFile(`data/pallas/${date}.json`,'utf8'));
const original=docs.find(d=>d.kind==='CONFIRMED'),event=original.signals[0];
const changed={...original,Doc_ID:'late-duplicate',available_at:date+'T11:29:00+05:30',signals:[{...event,Reference_Premium:99999}]};
assert.equal(foldPallas([...docs,changed],date,Date.parse(date+'T11:30:00+05:30')).signals.find(s=>s.Event_ID===event.Event_ID).Reference_Premium,event.Reference_Premium);
console.log('PASS duplicate documents preserve frozen reference premium');
const duplicate={...changed,Doc_ID:'ai-duplicate',signals:[{...event,AI_Score:1}]};
assert.equal(foldPallas([...docs,duplicate],date,Date.parse(date+'T11:30:00+05:30')).signals.find(s=>s.Event_ID===event.Event_ID).AI_Score,event.AI_Score);
for(const mutation of [{AI_Score:null},{AI_Score:NaN},{AI_Score:1.01},{AI_Model_ID:null},
 {AI_Status:'FEATURES_UNAVAILABLE'},{AI_Scored_At:date+'T15:30:00+05:30'},{Event_Type:'EARLY_TICK'}]){
 assert.equal(pallasAiScore({...event,...mutation}),null);
 assert.equal(passesPallasAi({...event,...mutation}),false);
}
assert.equal(pallasAiScore({...event,AI_Score:0}),0);
assert.equal(passesPallasAi({...event,AI_Score:.70}),true);
console.log('PASS AI timing, missing/zero scores, early-alert exclusion and frozen duplicates');
