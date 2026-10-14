import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
function load(path, dependencies={}) {
  const exports={};
  const customRequire=name=>name in dependencies ? dependencies[name] : require(name);
  const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  vm.runInNewContext(js,{exports,require:customRequire,console,Intl,Date,Map,Set});
  return exports;
}
const kairos=load('utils/kairos.ts');
const styles=new Proxy({}, {get:(_,key)=>String(key)});
const Client=load('app/kairos/KairosClient.tsx',{'@/utils/kairos':kairos,'./kairos.module.css':{__esModule:true,default:styles}}).default;
const asOf=Date.parse('2026-10-14T10:30:00+05:30');
const entry={source:'kairos9',kind:'ENTRY',signal_id:'k9fixture',ts:asOf/1000-900,time:'10:15:00',name:'TEST CE',entry:100,entry_fill:100,quantity:300,lots:3,capital_used:30000,stop_premium:90,stop_pct:-10,ai_score:.5,selection_score:.8,mode:'paper'};
const mark={...entry,kind:'MTM',ts:asOf/1000-300,time:'10:25:00',entry:109,pnl:2600};
const exit={...entry,kind:'EXIT',ts:asOf/1000,time:'10:30:00',entry:99,pnl:-380,reason:'TRAILING_STOP threshold=15%'};
const render=events=>renderToStaticMarkup(React.createElement(Client,{events,engine:'kairos9',dateStr:'2026-10-14',asOf}));
const open=render([entry,mark]);const closed=render([entry,mark,exit]);
for(const text of ['Kairos9 research model','35,000','100.00','109.00','300','45-minute','15:20','Exit ML disabled'])assert.ok(open.includes(text),text);
assert.ok(closed.includes('99.00'));assert.ok(closed.includes('10:15:00 → 10:30:00'));
assert.ok(!open.includes('PALLAS AI'));assert.ok(!open.includes('70%'));assert.ok(!open.includes('11:30'));
const summary=kairos.kairosSummary([entry,mark,exit,{...entry,source:'kairos2',kind:'EXIT',pnl:99999}],'kairos9');
assert.equal(summary.realized,-380);assert.equal(summary.closed.length,1);
const health={source:'kairos9',kind:'HEALTH',ts:asOf/1000,status:'Outside regular session',daily_entries:0,metadata_attempts:1,last_failure:{symbol:'DIVISLAB',cut:'10:10',reason:'Broker metadata HTTP 403'},last_decision:{symbol:'DIVISLAB',cut:'10:10',reason:'Metadata failed; cut skipped'}};
const audited=render([health,{source:'kairos9',kind:'SKIP',name:'DIVISLAB',time:'10:10:30',ts:asOf/1000,reason:'Metadata failed; daily entry remains available'}]);
assert.ok(audited.includes('Broker metadata HTTP 403'));assert.ok(audited.includes('Metadata attempts:'));assert.ok(audited.includes('Latest skip DIVISLAB'));
console.log('PASS: Kairos9 ENTRY/MTM/EXIT schema, strategy/source isolation and failure/skip visibility');
