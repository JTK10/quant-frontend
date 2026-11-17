import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
const read=p=>fs.readFileSync(p,'utf8');
function load(file,deps={},extra={}){const exports={};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Map,Set,Date,Math,Number,JSON,Promise,AbortController,AbortSignal,URL,Buffer,console,setTimeout,clearTimeout,require:n=>deps[n],...extra});return exports;}
const band=load('app/charts/flowBand.ts'),policy=load('utils/sessionPolling.ts'),{evaluateOspreySetup}=load('app/osprey/setup.ts',{'../charts/flowBand':band});
const end=Date.parse('2026-11-17T10:00:00+05:30')/1000;
const prior=Array.from({length:75},(_,i)=>({time:Date.parse('2026-11-16T09:15:00+05:30')/1000+300*i,open:100,high:101,low:99,close:100,volume:100}));
const current=Array.from({length:9},(_,i)=>({time:Date.parse('2026-11-17T09:15:00+05:30')/1000+300*i,open:102,high:102.5,low:100,close:102.1,volume:100}));
const row={symbol:'TEST',state:'Confirmed',confirmed:'09:40',side:'BULL'};
assert(evaluateOspreySetup(row,[...prior,...current],'2026-11-17','10:00'));
assert.equal(evaluateOspreySetup({...row,state:'Watch'},[...prior,...current],'2026-11-17','10:00'),null);
assert.equal(evaluateOspreySetup({...row,confirmed:'10:05'},[...prior,...current],'2026-11-17','10:00'),null);
assert.equal(evaluateOspreySetup(row,[...prior.slice(1),...current],'2026-11-17','10:00'),null,'Prior incomplete cash session does not yield a star');
assert.equal(evaluateOspreySetup(row,[...prior,...current.slice(0,-1)],'2026-11-17','10:00'),null,'Missing completed candle does not yield a star');
assert.deepEqual(evaluateOspreySetup(row,[...prior,...current,{time:end,open:1000,high:1001,low:999,close:1000,volume:100}],'2026-11-17','10:00'),evaluateOspreySetup(row,[...prior,...current],'2026-11-17','10:00'),'Forming/future bars cannot change star');
// Mirror both price and direction for a bearish equivalent.
const mirror=bars=>bars.map(b=>({...b,open:200-b.open,high:200-b.low,low:200-b.high,close:200-b.close}));
assert(evaluateOspreySetup({...row,side:'BEAR'},mirror([...prior,...current]),'2026-11-17','10:00'));

const {SetupCandles}=load('app/osprey/setupCandles.ts',{'@/utils/sessionPolling':policy});
function harness(date='2026-11-17',time='10:00:30'){
 let now=Date.parse(date+'T'+time+'+05:30'),hidden=false,last,created=0;const sockets=[];
 class Socket{constructor(){this.readyState=0;this.sent=[];this.closed=false;sockets.push(this);created++;}open(){this.readyState=1;this.onopen?.();}send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;this.readyState=3;}message(data){this.onmessage?.({data:JSON.stringify(data)});}}
 const client=new SetupCandles({url:'wss://fixture.invalid',socket:()=>new Socket(),now:()=>now,hidden:()=>hidden,onData:(bars,date,cut)=>{last={bars,date,cut};}});
 return {client,sockets,get last(){return last;},get created(){return created;},hide(v){hidden=v;client.visibility();},setNow(t){now=Date.parse(t+'+05:30');}};
}
const h=harness();h.client.configure(['TEST'],'2026-11-17','10:00');assert.equal(h.created,2,'One live-only socket and one bootstrap');h.sockets.forEach(s=>s.open());assert.equal(h.sockets[0].sent[0].history,false);
h.sockets[1].message({type:'snapshot',bars:[...prior,...current].map(b=>({...b,symbol:'TEST'}))});assert.equal(h.last.bars.get('TEST').length,84);
const count=h.created;h.sockets[0].message({type:'candle',symbol:'TEST',time:end,open:102,high:102.5,low:101,close:102.2,volume:100});h.client.configure(['TEST'],'2026-11-17','10:05');assert.equal(h.created,count,'Next cut reuses streamed prices, never polls history');assert(h.last.bars.has('TEST'));
h.hide(true);assert(h.sockets[0].closed);h.hide(false);assert.equal(h.created,count+1,'Visibility creates one live socket, not fresh history');h.client.stop();
const history=harness('2026-11-18','10:00:00');history.client.configure(['TEST'],'2026-11-17','10:00');assert.equal(history.created,1,'Historical chart does not stream live');history.sockets[0].open();history.sockets[0].message({type:'snapshot',bars:[...prior,...current].map(b=>({...b,symbol:'TEST'}))});for(let i=0;i<5;i++){history.hide(true);history.hide(false);}assert.equal(history.created,1,'History does not reload on focus storms');history.client.stop();
const cancelled=harness();cancelled.client.configure(['TEST'],'2026-11-17','10:00');cancelled.hide(true);cancelled.hide(false);assert.equal(cancelled.created,4,'Cancelled hidden bootstrap can resume once');cancelled.client.stop();
const weekend=harness('2026-11-21','10:00:00');weekend.client.configure(['TEST'],'2026-11-17','10:00');assert.equal(weekend.created,1);weekend.client.stop();
// Compact OI context is cached across consumers and only uses a prior date.
let reads=0;
const levels=load('utils/ospreySetupLevels.ts',{'./aurumFeed':{getSharedOrdsToken:async()=>'fixture',invalidateSharedOrdsToken:()=>{}},'./resultCache':load('utils/resultCache.ts')},{process:{env:{PANTHER_SIGNALS_URL:'https://fixture.invalid/feed'}},fetch:async url=>{reads++;assert.equal(url.searchParams.get('sig_date'),'20261116');return new Response(JSON.stringify({items:[{doc:{source:'chart_oi_close',sig_date:'20261116',ts:1,oi_levels:[['TEST',100,'2026-11-23',[[99,1,1],[98,1,1]],[[101,1,1],[102,1,1]]]]}}]}));}});
const results=await Promise.all([levels.ospreySetupLevels('2026-11-17'),levels.ospreySetupLevels('2026-11-17')]);assert.equal(reads,1);assert.equal(results[0].TEST.levels.length,4);assert.equal(results[0].TEST.date,'2026-11-16');
assert(read('app/osprey/OspreyClient.tsx').includes('★'));assert(read('app/osprey/osprey.css').includes('color: #facc15'));
console.log('PASS Osprey yellow star: causal rules, bull/bear, future guards, missing data, live-only fan-out, cached streamed updates, hidden/focus/history/weekend cleanup and shared prior OI.');
