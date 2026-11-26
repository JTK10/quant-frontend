import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
function load(path,dependencies={}){
  const exports={};
  const localRequire=createRequire(new URL('../'+path,import.meta.url));
  const requireSource=name=>name in dependencies ? dependencies[name] : localRequire(name);
  const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:requireSource,console,URL,URLSearchParams,Intl,Date});
  return exports;
}
const k=load('utils/kairos.ts');
assert.equal(k.resolveKairosEngine(undefined),'kairos10');
for(const engine of ['kairos','kairos2','kairos_rusty','kairos9','kairos10','kairos29'])assert.equal(k.resolveKairosEngine(engine),engine);
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
const {normalizePantherSignals}=load('utils/backend.ts',{'./tradingCharts':load('utils/tradingCharts.ts')});
const normalized=normalizePantherSignals([{...entry,score_threshold:.3,last_cut:'10:00',initial_stop_pct:-10,runner_exit_buffer_seconds:60}])[0];
assert.equal(normalized.source,'kairos10');assert.equal(normalized.model_id,entry.model_id);assert.equal(normalized.score_threshold,.3);
const ospreyEntry={...entry,source:'kairos29',cap:'KAIROS29',model_id:'kairos29-osprey-fixture'};
const ospreyHealth={source:'kairos29',cap:'KAIROS29',kind:'HEALTH',ts:6,score_threshold:.28,last_decision:{symbol:'TEST',cut:'10:00',reason:'Qualified'}};
const ospreyRows=normalizePantherSignals([...rows,ospreyEntry,{...ospreyEntry,kind:'MTM',ts:2,pnl:8},{...ospreyEntry,kind:'MTM',ts:3,pnl:22},ospreyHealth]);
const ospreyCompact=k.compactKairosEvents(ospreyRows,'kairos29');
assert.equal(ospreyCompact.length,3);assert.equal(k.kairosSource({cap:'KAIROS29'}),'kairos29');
assert.equal(k.kairosSummary(ospreyCompact,'kairos29').unrealized,22);
assert.equal(k.kairosSummary(ospreyCompact,'kairos10').open.length,0);
assert.equal(k.kairosSummary(ospreyCompact,'kairos29').health.score_threshold,.28);
const page=fs.readFileSync('app/kairos/page.tsx','utf8');assert.match(page,/sources=\$\{engine\}/);assert.match(page,/AutoRefresh interval=\{60000\}/);
assert.match(page,/prefetch=\{value === "kairos29" \? false : undefined\}/);
const route=fs.readFileSync('app/api/panther-signals/route.ts','utf8');
assert.match(route,/private, max-age=3600, stale-while-revalidate=86400/);assert.match(route,/private, max-age=15, stale-while-revalidate=30/);
assert.match(route,/requireApiSession/);assert.match(route,/compactKairosEvents\(rows, sourcesParam\)/);
assert.match(route,/return source === "kairos10" \|\| source === "kairos29"/);
assert.match(route,/boundedKairos\?2\*1024\*1024/);assert.match(route,/boundedKairos\?1500/);
const css={'./kairos.module.css':{__esModule:true,default:new Proxy({}, {get:(_,key)=>String(key)})}};
const replayView=load('app/kairos/Kairos29Replay.tsx',css);
const paperView=load('app/kairos/KairosClient.tsx',{...css,'@/utils/kairos':k});
const feedReads=[];
const {default:KairosPage}=load('app/kairos/page.tsx',{
  ...css,
  './Kairos29Replay':replayView,
  './KairosClient':paperView,
  'next/link':()=>null,
  '@/utils/kairos':k,
  '@/components/Controls':{DatePicker:()=>null,AutoRefresh:()=>'Refresh mounted'},
  '@/utils/date':{resolveDate:async searchParams=>(await searchParams).date},
  '@/utils/internalApi':{
    getInternalApiUrl:async path=>path,
    fetchInternalApi:async url=>{
      feedReads.push(url);
      return {ok:true,json:async()=>[ospreyHealth]};
    },
  },
});
const render=async date=>renderToStaticMarkup(await KairosPage({searchParams:{engine:'kairos29',date}}));
const historical=await render('2026-11-02');
assert.match(historical,/Historical cash replay/);assert.match(historical,/DIXON/);
assert.match(historical,/7\.86%/);assert.doesNotMatch(historical,/Refresh mounted|SESSION P&L/);
assert.match(await render('2026-11-05'),/No qualifying pick on this date/);
assert.match(await render('2026-09-05'),/No replay data for this date/);
assert.deepEqual(feedReads,[]);
const launch=await render('2026-11-15');
assert.deepEqual(feedReads,['/api/panther-signals?date=2026-11-15&sources=kairos29']);
assert.match(launch,/POWERED BY OSPREY/);assert.match(launch,/Refresh mounted/);
assert.match(launch,/28 \/ 100/);assert.doesNotMatch(launch,/Historical cash replay|PALLAS AI/);
console.log('Kairos10 default, Kairos29 source isolation, accounting, compaction, stale preservation, date reset, fields and cache budget passed.');
console.log('Kairos29 historical cash replay renders covered, skipped and unavailable dates without a feed read or refresh.');
