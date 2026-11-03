import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const code=readFileSync(new URL('../app/oi-line-breaks/feed.ts',import.meta.url),'utf8');
const transpiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function('exports',transpiled)(exports);
const {createLineArchiveFeed}=exports;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,bad)=>{resolve=ok;reject=bad;});return {promise,resolve,reject};};

let hidden=true,calls=0,received=0,errors=0,settled=0;
const pending=deferred();
const feed=createLineArchiveFeed({hidden:()=>hidden,read:()=>{calls++;return pending.promise;},
  onData:()=>received++,onError:()=>errors++,onSettled:()=>settled++});
for(let i=0;i<50;i++)feed.visibility();
assert.equal(calls,0,'hidden tab must not fetch');
hidden=false;
for(let i=0;i<50;i++)feed.visibility();
assert.equal(calls,1,'focus storm must retain one in-flight read');
pending.resolve({date:'2026-11-02'});await tick();
assert.deepEqual([received,errors,settled],[1,0,1]);
for(let i=0;i<50;i++)feed.visibility();
assert.equal(calls,1,'historical date must never poll, including weekends/rollover/close');
feed.stop();

let tries=0,good=0,bad=0;
const retry=createLineArchiveFeed({hidden:()=>false,read:async()=>{tries++;if(tries===1)throw Error('temporary');return {date:'2026-11-02'};},
  onData:()=>good++,onError:()=>bad++,onSettled:()=>{}});
await tick();assert.deepEqual([tries,good,bad],[1,0,1]);
retry.visibility();await tick();assert.deepEqual([tries,good,bad],[2,1,1]);
retry.visibility();assert.equal(tries,2,'a successful same-cut board is kept after recovery');retry.stop();

let aborted=false,late=0;
const pendingStop=deferred();
const stopped=createLineArchiveFeed({hidden:()=>false,read:signal=>{signal.addEventListener('abort',()=>{aborted=true;pendingStop.reject(new DOMException('Aborted','AbortError'));});return pendingStop.promise;},
  onData:()=>late++,onError:()=>late++,onSettled:()=>late++});
stopped.stop();await tick();assert.equal(aborted,true);assert.equal(late,0,'unmounted/date-changed feed must not publish');
console.log('PASS: hidden tab, focus storms, one in flight, history/weekend/rollover/close, retry, abort cleanup');
