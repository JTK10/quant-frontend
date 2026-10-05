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
