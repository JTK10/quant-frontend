import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(path){const exports={};const localRequire=createRequire(new URL('../'+path,import.meta.url));vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true}}).outputText,{exports,require:localRequire,console,URL,Intl,Date});return exports;}
const k=load('utils/kairos.ts');
assert.equal(k.resolveKairosEngine(undefined),'kairos10');
for(const engine of ['kairos','kairos2','kairos_rusty','kairos9','kairos10'])assert.equal(k.resolveKairosEngine(engine),engine);
const entry={source:'kairos10',cap:'KAIROS10',kind:'ENTRY',signal_id:'same',name:'TEST',ts:1,mode:'paper',side:'LONG',entry:10,ai_score:.42,quantity:100,lots:1,capital_used:1000,model_id:'kairos10-aurum-31e54fd760e9'};
const rows=[entry,{...entry,source:'kairos2',cap:'KAIROS2',kind:'MTM',ts:5,pnl:999},
 {...entry,kind:'MTM',ts:2,pnl:10},{...entry,kind:'MTM',ts:3,pnl:20},
 {source:'kairos10',kind:'HEALTH',ts:4,status:'Monitoring',score_threshold:.3}];
const compact=k.compactKairosEvents(rows,'kairos10');
assert.equal(compact.length,3);assert.equal(k.kairosSummary(compact,'kairos10').unrealized,20);
assert.equal(k.kairosSummary(compact,'kairos2').unrealized,0);
const closed=k.kairosSummary([...compact,{...entry,kind:'EXIT',ts:6,pnl:30,entry:10.3,entry_fill:10}],'kairos10');
assert.equal(closed.realized,30);assert.equal(closed.unrealized,0);assert.equal(closed.closed.length,1);
let state=k.updateKairosFeed(null,{key:'kairos10|2026-11-02',asOf:1,events:compact,error:null},'kairos10');
state=k.updateKairosFeed(state,{key:state.key,asOf:2,events:[],error:'Temporary error'},'kairos10');
assert.equal(state.events.length,3);assert.equal(state.lastSuccess,1);
state=k.updateKairosFeed(state,{key:state.key,asOf:3,events:[{source:'kairos10',kind:'HEALTH',ts:7}],error:null},'kairos10');
assert.equal(k.kairosSummary(state.events,'kairos10').open.length,1);
state=k.updateKairosFeed(state,{key:'kairos10|2026-11-03',asOf:4,events:[],error:null},'kairos10');
assert.equal(state.events.length,0);
const {normalizePantherSignals}=load('utils/backend.ts');
const normalized=normalizePantherSignals([{...entry,score_threshold:.3,last_cut:'10:00',initial_stop_pct:-10,runner_exit_buffer_seconds:60}])[0];
assert.equal(normalized.source,'kairos10');assert.equal(normalized.model_id,entry.model_id);assert.equal(normalized.score_threshold,.3);
const page=fs.readFileSync('app/kairos/page.tsx','utf8');assert.match(page,/sources=\$\{engine\}/);assert.match(page,/AutoRefresh interval=\{60000\}/);
const route=fs.readFileSync('app/api/panther-signals/route.ts','utf8');
assert.match(route,/private, max-age=3600, stale-while-revalidate=86400/);assert.match(route,/private, max-age=15, stale-while-revalidate=30/);
assert.match(route,/requireApiSession/);assert.match(route,/compactKairosEvents\(rows,'kairos10'\)/);
console.log('Kairos10 default, source isolation, accounting, compaction, stale preservation, date reset, fields and cache budget passed.');
