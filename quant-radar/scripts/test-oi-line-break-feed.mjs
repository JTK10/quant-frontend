import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const load=(relative,imports={})=>{
  const code=readFileSync(new URL(relative,import.meta.url),'utf8');
  const transpiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  new Function('exports','require',transpiled)(exports,name=>{
    if(!(name in imports))throw Error('Unexpected import: '+name);
    return imports[name];
  });
  return exports;
};
const polling=load('../utils/sessionPolling.ts');
const {createLineArchiveFeed,createLineLiveFeed,koratPollingDelay}=load('../app/oi-line-breaks/feed.ts',{'@/utils/sessionPolling':polling});
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

const ist=(hm,date='2026-11-03')=>Date.parse(`${date}T${hm}:00+05:30`);
assert.equal(koratPollingDelay('2026-11-03',ist('09:20')),300000);
assert.equal(koratPollingDelay('2026-11-03',ist('16:00')),null);
assert.equal(koratPollingDelay('2026-11-02',ist('09:20')),null);
assert.equal(koratPollingDelay('2026-11-07',ist('09:20','2026-11-07')),null);
let now=ist('09:20'),liveHidden=true,liveReads=0,liveData=0,liveErrors=0;
let timerId=0;const timers=new Map();
const livePending=deferred();
const live=createLineLiveFeed({date:'2026-11-03',now:()=>now,hidden:()=>liveHidden,
  setTimer:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
  clearTimer:id=>timers.delete(id),
  read:()=>{liveReads++;return liveReads===1?livePending.promise:Promise.resolve({date:'2026-11-03',setup:[],move:[]});},
  onDate:()=>{},onData:()=>liveData++,onError:()=>liveErrors++,onSettled:()=>{}});
assert.equal(liveReads,0);
liveHidden=false;for(let i=0;i<50;i++)live.visibility();
assert.equal(liveReads,1,'focus storm starts only one live read');
livePending.reject(Error('temporary'));await tick();
assert.equal(liveErrors,1);
assert.equal(timers.size,1,'only one live timer after error');
for(let i=0;i<50;i++)live.visibility();
assert.equal(liveReads,1,'error/focus must respect five-minute budget');
now+=300000;live.visibility();await tick();
assert.equal(liveReads,2);assert.equal(liveData,1);
now=ist('15:41');for(let i=0;i<50;i++)live.visibility();
assert.equal(liveReads,2,'close transition stops network reads');
liveHidden=true;live.visibility();assert.equal(timers.size,0,'hidden tab clears timer');
live.stop();assert.equal(timers.size,0,'unmount clears timer');
console.log('PASS: archive and live hidden/focus/in-flight/retry/weekend/rollover/close/cleanup');
