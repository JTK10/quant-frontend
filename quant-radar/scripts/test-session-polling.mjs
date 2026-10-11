import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const at=s=>Date.parse(s+'+05:30');
const friday=at('2026-10-09T10:00:00');
const saturday=at('2026-10-10T10:00:00');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

function harness(start,{queryDate=null,states={}}={}) {
  let now=start,nextId=1,index=0,refreshes=0;
  const effects=[],cleanups=[],timers=new Map(),listeners=new Map(),requests=[];
  const NativeDate=Date;
  class Clock extends NativeDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const add=(fn,ms,repeat=false)=>{const id=nextId++;timers.set(id,{fn,ms,due:now+ms,repeat});return id;};
  const document={hidden:false,addEventListener:(name,fn)=>{const key='d'+name;listeners.set(key,[...(listeners.get(key)??[]),fn]);},removeEventListener:(name,fn)=>listeners.set('d'+name,(listeners.get('d'+name)??[]).filter(f=>f!==fn))};
  const window={setTimeout:(fn,ms)=>add(fn,ms),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,ms)=>add(fn,ms,true),clearInterval:id=>timers.delete(id),
    addEventListener:()=>{},removeEventListener:()=>{},location:{assign:()=>{}}};
  const react={useEffect:fn=>effects.push(fn),useEffectEvent:fn=>fn,
    useState:init=>{const i=index++;return [i in states?states[i]:typeof init==='function'?init():init,()=>{}];},
    useReducer:(_fn,init)=>[init,()=>{}],useRef:value=>({current:value}),useMemo:fn=>fn()};
  const context={Date:Clock,Intl,URL,URLSearchParams,AbortController,DOMException,console,Map,Set,
    document,window,setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,
    setInterval:window.setInterval,clearInterval:window.clearInterval,
    fetch:async(url,options)=>{requests.push({url:String(url),options});return {ok:true,status:200,json:async()=>({signals:[],bars:[],errors:[],date:policy.istSessionDate(),symbol:'NIFTY 50',intraday:[],previous:[]})};}};
  let policy;
  const dependencies={react,'next/navigation':{useRouter:()=>({refresh:()=>refreshes++}),useSearchParams:()=>({get:()=>queryDate}),usePathname:()=>'/test'},
    '@/utils/backend':{getTodayIstDate:()=>policy.istSessionDate(),buildTradingViewUrl:()=>''},
    '@/utils/chartWatchlist':{readChartWatchlist:()=>[],addChartWatchlistSymbol:()=>[],CHART_WATCHLIST_UPDATED_EVENT:'watch'},
    '@/utils/pallas':{PALLAS_DATES:[],quoteKey:()=>'',pallasAiScore:()=>null,passesPallasAi:()=>true,pallasEngineLabel:()=>({label:'',detail:''}),pallasAiPassLabel:()=>'',pallasOiCrossed:()=>null},
    '@/utils/pallasTime':{pallasSessionRollover:()=>null,pallasPreviousWeekday:()=>''},
    '@/utils/pallasRefresh':{initialPallasRefresh:{},pallasRefreshReducer:()=>{},pallasRefreshView:()=>({data:null,error:null})},
    '@/components/Controls':{DatePicker:()=>null},'../charts/LiveCandleChart':{default:()=>null},
    '../charts/useOIData':{useOIData:()=>({data:null,loading:false,error:''})}};
  function load(path){
    const exports={};
    const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    vm.runInNewContext(code,{...context,exports,require:name=>name==='@/utils/sessionPolling'?policy:name in dependencies?dependencies[name]:name.endsWith('.css')?{}:require(name)});
    return exports;
  }
  policy=load('utils/sessionPolling.ts');
  return {policy,load,requests,timers,get refreshes(){return refreshes;},
    mount:async()=>{for(const fn of effects){const cleanup=fn();if(cleanup)cleanups.push(cleanup);}await flush();},
    visibility:async(hidden)=>{document.hidden=hidden;for(const fn of listeners.get('dvisibilitychange')??[])fn();await flush();},
    advance:async(ms)=>{const end=now+ms;let steps=0;while(true){const due=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!due)break;assert.ok(++steps<10000,'Timer loop');const [id,t]=due;now=t.due;timers.delete(id);if(t.repeat)timers.set(id,{...t,due:now+t.ms});t.fn();await flush();}now=end;await flush();},
    cleanup:()=>{for(const fn of cleanups)fn();}};
}

const {policy}=harness(friday);
assert.equal(policy.sessionPollingDelay('2026-10-09',60000,friday),60000);
assert.equal(policy.sessionPollingDelay('2026-10-08',60000,friday),null);
assert.equal(policy.sessionPollingDelay(undefined,60000,saturday),null);
assert.equal(policy.sessionPollingDelay(undefined,60000,at('2026-10-11T10:00:00')),null);
assert.equal(policy.sessionPollingDelay(undefined,60000,at('2026-10-09T15:36:00')),300000);
assert.equal(policy.istSessionDate(Date.parse('2026-10-08T20:00:00Z')),'2026-10-09');

for(const config of [{start:saturday},{start:friday,queryDate:'2026-10-08'}]){
  const h=harness(config.start,config);h.load('components/Controls.tsx').AutoRefresh({interval:30000});await h.mount();
  await h.advance(3600000);await h.visibility(true);await h.visibility(false);
  assert.equal(h.refreshes,0,'No weekend/history router refresh');h.cleanup();
}
const transition=harness(at('2026-10-09T15:34:50'));
transition.load('components/Controls.tsx').AutoRefresh({interval:30000});await transition.mount();
await transition.advance(120000);const afterClose=transition.refreshes;
await transition.advance(180000);assert.equal(transition.refreshes,afterClose,'Timer must slow down across close');
await transition.advance(120000);assert.ok(transition.refreshes>afterClose);transition.cleanup();

for(const start of [friday,saturday]){
  const h=harness(start),historic='2026-10-08';
  h.load('app/nifty-signals/NiftySignalsChart.tsx').default({initialDate:historic,streamUrl:'wss://test.invalid'});await h.mount();
  const initial=h.requests.length;assert.equal(initial,2,'One signal and one candle request');
  await h.advance(3600000);await h.visibility(true);await h.visibility(false);
  assert.equal(h.requests.length,initial,'Historical Nifty must not poll or reload on focus');h.cleanup();
}
const nifty=harness(saturday);
nifty.load('app/nifty-signals/NiftySignalsChart.tsx').default({initialDate:'2026-10-10',streamUrl:'wss://test.invalid'});await nifty.mount();
await nifty.advance(3600000);assert.equal(nifty.requests.length,1,'Weekend Nifty loads once');nifty.cleanup();

for(const config of [{start:saturday,states:{}},{start:friday,states:{0:'history',1:'2026-10-08'}}]){
  const h=harness(config.start,config);h.load('app/pallas/PallasClient.tsx').default();await h.mount();await h.advance(300);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.cache,'default','Pallas must honor private HTTP cache');
  await h.advance(3600000);await h.visibility(true);await h.visibility(false);
  assert.equal(h.requests.length,1,'Weekend/history Pallas must not poll');h.cleanup();
}
for(const [start,date] of [[friday,'2026-10-08'],[saturday,'2026-10-10']]){
  const h=harness(start);h.load('app/charts/useOIData.ts').useOIData('NIFTY 50',date);await h.mount();
  await h.advance(3600000);await h.visibility(true);await h.visibility(false);
  assert.equal(h.requests.length,1,'Weekend/history OI must load once');h.cleanup();
}
const oi=harness(friday);oi.load('app/charts/useOIData.ts').useOIData('NIFTY 50','2026-10-09');await oi.mount();
await oi.advance(300001);assert.equal(oi.requests.length,2,'Live OI still updates');
await oi.visibility(true);await oi.visibility(false);await oi.visibility(true);await oi.visibility(false);
assert.equal(oi.timers.size,1,'Focus must not create multiple timers');oi.cleanup();assert.equal(oi.timers.size,0);
const weekendIrbis=harness(saturday);
weekendIrbis.load('app/irbis/IrbisClient.tsx').default();await weekendIrbis.mount();
assert.equal(weekendIrbis.requests.filter(r=>r.url.startsWith('/api/irbis')).length,1);
await weekendIrbis.advance(3600000);await weekendIrbis.visibility(true);await weekendIrbis.visibility(false);
assert.equal(weekendIrbis.requests.filter(r=>r.url.startsWith('/api/irbis')).length,1,'Weekend Irbis loads once');
weekendIrbis.cleanup();assert.equal(weekendIrbis.timers.size,0);
const liveIrbis=harness(friday);
liveIrbis.load('app/irbis/IrbisClient.tsx').default();await liveIrbis.mount();
await liveIrbis.advance(59000);assert.equal(liveIrbis.requests.filter(r=>r.url.startsWith('/api/irbis')).length,1);
await liveIrbis.advance(1001);assert.equal(liveIrbis.requests.filter(r=>r.url.startsWith('/api/irbis')).length,2);
await liveIrbis.visibility(true);const hiddenCount=liveIrbis.requests.length;
await liveIrbis.advance(300000);assert.equal(liveIrbis.requests.length,hiddenCount,'Hidden Irbis does not poll');
await liveIrbis.visibility(false);await liveIrbis.visibility(true);await liveIrbis.visibility(false);
assert.equal(liveIrbis.timers.size,2,'One date clock and one network timer');
liveIrbis.cleanup();assert.equal(liveIrbis.timers.size,0);
console.log('PASS: actual component polling, weekend/history suppression, close transition, Pallas cache policy, live OI/Irbis and focus cleanup.');
