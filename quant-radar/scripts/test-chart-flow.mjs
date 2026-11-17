import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=p=>fs.readFileSync(p,'utf8');
function load(file,context={},deps={}){const exports={};vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,console,Map,Set,Date,JSON,Math,Number,Promise,Buffer,URL,URLSearchParams,AbortController,AbortSignal,...context,require:n=>{if(n in deps)return deps[n];throw Error('Unexpected import '+n);}});return exports;}
const {computeFlowBand,FlowBandPrimitive}=load('app/charts/flowBand.ts');
const bars=[{time:0,close:100,high:101,low:99},{time:300,close:110,high:111,low:109},{time:600,close:105,high:106,low:104}];
const points=[{time:300,available:315,value:1},{time:600,available:615,value:.8},{time:900,available:915,value:-1}];
assert.equal(computeFlowBand(bars,points,300,610)[1].pressure,null,'No use before capture availability');
const ready=computeFlowBand(bars,points,300,620);
assert.equal(ready.length,2,'Forming candle excluded');assert.equal(ready[1].pressure,.9);
assert(Math.abs(ready[1].upper-(102+37/14))<1e-9,'EMA9/ATR14 formula');
assert.equal(JSON.stringify(ready),JSON.stringify(computeFlowBand(bars.slice(0,2),points.slice(0,2),300,620)),'Future-prefix invariance');
assert.equal(computeFlowBand(bars,[...points.slice(0,1),{time:600,available:615,value:null}],300,620)[1].pressure,null,'No color fabricated at missing cut');
let updates=0,fills=0;
const primitive=new FlowBandPrimitive();primitive.attached({chart:{timeScale:()=>({timeToCoordinate:t=>t})},series:{priceToCoordinate:p=>p},requestUpdate:()=>updates++});primitive.update(ready);
primitive.paneViews()[0].renderer().draw({useMediaCoordinateSpace:fn=>fn({context:{save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++;}}})});
assert.equal(updates,1);assert.equal(fills,1);primitive.detached();

const at=s=>Date.parse(s+'+05:30'),flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function hookHarness(start){
 let now=start,id=0;const timers=new Map(),listeners=new Set(),effects=[],states=[],requests=[];let stateIndex=0;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const document={hidden:false,addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
 const context={Date:Clock,Intl,document,setTimeout:(fn,ms)=>{timers.set(++id,{fn,due:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const policy=load('utils/sessionPolling.ts',context);
 let fail=false,hold=false,held=[];
 const fetch=async(url,options)=>{requests.push({url,options});if(hold)await new Promise((resolve,reject)=>{held.push(resolve);options.signal.addEventListener('abort',()=>reject(new Error('aborted')));});if(fail)throw Error('unavailable');const q=new URL(url,'https://test.invalid').searchParams;return {ok:true,json:async()=>({symbol:q.get('symbol'),date:q.get('date'),points:[],lastCut:null,stale:false})};};
 const react={useEffect:fn=>effects.push(fn),useState:init=>{const i=stateIndex++;states[i]={value:init};return [init,value=>states[i].value=value];}};
 const hooks=load('app/charts/useFlowData.ts',{...context,fetch},{react,'@/utils/sessionPolling':policy});
 const mount=async(symbol,date,enabled=true)=>{const e=effects.length,s=stateIndex;hooks.useFlowData(symbol,date,enabled);const stop=effects[e]();await flush();return {stop,state:states.slice(s)};};
 return {requests,timers,states,document,mount,set fail(v){fail=v;},set hold(v){hold=v;},release:async()=>{held.splice(0).forEach(f=>f());await flush();},visible:async hidden=>{document.hidden=hidden;for(const f of listeners)f();await flush();},advance:async ms=>{const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!next)break;now=next[1].due;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();}};
}
for(const [now,date] of [[at('2026-11-17T10:00:00'),'2026-11-16'],[at('2026-11-21T10:00:00'),'2026-11-21']]){
 const h=hookHarness(now),m=await h.mount('BSE',date);await h.advance(3600000);await h.visible(true);await h.visible(false);assert.equal(h.requests.length,1,'Historical/weekend loads once');m.stop();assert.equal(h.timers.size,0);
}
const disabled=hookHarness(at('2026-11-17T10:00:00'));(await disabled.mount('BSE','2026-11-17',false)).stop?.();assert.equal(disabled.requests.length,0);
const hidden=hookHarness(at('2026-11-17T10:00:00'));hidden.document.hidden=true;const hm=await hidden.mount('BSE','2026-11-17');assert.equal(hidden.requests.length,0);await hidden.visible(false);assert.equal(hidden.requests.length,1);hm.stop();
const live=hookHarness(at('2026-11-17T10:00:00')),lm=await live.mount('BSE','2026-11-17');await live.advance(300001);assert.equal(live.requests.length,2);for(let i=0;i<10;i++){await live.visible(true);await live.visible(false);}assert.equal(live.requests.length,2,'Focus storms reuse completed cache');assert.equal(live.timers.size,1);live.fail=true;await live.advance(300001);assert.equal(lm.state[0].value.symbol,'BSE','Keep same-date values on error');assert(lm.state[1].value.includes('unavailable'));lm.stop();assert.equal(live.timers.size,0);
const dedupe=hookHarness(at('2026-11-17T10:00:00'));dedupe.hold=true;const a=await dedupe.mount('BSE','2026-11-17'),b=await dedupe.mount('BSE','2026-11-17');assert.equal(dedupe.requests.length,1);a.stop();assert(!dedupe.requests[0].options.signal.aborted);b.stop();assert(dedupe.requests[0].options.signal.aborted,'Last subscriber aborts request');await flush();
const rollover=hookHarness(at('2026-11-17T23:59:50')),rm=await rollover.mount('BSE','2026-11-17');await rollover.advance(900000);assert.equal(rollover.requests.length,1,'Date rollover stops old session');rm.stop();
const close=hookHarness(at('2026-11-17T15:34:50')),cm=await close.mount('BSE','2026-11-17');await close.advance(900000);assert.equal(close.requests.length,4,'Close follows slow five-minute checks');cm.stop();

let denied=false,feedCalls=0,authCalls=0,oversize=false;
const epoch=at('2026-11-17T09:30:00')/1000;
const doc={source:'chart_flow_v1',date:'2026-11-17',sig_date:'20261117',version:'chart-flow-v1',cut:'09:30',available_at:epoch+12,rows:[['BSE',.4],['CANBK',-.3]]};
const route=load('app/api/chart-flow/route.ts',{process:{env:{PANTHER_CLIENT_ID:'test',PANTHER_CLIENT_SECRET:'test',PANTHER_TOKEN_URL:'https://test.invalid/token',PANTHER_SIGNALS_URL:'https://test.invalid/feed'}},fetch:async url=>{if(String(url).includes('/token')){authCalls++;return new Response(JSON.stringify({access_token:'test',expires_in:3600}));}feedCalls++;return new Response(oversize?'x'.repeat(1_000_001):JSON.stringify({items:[{doc:JSON.stringify(doc)}]}));}},{'@/utils/auth':{requireApiSession:async()=>denied?{status:401}:null},'@/utils/backend':{getTodayIstDate:()=> '2026-11-17'},'next/server':{NextResponse:{json:(body,options={})=>({body,...options,status:options.status??200})}}});
const request=q=>({nextUrl:{searchParams:new URLSearchParams(q)}});
denied=true;assert.equal((await route.GET(request('symbol=BSE&date=2026-11-17'))).status,401);assert.equal(feedCalls,0);denied=false;
for(const q of ['symbol=BSE&date=2026-11-31','symbol=BSE&date=2026-11-18','symbol=%3Cscript%3E&date=2026-11-17'])assert.equal((await route.GET(request(q))).status,400);
const responses=await Promise.all(['BSE','CANBK'].map(s=>route.GET(request('symbol='+s+'&date=2026-11-17'))));assert.equal(feedCalls,1);assert.equal(authCalls,1);assert.equal(responses[0].body.points[0].value,.4);assert.equal(responses[1].body.points[0].value,-.3);assert.equal(responses[0].headers['Cache-Control'],'private, max-age=300');
assert.equal((await route.GET(request('symbol=NOTCOVERED&date=2026-11-17'))).body.points.length,0);
oversize=true;assert.equal((await route.GET(request('symbol=BSE&date=2026-11-16'))).status,503);
console.log('PASS chart flow: causal formulas, primitive drawing, hidden/history/weekend, focus, abort/dedup, rollover, close, stale preservation, auth, date isolation and bounded shared feed.');
