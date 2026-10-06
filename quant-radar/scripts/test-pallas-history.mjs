import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {foldPallas,pallasEngineLabel,pallasAiPassLabel,passesPallasAi} from '../utils/pallas.ts';
import {pallasAsOf,pallasPreviousWeekday,pallasSessionRollover} from '../utils/pallasTime.ts';

const now=Date.parse('2026-10-07T10:00:00+05:30');
assert.equal(pallasPreviousWeekday(now),'2026-10-06');
assert.equal(pallasPreviousWeekday(Date.parse('2026-10-05T10:00:00+05:30')),'2026-10-02');
assert.equal(pallasSessionRollover('history','2026-10-05',now),null);
assert.equal(pallasAsOf('history','2026-10-06',null,now),Date.parse('2026-10-06T23:59:59.999+05:30'));
assert.equal(pallasAsOf('history','2026-10-07',null,now),now);
assert.equal(pallasAsOf('research','2026-10-01',null,now),Date.parse('2026-10-01T11:30:00+05:30'));
const base={Event_ID:'late',Symbol:'TEST',Event_Type:'CONFIRMED_CLOSE',Issued_At:'2026-10-06T14:00:00+05:30',AI_Scored_At:'2026-10-06T14:00:00+05:30',AI_Model_ID:'legacy',AI_Status:'SCORED',AI_Score:.7};
assert.equal(pallasEngineLabel({...base,AI_Submodel:'pallas_pdh_break_ai'}).label,'Engine 3 · PDH/PDL');
assert.equal(pallasEngineLabel({...base,Pattern_Type:'PDH_BREAK_FLAG'}).label,'Engine 1 · Standard');
assert.equal(pallasEngineLabel({...base,Pattern_Type:'CASCADE'}).label,'Engine 2 · Reverse/Cascade');
assert.equal(pallasEngineLabel(base).label,'Legacy AI · engine unreported');
assert.equal(pallasAiPassLabel(base),'AI passed ≥70');
assert.equal(pallasAiPassLabel({...base,AI_Score:.699}),'Below 70');
assert.equal(pallasAiPassLabel({...base,AI_Scored_At:'2026-10-06T14:00:01+05:30'}),'AI unavailable');
const doc={source:'pallas',sig_date:'20261006',Doc_ID:'late',kind:'EVENT',available_at:base.Issued_At,signals:[base,{...base,Event_ID:'another'}]};
assert.equal(foldPallas([doc],'2026-10-06',pallasAsOf('history','2026-10-06',null,now)).signals.length,2);
assert.equal(foldPallas([doc],'2026-10-06',pallasAsOf('research','2026-10-06',null,now)).signals.length,0);
assert.match(fs.readFileSync('app/page.tsx','utf8'),/redirect\("\/rusty"\)/);
const ui=fs.readFileSync('app/pallas/PallasClient.tsx','utf8');
assert.match(ui,/mode==='history'\?\(data\?\.signals\?\?\[\]\)/);
assert.match(ui,/type="date" aria-label="Historical session"/);
assert.doesNotMatch(ui,/signals\.slice\(/);
if(process.env.PALLAS_HISTORY_FIXTURES){
  for(const [date,count] of [['2026-10-05',34],['2026-10-06',29]]){
    const docs=JSON.parse(fs.readFileSync(path.join(process.env.PALLAS_HISTORY_FIXTURES,date+'.json'),'utf8'));
    const result=foldPallas(docs,date,pallasAsOf('history',date,null,now));
    const confirmed=result.signals.filter(s=>s.Event_Type==='CONFIRMED_CLOSE');
    assert.equal(confirmed.length,count);
    assert.equal(new Set(result.signals.map(s=>s.Event_ID)).size,result.signals.length);
    console.log(`${date}: ${docs.length} documents, ${confirmed.length} confirmed, ${confirmed.filter(s=>passesPallasAi(s)).length} AI ≥70`);
  }
}
console.log('PASS full-session history, repeated stock alerts, original scores, engine labels and date selection');
