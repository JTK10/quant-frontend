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

const make=(prefix,label,n)=>Array.from({length:n},(_,i)=>({s:prefix+i,flow_label:label,oi_bias:100-i,mv:1,ce_pct:2,pe_pct:3,candle_tier:'SOLID',tgt_pct:1.5,ls:'OR',brk:true,oi_broken:i%2===0,oi_break_time:i%2===0?'09:20':null}));
const snaps=[{cut:'09:30',source:'rusty',bull:[...make('UP','PE OI Rising',12),...make('DOWNCALL','CE OI Down + PE OI Up',2),...make('DROP','CE OI Sharp Drop',2)],bear:[...make('BEAR','CE OI Rising',9),...make('BOTH','CE OI Up + PE OI Down',2)]}];
let root;await act(async()=>{root=create(React.createElement(client,{snaps,dateStr:'2026-10-12'}));});
const names=()=>root.root.findAllByProps({className:'stock-name'}).map(n=>n.children.join(''));
assert.equal(root.root.findAllByProps({className:'flow-panel'}).length,5);
assert.equal(names().length,27,'No six-stock cap');
assert.ok(root.root.findAllByType('th').some(n=>n.children.join('')==='Candle tier'));
assert.ok(root.root.findAllByType('th').some(n=>n.children.join('')==='Target %'));
assert.ok(!root.root.findAllByType('th').some(n=>n.children.join('').includes('confirmed')));
await act(async()=>root.root.findByProps({'aria-label':'bull OI broken filter'}).props.onChange({target:{value:'Y'}}));
assert.equal(names().filter(n=>n.startsWith('UP')).length,6);
assert.equal(names().filter(n=>n.startsWith('BEAR')).length,9,'Bull filter leaves bears unchanged');
await act(async()=>root.root.findByProps({'aria-label':'bear level filter'}).props.onChange({target:{value:'PDL_BROKEN'}}));
assert.equal(names().filter(n=>n.startsWith('BEAR')).length,9,'OR maps to PDL on bear board');
await act(async()=>root.root.findByProps({'aria-label':'bear level filter'}).props.onChange({target:{value:'PDH_BROKEN'}}));
assert.equal(names().filter(n=>n.startsWith('BEAR')).length,0);
await act(async()=>root.unmount());
console.log('PASS: five panels, unlimited stocks, independent filters, OR mapping, candle tier and target columns.');
