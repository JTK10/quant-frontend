import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pallasOiCrossed} from '../utils/pallas.ts';

assert.equal(pallasOiCrossed('BULL',501,500),true);
assert.equal(pallasOiCrossed('BULL',500,500),true);
assert.equal(pallasOiCrossed('BULL',499,500),false);
assert.equal(pallasOiCrossed('BEAR',499,500),true);
assert.equal(pallasOiCrossed('BEAR',500,500),true);
assert.equal(pallasOiCrossed('BEAR',501,500),false);
for(const line of [null,undefined,NaN,Infinity,0,-1,'500'])assert.equal(pallasOiCrossed('BULL',501,line),null);
for(const spot of [null,undefined,NaN,Infinity,0,-1,'501'])assert.equal(pallasOiCrossed('BEAR',spot,500),null);
assert.equal(pallasOiCrossed('UNKNOWN',501,500),null);
if(process.env.PALLAS_HISTORY_FIXTURES){
  for(const date of ['2026-10-05','2026-10-06']){
    const docs=JSON.parse(fs.readFileSync(`${process.env.PALLAS_HISTORY_FIXTURES}/${date}.json`,'utf8'));
    const seen=new Set();let available=0,crossed=0;
    for(const doc of docs)for(const s of doc.signals??[]){
      if(s.Event_Type!=='CONFIRMED_CLOSE'||seen.has(s.Event_ID))continue;
      seen.add(s.Event_ID);const value=pallasOiCrossed(s.Side,s.Breakout_Spot,s.Prior_OI_Line);
      if(value!==null)available++;if(value)crossed++;
    }
    console.log(`${date}: ${seen.size} confirmed; ${available} have prior lines; ${crossed} cross in their signal direction`);
  }
}
console.log('PASS bull/bear OI crossing, equality and unavailable-value handling');
