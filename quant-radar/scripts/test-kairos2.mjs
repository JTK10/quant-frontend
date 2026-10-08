import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

function moduleFrom(path) {
  const exports={};
  const localRequire=createRequire(new URL('../'+path,import.meta.url));
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true}}).outputText,{exports,require:localRequire,console,URL,Intl,Date});
  return exports;
}
// createRequire avoids a browser dependency; this tests the real row grouping.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {kairosSummary,kairosNumber}=moduleFrom('utils/kairos.ts');
const legacy={source:'kairos',signal_id:'same',name:'OLD',kind:'ENTRY',ts:1};
const newer={source:'kairos2',signal_id:'same',name:'NEW',kind:'ENTRY',ts:2,quantity:200,lots:2,capital_used:20500,ai_score:.8};
const rows=[legacy,newer,{...legacy,kind:'MTM',ts:3,pnl:10},{...newer,kind:'MTM',ts:4,pnl:40},{...newer,kind:'MTM',ts:5,pnl:60},
  {source:'kairos2',kind:'HEALTH',ts:6,status:'Paper position open'},{source:'kairos2',kind:'SKIP',ts:0,name:'SKIP'}];
const a=kairosSummary(rows,'kairos'),b=kairosSummary(rows,'kairos2');
assert.equal(a.open.length,1);assert.equal(a.unrealized,10);
assert.equal(b.open.length,1);assert.equal(b.unrealized,60);assert.equal(b.health.status,'Paper position open');
assert.equal(b.open[0].entry.quantity,200);assert.equal(b.open[0].entry.capital_used,20500);assert.equal(b.skips.length,1);
const c=kairosSummary([...rows,{...newer,kind:'EXIT',ts:7,pnl:100,entry_fill:102.5,entry:103}], 'kairos2');
assert.equal(c.open.length,0);assert.equal(c.realized,100);assert.equal(c.unrealized,0);
assert.equal(kairosNumber(null),null);assert.equal(kairosNumber(''),null);assert.equal(kairosNumber(true),null);assert.equal(kairosNumber(0),0);
const {normalizePantherSignals}=moduleFrom('utils/backend.ts');
const n=normalizePantherSignals([{...newer,mode:'paper',side:'LONG',stop_premium:87,quote_at:'2026-10-05T10:00:00+05:30',Doc_ID:'immutable'}])[0];
assert.equal(n.ai_score,.8);assert.equal(n.quantity,200);assert.equal(n.lots,2);assert.equal(n.stop_premium,87);assert.equal(n.Doc_ID,'immutable');
console.log('Kairos 2.0 source isolation, latest marks, P&L and API-field preservation passed.');
const rusty={source:'kairos_rusty',cap:'KAIROS_RUSTY',signal_id:'same',kind:'ENTRY',ts:8,
  name:'RUSTY OPTION',mode:'paper',rusty_pct:-35.4,rusty_rank:2,ce_pct:-35.4,pe_pct:12,
  flow_type:'CE_DOWN_PE_UP',flow_label:'CE OI Down + PE OI Up',signal_source:'rusty',
  entry_confirmed:true,c_time:'09:25',c_open:100,c_high:101.1,c_low:99.9,c_close:101,
  candle_tier:'MARUBOZU',quantity:100,lots:1,capital_used:10000,stop_premium:85};
const rustyNormalized=normalizePantherSignals([rusty])[0];
for(const key of ['rusty_pct','rusty_rank','ce_pct','pe_pct','flow_type','flow_label','signal_source',
  'entry_confirmed','c_time','c_open','c_high','c_low','c_close','candle_tier']) assert.equal(rustyNormalized[key],rusty[key]);
const all=[...rows,rustyNormalized,{...rustyNormalized,kind:'MTM',ts:9,pnl:123}];
assert.equal(kairosSummary(all,'kairos_rusty').unrealized,123);
assert.equal(kairosSummary(all,'kairos2').unrealized,60);
assert.equal(kairosSummary(all,'kairos').unrealized,10);
assert.equal(kairosSummary(all,'kairos_rusty').open.length,1);
console.log('Rusty native OI fields and three independent bot ledgers passed.');
