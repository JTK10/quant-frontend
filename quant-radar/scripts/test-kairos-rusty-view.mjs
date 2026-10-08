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
const asOf=Date.parse('2026-10-08T09:31:00+05:30');
const entry={source:'kairos_rusty',kind:'ENTRY',signal_id:'test',ts:asOf/1000-10,
  time:'09:30:50',name:'EXAMPLE 102 CE',side:'LONG',expiry:'2026-10-27',entry:100,
  entry_fill:100,quantity:300,lots:3,capital_used:30000,stop_premium:85,stop_pct:-15,
  rusty_pct:-35.4,rusty_rank:2,ce_pct:-35.4,pe_pct:12,flow_type:'CE_DOWN_PE_UP',
  flow_label:'CE OI Down + PE OI Up',c_time:'09:25',candle_tier:'MARUBOZU'};
function render(engine,events) {
  return renderToStaticMarkup(React.createElement(Client,{events,engine,dateStr:'2026-10-08',asOf}));
}
const html=render('kairos_rusty',[entry,{...entry,kind:'MTM',ts:asOf/1000,entry:101,pnl:300}]);
for(const value of ['Rusty selection','RUSTY OI','CE OI Down + PE OI Up','MARUBOZU','09:25','−15%']) assert.ok(html.includes(value),value);
assert.ok(!html.includes('PALLAS AI'));
assert.ok(!html.includes('Minimum score'));
assert.ok(!html.includes('AI SCORE'));
assert.ok(html.includes('PREMIUM STOP'));
const closed=render('kairos_rusty',[entry,{...entry,kind:'EXIT',ts:asOf/1000,time:'11:30:05',entry:110,pnl:3000,reason:'TIME_EXIT_1130'}]);
assert.ok(closed.includes('09:30:50 → 11:30:05'));
assert.ok(closed.includes('-35.40%'));
const standby=render('kairos_rusty',[]);
assert.ok(standby.includes('fresh Rusty confirmed-entry label'));
assert.ok(render('kairos2',[]).includes('PALLAS AI'));
assert.ok(render('kairos',[]).includes('UNDERLYING') === false);
assert.ok(!render('kairos',[]).includes('Rusty selection'));
console.log('Rendered Rusty open/closed/standby views show native OI; Pallas and Classic remain separate.');
