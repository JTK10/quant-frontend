import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const at=s=>Date.parse(s+'+05:30');
let now=at('2026-10-13T10:00:00');
const NativeDate=Date;
class Clock extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const load=(path,deps={},extra={})=>{
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,Date:Clock,Intl,Buffer,URL,URLSearchParams,Headers,Response,AbortController,AbortSignal,DOMException,Error,Map,Set,console,...extra,require:name=>name in deps?deps[name]:require(name)});
  return exports;
};
const {resultCache}=load('utils/resultCache.ts');
let calls=0,resolve;
const cache=resultCache({maxEntries:2,maxBytes:20,size:s=>s.length});
const blocked=()=>{calls++;return new Promise(r=>{resolve=r;});};
const one=cache('one',1000,blocked),two=cache('one',1000,blocked);
assert.equal(one,two);await Promise.resolve();assert.equal(calls,1);resolve('value');await one;
assert.equal(await cache('one',1000,async()=>{throw Error('must reuse');}),'value');
now+=1001;await assert.rejects(cache('one',1000,async()=>{throw Error('expired outage');}));
assert.equal(await cache('one',1000,async()=>'recovered'),'recovered');
await cache('two',1000,async()=>'two');await cache('three',1000,async()=>'three');
assert.equal(await cache('one',1000,async()=>'evicted'),'evicted','Count bound evicts oldest');
let large=0;await cache('large',1000,async()=>{large++;return 'x'.repeat(21);});
await cache('large',1000,async()=>{large++;return 'x'.repeat(21);});assert.equal(large,2,'Oversize results not retained');

const policy=load('utils/sessionPolling.ts');
const rusty=load('utils/rustyFeed.ts',{'./sessionPolling':policy});
const merged=rusty.mergeRustySnapshots([{source:'rusty',cut:'09:20',bull:[{s:'A',entry_confirmed:false}]},{source:'rusty',cut:'09:25'}],
 [{source:'rusty',cut:'09:20',bull:[{s:'A',entry_confirmed:true}]},{source:'rusty',cut:'09:30'},{source:'other',cut:'09:35'}]);
assert.equal(merged.length,3);assert.equal(merged[0].bull[0].entry_confirmed,true,'Same cut corrected without losing history');
assert.equal(rusty.rustyNextPoll('2026-10-13',at('2026-10-13T10:00:00')),30000);
assert.equal(rusty.rustyNextPoll('2026-10-13',at('2026-10-13T10:00:30')),300000);
assert.equal(rusty.rustyNextPoll('2026-10-12',at('2026-10-13T10:00:00')),null);
assert.equal(rusty.rustyNextPoll('2026-10-17',at('2026-10-17T10:00:00')),null);
assert.equal(rusty.rustyExpectedCut('2026-10-13',at('2026-10-13T15:36:00')),'15:35');
assert.equal(rusty.rustyNextPoll('2026-10-13',at('2026-10-13T15:40:30')),null);

let authenticated=true,feedCalls=0,tokenCalls=0,outage=false;
class NextResponse extends Response{static json(body,init={}){return new NextResponse(JSON.stringify(body),init);}}
const auth={requireApiSession:async()=>authenticated?null:NextResponse.json({error:'login'},{status:401,headers:{'Cache-Control':'private, no-store'}})};
const raw=[{source:'rusty',sig_date:'20261013',time:'09:55',cut:'09:55',ts:1,bull:[{s:'A',rusty_pct:20,entry_confirmed:true}],bear:[]},
 {source:'rusty',sig_date:'20261013',time:'10:00',cut:'10:00',ts:2,bull:[{s:'B',rusty_pct:30,entry_confirmed:true,flow_type:'BULL_BUILD'}],bear:[]}];
const env={PANTHER_CLIENT_ID:'test',PANTHER_CLIENT_SECRET:'test',PANTHER_TOKEN_URL:'https://test.invalid/token',PANTHER_SIGNALS_URL:'https://test.invalid/feed'};
const route=load('app/api/panther-signals/route.ts',{'next/server':{NextResponse},'@/utils/auth':auth,
 '@/utils/backend':{getTodayIstDate:()=>policy.istSessionDate(now),normalizePantherSignals:s=>s},'@/utils/resultCache':{resultCache}},
 {process:{env},fetch:async url=>{
  if(String(url).includes('/token')){tokenCalls++;return NextResponse.json({access_token:'test',expires_in:3600});}
  feedCalls++;if(outage)return NextResponse.json({error:'outage'},{status:503});
  return NextResponse.json({items:raw.map(doc=>({doc:JSON.stringify(doc)})),hasMore:false});
 }});
const request=query=>({nextUrl:new URL('https://test.invalid/api/panther-signals?'+query)});
now=at('2026-10-13T10:00:00');
const query='date=2026-10-13&sources=rusty';
const first=await route.GET(request(query)),firstText=await first.text();
assert.equal(first.status,200);assert.equal(first.headers.get('Cache-Control'),'private, max-age=10');
assert.equal(JSON.parse(firstText)[0].bull[0].entry_confirmed,true);
assert.equal(JSON.parse(firstText)[0].bull[0].p,20);assert.equal(JSON.parse(firstText)[0].bull[0].rusty_pct,undefined,'Proprietary fields stay redacted');
assert.equal(await (await route.GET(request(query))).text(),firstText);assert.equal(feedCalls,1,'Completed CPU work reused');
const incremental=await (await route.GET(request(query+'&after=10:00'))).json();
assert.equal(incremental.length,1);assert.equal(incremental[0].cut,'10:00');assert.equal(incremental[0].bull[0].flow_type,'BULL_BUILD');
assert.equal((await route.GET(request('date=2026-10-13&sources=kairos2&after=10:00'))).status,400,'Incremental semantics cannot alter other scanners');
const compact=await (await route.GET(request(query+'&view=rusty'))).json();
assert.equal(compact.snapshots.length,1);assert.equal(compact.snapshots[0].cut,'10:00');assert.equal(compact.cuts.length,2,'Full timeline index, single initial snapshot');
const selectedCut=await (await route.GET(request(query+'&view=rusty&cut=09:55'))).json();assert.equal(selectedCut.snapshots.length,1);assert.equal(selectedCut.snapshots[0].cut,'09:55','Lazy history returns the exact selected cut');
authenticated=false;assert.equal((await route.GET(request(query))).status,401,'Cache never bypasses authentication');authenticated=true;
now+=10001;outage=true;const failed=await route.GET(request(query));assert.equal(failed.status,500);assert.equal(failed.headers.get('Cache-Control'),'private, no-store');
outage=false;assert.equal((await route.GET(request(query))).status,200);assert.equal(tokenCalls,1,'OAuth reused after feed failures');

let pallasReads=0;
const pallasTime=load('utils/pallasTime.ts');
const pallas=load('app/api/pallas/route.ts',{'next/server':{NextResponse},'node:fs/promises':{readFile:async()=>JSON.stringify([])},
 'node:path':{join:(...a)=>a.join('/')},'@/utils/auth':auth,'@/utils/backend':{getTodayIstDate:()=>policy.istSessionDate(now)},
 '@/utils/pallas':{PALLAS_DATES:[],foldPallas:(docs,date,limit,symbol)=>({date,asof:limit,signals:[],symbol,docs})},
 '@/utils/pallasFeed':{newPallasReadBudget:()=>({}),pallasInflight:()=>async(_k,fn)=>fn(),readPallasFeed:async(_r,date,symbol)=>{pallasReads++;return {documents:[{date,symbol}],next:undefined};}},
 '@/utils/pallasTime':pallasTime,'@/utils/resultCache':{resultCache}},
 {process:{env,cwd:()=>'.'},fetch:async()=>NextResponse.json({access_token:'test',expires_in:3600})});
const pq='mode=history&date=2026-10-12';
const ph1=await (await pallas.GET(request(pq+'&asof=09:30'))).json();
const ph2=await (await pallas.GET(request(pq+'&asof=10:00'))).json();
assert.equal(pallasReads,1,'Replay slider reuses parsed historical documents');assert.notEqual(ph1.asof,ph2.asof,'Time cutoffs still folded per request');
await pallas.GET(request(pq+'&asof=10:00&symbol=ABB'));assert.equal(pallasReads,2,'Inspector symbol has isolated cached candles');
now+=300001;await pallas.GET(request(pq));assert.equal(pallasReads,3,'Historical cache expires and can accept corrected data');
await pallas.GET(request('mode=live&date=2026-10-13'));await pallas.GET(request('mode=live&date=2026-10-13'));assert.equal(pallasReads,4);
now+=15001;await pallas.GET(request('mode=live&date=2026-10-13'));assert.equal(pallasReads,5,'Live Pallas doc cache limited to 15s');
authenticated=false;assert.equal((await pallas.GET(request(pq))).status,401);authenticated=true;

// Exercise actual Rusty component effect/timer/focus behavior without network.
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
function mountRusty(start,date,{followToday=false,fail=false,hold=false,cut='10:00'}={}){
 now=start;let id=0,index=0,requests=0,replaces=0,release;const timers=new Map(),listeners=new Set(),effects=[],cleanups=[],states=[];
 const add=(fn,ms,repeat=false)=>{const key=++id;timers.set(key,{fn,ms,due:now+ms,repeat});return key;};
 const document={hidden:false,addEventListener:(_n,fn)=>listeners.add(fn),removeEventListener:(_n,fn)=>listeners.delete(fn)};
 const router={replace:()=>replaces++};
 const deps={react:{useRef:value=>({current:value}),useState:value=>{const i=index++;states[i]=value;return[value,next=>{states[i]=typeof next==='function'?next(states[i]):next;}];},useEffect:fn=>effects.push(fn)},
  'next/navigation':{useRouter:()=>router},'@/components/Controls':{DatePicker:()=>null},'@/utils/sessionPolling':policy,'@/utils/rustyFeed':rusty,'./RustyClient':{default:()=>null}};
 const options=[];
 const component=load('app/rusty/RustyFeed.tsx',deps,{document,window:{location:{assign:()=>{}}},
 setTimeout:(fn,ms)=>add(fn,ms),clearTimeout:k=>timers.delete(k),setInterval:(fn,ms)=>add(fn,ms,true),clearInterval:k=>timers.delete(k),
 fetch:async(url,opt)=>{requests++;options.push({url,opt});if(hold)await new Promise(r=>{release=r;});if(fail)throw Error('offline');const selected=new URL('https://test.invalid'+url).searchParams.get('cut')??cut;return NextResponse.json({snapshots:[{source:'rusty',cut:selected,bull:[{s:'A',entry_confirmed:true}]}],cuts:['09:55',cut]});}}).default;
 const rendered=component({dateStr:date,followToday});for(const fn of effects){const clean=fn();if(clean)cleanups.push(clean);}
 return {get requests(){return requests;},get replaces(){return replaces;},states,options,timers,
 flush,release:async()=>{hold=false;release?.();await flush();},fail:()=>{fail=true;},
 select:async cut=>{rendered.props.onCutChange(cut);await flush();},
 visible:async(hidden)=>{document.hidden=hidden;for(const fn of listeners)fn();await flush();},
 advance:async(ms)=>{const end=now+ms;let steps=0;for(;;){const due=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!due)break;assert.ok(++steps<1000);const [key,t]=due;now=t.due;timers.delete(key);if(t.repeat)timers.set(key,{...t,due:now+t.ms});t.fn();await flush();}now=end;await flush();},
 cleanup:()=>{for(const fn of cleanups)fn();}};
}
for(const [start,date] of [[at('2026-10-13T10:00:00'),'2026-10-12'],[at('2026-10-17T10:00:00'),'2026-10-17']]){
 const h=mountRusty(start,date);await h.flush();await h.advance(3600000);await h.visible(true);await h.visible(false);
 assert.equal(h.requests,1,'History/weekend load once including focus');h.cleanup();assert.equal(h.timers.size,0);
}
const live=mountRusty(at('2026-10-13T10:00:30'),'2026-10-13');await live.flush();
await live.advance(299999);assert.equal(live.requests,1,'No 45s server refresh loop');
await live.advance(1);assert.equal(live.requests,2);assert.ok(live.options[1].url.includes('after=10%3A00'));
await live.visible(true);const count=live.requests;await live.advance(600000);assert.equal(live.requests,count,'Hidden tabs make no requests');
await live.visible(false);await live.visible(true);await live.visible(false);assert.equal(live.requests,count+1,'Focus storm only loads once');
live.fail();await live.advance(300000);assert.ok(live.states[0].length,'Board retained on refresh failure');assert.match(live.states[1],/offline/);live.cleanup();assert.equal(live.timers.size,0);
const blockedView=mountRusty(at('2026-10-13T10:00:30'),'2026-10-13',{hold:true});
await blockedView.visible(true);await blockedView.visible(false);await blockedView.visible(true);await blockedView.visible(false);
assert.equal(blockedView.requests,1,'One request in flight');await blockedView.release();blockedView.cleanup();assert.equal(blockedView.options[0].opt.signal.aborted,true);
const rollover=mountRusty(at('2026-10-13T23:59:30'),'2026-10-13',{followToday:true,cut:'15:40'});await rollover.flush();await rollover.advance(60000);assert.equal(rollover.replaces,1,'Live landing moves to new IST date');rollover.cleanup();
const late=mountRusty(at('2026-10-13T10:00:30'),'2026-10-13',{cut:'09:55'});await late.flush();await late.advance(60000);assert.equal(late.requests,2);await late.advance(60000);assert.equal(late.requests,2,'Missing cut permits only one early retry');late.cleanup();
const history=mountRusty(at('2026-10-13T10:00:30'),'2026-10-12');await history.flush();
assert.equal(history.states[0].length,2,'Timeline keeps unloaded cut placeholders');
await history.select('09:55');assert.equal(history.requests,2);assert.ok(history.options[1].url.includes('cut=09%3A55'));
await history.select('10:00');await history.select('09:55');assert.equal(history.requests,2,'Visited history reused in browser');history.cleanup();
console.log('PASS: CPU result reuse/expiry/failures/bounds/auth, Rusty incremental corrections and actual component history/weekend/hidden/focus/inflight/rollover/stale handling.');
