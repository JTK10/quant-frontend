import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {foldPallas,PALLAS_DATES} from '../utils/pallas.ts';
const counts=[10,47,43,17,19];
for(const [i,date] of PALLAS_DATES.entries()){
 const docs=JSON.parse(await fs.readFile(`data/pallas/${date}.json`,'utf8'));
 const end=Date.parse(`${date}T11:30:00+05:30`);
 assert.equal(foldPallas(docs,date,end).signals.length,counts[i]);
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
