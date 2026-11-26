// Regression test for causal Clean-Runner Maximizer projection, November historical archives,
// and RustyClient star highlight / filter UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import path from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {act,create} from 'react-test-renderer';

const require=createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;

const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('utils/rustyHistory.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Map,Set,Promise,Buffer});
const {projectRustySnapshot}=exports;

// 1. Verify strict causality in projectRustySnapshot (no future leakage before trigger cut)
const crArchive=JSON.parse(fs.readFileSync('data/rusty-clean-runners.json','utf8'));
assert.equal(crArchive.version,1);
assert.equal(crArchive.signals,1026);
assert.equal(crArchive.sessions,50);
const nov2Cr=crArchive.dates['2026-11-02'];
assert.deepEqual(nov2Cr.bull.DIXON,['09:35',1,'T1_SUPER_SQUEEZE',19.5]);

// At 09:30 (before DIXON's 09:35 trigger), DIXON MUST NOT carry cr_tier
const preTrigger=projectRustySnapshot({cut:'09:30',bull:[{s:'DIXON',flow_label:'PE OI Rising'}]},undefined,nov2Cr);
assert.equal('cr_tier' in preTrigger.bull[0],false,'No future leakage before trigger cut 09:35');

// At 09:35 (exact trigger cut), DIXON MUST carry cr_tier=1, cr_lane='T1_SUPER_SQUEEZE', cr_cut='09:35'
const atTrigger=projectRustySnapshot({cut:'09:35',bull:[{s:'DIXON',flow_label:'PE OI Rising'}]},undefined,nov2Cr);
assert.equal(atTrigger.bull[0].cr_tier,1);
assert.equal(atTrigger.bull[0].cr_lane,'T1_SUPER_SQUEEZE');
assert.equal(atTrigger.bull[0].cr_cut,'09:35');
assert.equal(atTrigger.bull[0].cr_score,19.5);

// At 10:15 (after trigger cut), DIXON retains sticky Clean-Runner label
const postTrigger=projectRustySnapshot({cut:'10:15',bull:[{s:'DIXON',flow_label:'PE OI Rising'}]},undefined,nov2Cr);
assert.equal(postTrigger.bull[0].cr_tier,1);
assert.equal(postTrigger.bull[0].cr_cut,'09:35');

// Live producer native fields take precedence and still enforce cr_cut <= cut causality
const liveFutureGuard=projectRustySnapshot({cut:'09:25',bull:[{s:'LIVE_SYM',cr_tier:1,cr_lane:'T1_SUPER_SQUEEZE',cr_cut:'09:30',cr_score:19.5}]});
assert.equal('cr_tier' in liveFutureGuard.bull[0],false,'Native future cr_cut is blocked');
const liveValid=projectRustySnapshot({cut:'09:30',bull:[{s:'LIVE_SYM',cr_tier:1,cr_lane:'T1_SUPER_SQUEEZE',cr_cut:'09:30',cr_score:19.5}]});
assert.equal(liveValid.bull[0].cr_tier,1);
assert.equal(liveValid.bull[0].cr_lane,'T1_SUPER_SQUEEZE');

// 2. Verify all 14 packaged November Rusty archives (2026-11-02..2026-11-20)
const novManifest=JSON.parse(fs.readFileSync('data/rusty-november/manifest.json','utf8'));
assert.equal(novManifest.sessions.length,14,'All 14 November trading sessions packaged');
for(const session of novManifest.sessions){
  const raw=zlib.gunzipSync(fs.readFileSync(path.join('data/rusty-november',session.file)));
  const data=JSON.parse(raw.toString('utf8'));
  assert.equal(data.version,1);
  assert.equal(data.date,session.date);
  assert.equal(data.snapshots.length,75,`Full 75 cuts for ${session.date}`);
}

// 3. Verify React rendering of ★T1 badge and Clean Runner filter in RustyClient
const load=(file,deps={})=>{
  const modExports={};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports:modExports,Date,Intl,URLSearchParams,AbortController,DOMException,Map,Set,console,
    document:{hidden:false,addEventListener(){},removeEventListener(){}},
    window:{addEventListener(){},removeEventListener(){},location:{assign(){}}},
    requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    setTimeout:()=>1,clearTimeout(){},
    require:name=>name in deps?deps[name]:require(name)});
  return modExports;
};
const RustyClient=load('app/rusty/RustyClient.tsx',{
  '@/utils/backend':{buildTradingChartsUrl:s=>'https://test.invalid/'+s},
  '@/utils/chartWatchlist':{readChartWatchlist:()=>[],addChartWatchlistSymbol:s=>[s],CHART_WATCHLIST_STORAGE_KEY:'test',CHART_WATCHLIST_UPDATED_EVENT:'test'},
  './sectors.json':{},'./rusty.css':{},
}).default;

const snaps=[
  projectRustySnapshot({cut:'09:30',bull:[{s:'DIXON',flow_label:'PE OI Rising',oi_bias:15,mv:2.1},{s:'OTHER',flow_label:'PE OI Rising',oi_bias:10,mv:1.2}],bear:[]},undefined,nov2Cr),
  projectRustySnapshot({cut:'09:35',bull:[{s:'DIXON',flow_label:'PE OI Rising',oi_bias:18,mv:2.8},{s:'OTHER',flow_label:'PE OI Rising',oi_bias:10,mv:1.2}],bear:[]},undefined,nov2Cr),
];
let root;
await act(async()=>{root=create(React.createElement(RustyClient,{snaps,dateStr:'2026-11-02'}));});
// Default cut is latest (09:35), where DIXON is triggered
assert.equal(root.root.findAllByProps({'aria-label':'DIXON Clean Runner Tier 1'}).length,1,'DIXON shows ★T1 star at 09:35');
// Filter to ★ Clean Runners only
await act(async()=>root.root.findByProps({'aria-label':'bull Clean Runner filter'}).props.onChange({target:{value:'ALL'}}));
assert.deepEqual(root.root.findAllByProps({className:'stock-name'}).map(n=>n.children.join('')),['DIXON']);
// Step back to 09:30 cut -> DIXON has not triggered yet, so Clean Runner filter shows 0 stocks
await act(async()=>root.root.findByProps({'aria-label':'Previous snapshot'}).props.onClick());
assert.equal(root.root.findAllByProps({className:'stock-name'}).length,0,'Zero future leakage at 09:30 cut in UI');
await act(async()=>root.unmount());
console.log('PASS: 1,026 Clean-Runner causal projection, 14 November 75-cut archives, zero future leakage before trigger cut, and ★T1 UI badge/filter.');
