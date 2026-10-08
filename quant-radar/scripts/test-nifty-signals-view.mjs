import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real page's effects and chart props without a broker or browser.
const today='2026-10-05';
const code=ts.transpileModule(fs.readFileSync('app/nifty-signals/NiftySignalsChart.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
}).outputText;
const snap=(date,expiry='2026-10-06',degraded=false,cut='15:30')=>({
  date,expiry,degraded,cut,time:Date.parse(`${date}T${cut}:00+05:30`)/1000,
  spot:22500,support:[[22300,1000,null]],resistance:[[22500,1000,null]],
});
function harness(date,oi,historyBars=[],oiLoading=false){
  const state=[],requests=[];let cursor=0,effects=[];
  const chart=()=>null;
  const jsx=(type,props,key)=>({type,props,key});
  const hooks={
    useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;
      return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},
    useMemo:fn=>fn(),useEffect:fn=>effects.push(fn),
  };
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>{
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='@/components/Controls')return {DatePicker:()=>null};
    if(name==='@/utils/backend')return {getTodayIstDate:()=>today};
    if(name==='../charts/LiveCandleChart')return {__esModule:true,default:chart};
    if(name==='../charts/useOIData')return {useOIData:()=>({data:oi,error:'',loading:oiLoading})};
    if(name.endsWith('.css'))return {};
    throw Error('Unexpected import '+name);
  },Date,AbortController,setTimeout:()=>1,clearTimeout:()=>{},fetch:async url=>{
    requests.push(url);
    return {ok:true,json:async()=>url.includes('chart-history')?{bars:historyBars}:{date,mode:'LIVE_PAPER',status:'Scan complete; no qualifying entry',signals:[]}};
  }});
  function find(node){
    if(!node||typeof node!=='object')return null;
    if(node.type===chart)return node.props;
    for(const child of [node.props?.children].flat()){
      const found=find(child);if(found)return found;
    }
    return null;
  }
  let tree;
  function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
  return {requests,text:()=>text(tree),render(){cursor=0;effects=[];tree=exports.default({initialDate:date,streamUrl:'wss://existing-stream'});return find(tree);},
    async start(){const cleanup=effects[0]();await new Promise(resolve=>setImmediate(resolve));return cleanup;}};
}

const oi={symbol:'NIFTY 50',date:today,intraday:[snap(today)],previous:[
  snap('2026-09-29'),snap('2026-10-01','2026-09-30'), // expired contract
  snap('2026-09-30'),snap('2026-10-01','2026-10-06',false,'15:25'),
  snap(today),snap('2026-10-06'), // same-day and future closes are unavailable
  snap('2026-10-03','2026-10-06',true), // partial capture cannot displace a valid close
  snap('2026-10-01'),
],errors:[]};
const live=harness(today,oi);
const initial=live.render();const cleanup=await live.start();const updated=live.render();
assert.equal(live.requests.filter(url=>url.includes('chart-history')).length,0,'No empty replay request may race the live snapshot');
assert.equal(updated.initialBars,initial.initialBars,'Signal polling must preserve the live chart seed identity');
assert.equal(updated.streamUrl,'wss://existing-stream');
assert.equal(updated.oiData.intraday.length,0);
assert.equal(updated.oiData.previous.length,1);
assert.equal(updated.oiData.previous[0].date,'2026-10-01');
assert.equal(updated.oiData.previous[0].cut,'15:30');
assert.ok(live.text().includes('expiry 2026-10-06'));
assert.equal(oi.previous.length,8,'Date filtering must not mutate shared cached OI');
cleanup();

const replayDate='2026-09-30';
const historicalBars=[{time:Date.parse(`${replayDate}T09:15:00+05:30`)/1000,open:1,high:2,low:1,close:2,volume:0}];
const historical=harness(replayDate,{...oi,date:replayDate,previous:[snap('2026-09-29'),snap('2026-09-30'),snap('2026-10-01')]},historicalBars);
historical.render();const historicalCleanup=await historical.start();const replay=historical.render();
assert.equal(historical.requests.filter(url=>url.includes('chart-history')).length,1);
assert.equal(replay.initialBars,historicalBars,'Historical candles must still seed the chart');
assert.equal(replay.streamUrl,'wss://existing-stream','Historical sessions must receive recorded candles from the existing chart service');
assert.equal(replay.strictSession,true,'Current-session stream updates must not enter a historical chart');
assert.ok(historical.text().includes('Historical candles'));
assert.equal(replay.oiData.previous[0].date,'2026-09-29');
historicalCleanup();

const empty=harness('2026-10-02',{...oi,date:'2026-10-02',previous:[]});
const emptyInitial=empty.render();const emptyCleanup=await empty.start();
assert.equal(empty.render().initialBars,emptyInitial.initialBars,'An empty historical response must keep the stable empty seed');
assert.equal(empty.render().streamUrl,'wss://existing-stream','Missing bundled dates must still load recorded chart history');
assert.equal(empty.render().oiData.previous.length,0);
emptyCleanup();
assert.ok(empty.text().includes('Previous-session OI unavailable'));
assert.ok(!empty.text().includes('Loading OI'));
const loading=harness(today,null,[],true);loading.render();assert.ok(loading.text().includes('Loading OI'));
const rolled=harness('2026-10-07',{...oi,date:'2026-10-07',previous:[snap('2026-10-06','2026-10-06'),snap('2026-10-06','2026-10-13')]});
assert.equal(rolled.render().oiData.previous[0].expiry,'2026-10-13');
console.log('PASS: live snapshot preservation, recorded historical stream, strict session isolation, replay fallback, latest eligible prior OI, expiry/date/partial exclusions and empty-session stability.');
