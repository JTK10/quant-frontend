// Render the real feed AND board with React, including state updates. No browser,
// network, credentials or production service is used by this regression test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {act,create} from 'react-test-renderer';
const require=createRequire(import.meta.url);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const clock=Date.parse('2026-10-13T10:00:00+05:30');
let now=clock,id=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const timers=new Map(),listeners=new Set(),requests=[];
const document={hidden:false,addEventListener:(_event,fn)=>listeners.add(fn),removeEventListener:(_event,fn)=>listeners.delete(fn)};
const timer=(fn,ms)=>{const key=++id;timers.set(key,{fn,due:now+ms});return key;};
const load=(file,deps={})=>{
 const exports={};
 const source=file==='app/rusty/RustyFeed.tsx'?(process.env.RUSTY_FEED_SOURCE??file):file;
 const code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{exports,Date:Clock,Intl,URLSearchParams,AbortController,DOMException,Map,Set,console,document,
  window:{addEventListener(){},removeEventListener(){},location:{assign(){}}},
  requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  setTimeout:timer,clearTimeout:key=>timers.delete(key),setInterval:timer,clearInterval:key=>timers.delete(key),
  fetch:(url,opt)=>new Promise((resolve,reject)=>{requests.push({url,opt,resolve});opt.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});}),
  require:name=>name in deps?deps[name]:require(name)});
 return exports;
};
const policy=load('utils/sessionPolling.ts');
const rusty=load('utils/rustyFeed.ts',{'./sessionPolling':policy});
const shortlists=load('app/sol/bullShortlist.ts');
const client=load('app/sol/SolClient.tsx',{
 '@/utils/backend':{buildTradingViewUrl:s=>'https://test.invalid/'+s},
 '@/utils/chartWatchlist':{readChartWatchlist:()=>[],addChartWatchlistSymbol:s=>[s],CHART_WATCHLIST_STORAGE_KEY:'test',CHART_WATCHLIST_UPDATED_EVENT:'test'},
 '../rusty/sectors.json':{},'./sol.css':{},'./bullShortlist':shortlists,
}).default;
const router={replace(){throw Error('History must not navigate');}};
const Feed=load('app/rusty/RustyFeed.tsx',{
 'next/navigation':{useRouter:()=>router},'@/components/Controls':{DatePicker:()=>null},
 '@/utils/sessionPolling':policy,'@/utils/rustyFeed':rusty,'./RustyClient':client,
}).default;
let root;
await act(async()=>{root=create(React.createElement(Feed,{dateStr:'2026-10-12',followToday:false,Board:client,pagePath:'/sol'}));});
const cuts=['09:15','09:20','09:25','09:30','09:35','09:40'];
const snapshot=cut=>({source:'rusty',cut,bull:[{s:'BULL_'+cut,mv:1,pe_pct:20,flow_label:'PE OI Rising',oi_bias:20}],bear:[{s:'BEAR_'+cut,mv:-1,ce_pct:30,flow_label:'CE OI Rising',oi_bias:30}]});
const respond=async(index,cut,{fail=false,wrong=false}={})=>act(async()=>{
 requests[index].resolve({ok:!fail,status:fail?503:200,json:async()=>fail?{error:'offline'}:{snapshots:[snapshot(wrong?'09:40':cut)],cuts}});
});
const step=async ms=>act(async()=>{
 now+=ms;
 for(const[key,t]of[...timers])if(t.due<=now){timers.delete(key);t.fn();}
});
const slider=()=>root.root.findByProps({'aria-label':'Snapshot timeline'});
const select=async index=>act(async()=>{slider().props.onChange({target:{value:String(index)}});});
const labels=()=>root.root.findAllByProps({className:'stock-name'}).map(n=>n.children.join('')).sort();
const text=()=>JSON.stringify(root.toJSON());
const assertBoard=cut=>{
 assert.deepEqual(labels(),['BEAR_'+cut,'BULL_'+cut],`Both boards show selected cut ${cut}`);
 assert.equal(root.root.findByProps({'aria-label':'Snapshot time'}).props.value,cut);
};
await respond(0,'09:40');assertBoard('09:40');

// A continuous drag should make a single request for the final time.
await select(0);await step(50);await select(1);await step(50);await select(2);
assert.equal(requests.length,1);assert.equal(labels().length,0,'Never label the latest board as an unloaded historical time');
assert.match(text(),/Waiting for snapshot 09:25/);await step(199);assert.equal(requests.length,1);
await step(1);assert.equal(requests.length,2);assert.match(requests[1].url,/cut=09%3A25/);
assert.equal(requests[1].opt.cache,'default','Dragging honors private browser cache');
await respond(1,'09:25');assertBoard('09:25');

// A slower old response cannot replace the user's final selection.
await select(0);await step(200);assert.equal(requests.length,3);
await select(1);await step(200);assert.equal(requests.length,4,'A newer cut starts immediately after aborting the old request');
assert.equal(requests[2].opt.signal.aborted,true,'Slow old cut cannot block a new selection');
await respond(2,'09:15');assert.equal(labels().length,0,'An aborted response cannot masquerade as selected 09:20');
assert.equal(requests.length,4);assert.match(requests[3].url,/cut=09%3A20/);
await respond(3,'09:20');assertBoard('09:20');
await select(2);assertBoard('09:25');
await step(200);assert.equal(requests.length,4,'Visited snapshots update immediately without a request');

// Returning to a cached cut cancels a queued missing cut.
await select(3);await step(200);await select(4);await step(50);
await select(2);assertBoard('09:25');await respond(4,'09:30');assertBoard('09:25');
assert.equal(requests.length,5,'No obsolete queued request after returning to a loaded cut');

// Failures are explicit and Refresh retries the selected historical cut.
await select(4);await step(200);await respond(5,'09:35',{fail:true});
assert.match(text(),/offline/);assert.equal(labels().length,0);
await act(async()=>root.root.findAllByType('button').find(n=>n.children.join('')==='Refresh').props.onClick());
assert.match(requests[6].url,/cut=09%3A35/);assert.equal(requests[6].opt.cache,'reload');
await respond(6,'09:35');assertBoard('09:35');

// A missing time chosen while hidden is fetched once when the tab returns.
await act(async()=>{document.hidden=true;for(const fn of listeners)fn();});
// 09:30 was loaded by the earlier slow request; use a fresh mount for this case.
await act(async()=>root.unmount());assert.equal(timers.size,0);
requests.length=0;
await act(async()=>{root=create(React.createElement(Feed,{dateStr:'2026-10-12',followToday:false,Board:client,pagePath:'/sol'}));});
assert.equal(requests.length,0,'No initial request in a hidden tab');
await act(async()=>{document.hidden=false;for(const fn of listeners)fn();});
await respond(0,'09:40');await select(0);
await act(async()=>{document.hidden=true;for(const fn of listeners)fn();});await step(200);
assert.equal(requests.length,1);
await act(async()=>{document.hidden=false;for(let i=0;i<4;i++)for(const fn of listeners)fn();});
assert.equal(requests.length,2,'Pending historical selection resumes once despite focus storms');
await respond(1,'09:15');assertBoard('09:15');

// A success envelope containing a different cut is not accepted as a match.
await select(1);await step(200);await respond(2,'09:20',{wrong:true});
assert.match(text(),/Requested Rusty snapshot is unavailable/);assert.equal(labels().length,0);
await act(async()=>{for(let i=0;i<4;i++){document.hidden=true;for(const fn of listeners)fn();document.hidden=false;for(const fn of listeners)fn();}});
assert.equal(requests.length,3,'Failed history requires an explicit retry, not repeated tab-focus requests');

// History does not poll on idle/focus; navigation to Latest is local.
await act(async()=>root.root.findAllByType('button').find(n=>n.children.join('')==='Jump to latest').props.onClick());
assertBoard('09:40');await step(3600000);
await act(async()=>{document.hidden=true;for(const fn of listeners)fn();document.hidden=false;for(const fn of listeners)fn();});
assert.equal(requests.length,3);
await act(async()=>root.unmount());assert.equal(timers.size,0);assert.equal(listeners.size,0);
console.log('PASS: real React Sol using shared Rusty transport slider updates both boards, coalesces drags, handles slow/out-of-order requests, reuses visited cuts, cancels obsolete selections, retries the selected cut and keeps history idle.');

const rows=Array.from({length:12},(_,i)=>({s:'STOCK_'+i,c_rvol:12-i,ce_pct:-12+i,pe_pct:i+1}));
rows.push({s:'NO_RVOL',ce_pct:-100,pe_pct:100},{s:'NEGATIVE_PE',c_rvol:30,ce_pct:1,pe_pct:-10});
const bulls=shortlists.bullShortlists(rows,5,'bull');
assert.equal(bulls.ce.length,5);assert.equal(bulls.pe.length,5);
assert.ok(bulls.ce.every(r=>r.ce_pct<0&&r.c_rvol>0));
assert.ok(bulls.pe.every(r=>r.pe_pct>0&&r.c_rvol>0));
assert.equal(new Set(bulls.both.map(r=>r.s)).size,bulls.both.length);assert.ok(bulls.both.length<=10);
const bears=shortlists.bullShortlists(rows,5,'bear');
assert.ok(bears.ce.every(r=>r.ce_pct>0));assert.ok(bears.pe.every(r=>r.pe_pct<0));
assert.deepEqual(shortlists.bullShortlists([{s:'POSITIVE_CE',c_rvol:2,ce_pct:100,pe_pct:1}],5,'bull').pe.map(r=>r.s),['POSITIVE_CE'],'PE preset keeps rolled-back no-CE-restriction rule');
await act(async()=>{root=create(React.createElement(client,{snaps:[{cut:'10:00',bull:rows,bear:rows}],dateStr:'2026-11-06'}));});
assert.equal(root.root.findAllByProps({className:'flow-panel'}).length,2);
assert.equal(root.root.findAllByType('h3').map(n=>n.children.join('')).join('|'),'All Bulls|All Bears');
assert.ok(!text().includes('Own OI lines'),'Local-only overlays not exposed as live filters');
const clickPreset=async(side,index)=>act(async()=>{const section=root.root.findByProps({'aria-label':side+' board'});section.findByProps({className:'shortlist-presets'}).findAllByType('button')[index].props.onClick();});
await clickPreset('Bull',3);
const stockNodes=side=>root.root.findByProps({'aria-label':side+' board'}).findAllByProps({className:'stock-name'});
assert.equal(stockNodes('Bull').length,bulls.both.length);
assert.equal(stockNodes('Bear').length,rows.length,'Bull preset preserves bear rows');
await clickPreset('Bear',2);assert.equal(stockNodes('Bear').length,bears.pe.length);
await act(async()=>root.root.findByProps({'aria-label':'bull stocks per shortlist'}).props.onChange({target:{value:'2'}}));
assert.equal(stockNodes('Bull').length,shortlists.bullShortlists(rows,2,'bull').both.length);
assert.equal(root.root.findByProps({'aria-label':'bear stocks per shortlist'}).props.value,5,'Per-side counts independent');
await act(async()=>root.unmount());
console.log('PASS: Sol two-board presets, independent counts, signs, missing RVOL, duplicate removal and unchanged PE eligibility.');


// Combine fixes membership first; table ordering then follows all visible sorts.
const sortBulls=[
 {s:'A',c_rvol:7,ce_pct:-9,pe_pct:1,oi_bias:3,mv:1.5},
 {s:'B',c_rvol:10,ce_pct:-2,pe_pct:8,oi_bias:8,mv:.5},
 {s:'C',c_rvol:5,ce_pct:-4,pe_pct:3,oi_bias:2,mv:2},
 {s:'D',c_rvol:8,ce_pct:1,pe_pct:7,oi_bias:5,mv:.8},
 {s:'E',c_rvol:2,ce_pct:-1,pe_pct:-2,oi_bias:1,mv:3},
];
const sortBears=sortBulls.map(r=>({...r,ce_pct:-r.ce_pct,pe_pct:-r.pe_pct,mv:-r.mv}));
const selected={Bull:shortlists.bullShortlists(sortBulls,3,'bull'),Bear:shortlists.bullShortlists(sortBears,3,'bear')};
await act(async()=>{root=create(React.createElement(client,{snaps:[{cut:'10:00',bull:sortBulls,bear:sortBears}],dateStr:'2026-11-06'}));});
const selectedSection=side=>root.root.findByProps({'aria-label':side+' board'});
const orderedNames=side=>stockNodes(side).map(n=>n.children.join(''));
const members=side=>[...orderedNames(side)].sort();
const requestCount=requests.length;
for(const side of ['Bull','Bear']){
 await act(async()=>root.root.findByProps({'aria-label':side.toLowerCase()+' stocks per shortlist'}).props.onChange({target:{value:'3'}}));
 await clickPreset(side,3);
 const expected=[...selected[side].both];
 assert.deepEqual(members(side),expected.map(r=>r.s).sort(),side+' Combine keeps deduplicated chosen members');
 assert.equal(selectedSection(side).findAllByProps({className:'shortlist-legend'}).length,1,side+' Combine explains categories');
 for(const row of selectedSection(side).findAllByType('tr').filter(row=>row.findAllByProps({className:'stock-name'}).length)){
  const symbol=row.findByProps({className:'stock-name'}).children.join('');
  const ce=selected[side].ce.some(r=>r.s===symbol),pe=selected[side].pe.some(r=>r.s===symbol);
  const badges=row.findByProps({className:'selection-badges'});
  assert.equal(badges.findAllByProps({className:'selection-ce'}).length,Number(ce),symbol+' CE membership badge');
  assert.equal(badges.findAllByProps({className:'selection-pe'}).length,Number(pe),symbol+' PE membership badge');
  const rowType=ce&&pe?'selection-both-row':ce?'selection-ce-row':'selection-pe-row';
  assert.ok(String(row.props.className).split(/\s+/).includes(rowType),symbol+' category accent matches membership');
 }
 const assertOrder=(key,descending)=>{
  const wanted=[...expected].sort((a,b)=>(descending?b[key]-a[key]:a[key]-b[key])||a.s.localeCompare(b.s)).map(r=>r.s);
  assert.deepEqual(orderedNames(side),wanted,side+' Combine sorts '+key+' '+(descending?'descending':'ascending'));
  assert.deepEqual(members(side),expected.map(r=>r.s).sort(),'Sorting never reselects the shortlist');
 };
 for(const [heading,key]of [['CE %','ce_pct'],['PE %','pe_pct'],['Candle RVOL','c_rvol'],['Move %','mv']]){
  const button=()=>selectedSection(side).findByProps({'aria-label':`Sort All ${side}s by ${heading}`});
  await act(async()=>button().props.onClick());assertOrder(key,true);
  await act(async()=>button().props.onClick());assertOrder(key,false);
 }
 await act(async()=>root.root.findByProps({'aria-label':side.toLowerCase()+' sort'}).props.onChange({target:{value:'c_rvol'}}));
 assertOrder('c_rvol',true);
 await act(async()=>root.root.findByProps({'aria-label':side.toLowerCase()+' sort direction'}).props.onClick());
 assertOrder('c_rvol',false);
}
assert.equal(requests.length,requestCount,'Combine selection, headers and sort controls make no network requests');
await clickPreset('Bull',2);
assert.equal(selectedSection('Bull').findAllByProps({className:'shortlist-legend'}).length,0,'Combined legend hides outside Combine');
await act(async()=>root.unmount());
console.log('PASS: Combine membership survives both-direction column/dropdown sorting on both boards; CE/PE overlap badges and legend are accurate with no network requests.');
