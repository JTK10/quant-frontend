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
const client=load('app/rusty/RustyClient.tsx',{
 '@/utils/backend':{buildTradingViewUrl:s=>'https://test.invalid/'+s},
 '@/utils/chartWatchlist':{readChartWatchlist:()=>[],addChartWatchlistSymbol:s=>[s],CHART_WATCHLIST_STORAGE_KEY:'test',CHART_WATCHLIST_UPDATED_EVENT:'test'},
 './sectors.json':{},'./rusty.css':{},
}).default;
const router={replace(){throw Error('History must not navigate');}};
const Feed=load('app/rusty/RustyFeed.tsx',{
 'next/navigation':{useRouter:()=>router},'@/components/Controls':{DatePicker:()=>null},
 '@/utils/sessionPolling':policy,'@/utils/rustyFeed':rusty,'./RustyClient':client,
}).default;
let root;
await act(async()=>{root=create(React.createElement(Feed,{dateStr:'2026-10-12',followToday:false}));});
const cuts=['09:15','09:20','09:25','09:30','09:35','09:40'];
const snapshot=cut=>({source:'rusty',cut,bull:[{s:'BULL_'+cut,mv:1,pe_pct:20}],bear:[{s:'BEAR_'+cut,mv:-1,ce_pct:30}]});
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
await act(async()=>{root=create(React.createElement(Feed,{dateStr:'2026-10-12',followToday:false}));});
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
console.log('PASS: real React Rusty slider updates both boards, coalesces drags, handles slow/out-of-order requests, reuses visited cuts, cancels obsolete selections, retries the selected cut and keeps history idle.');
