import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile = p => ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const effects=[],cleanups=[],timers=new Map();let id=0,listener,series=[];
const react={useEffect:fn=>effects.push(fn),useRef:value=>({current:value===null?{}:value}),useState:value=>[value,()=>{}],useCallback:fn=>fn};
const chart={addSeries:()=>{const s={data:[],setData(v){this.data=v},update(v){const i=this.data.findIndex(b=>b.time===v.time);if(i>=0)this.data[i]=v;else this.data.push(v)},priceScale:()=>({applyOptions(){}}),createPriceLine(){},removePriceLine(){},applyOptions(){}};series.push(s);return s},timeScale:()=>({setVisibleLogicalRange(){}}),remove(){}};
const dependencies={'react':react,'react/jsx-runtime':{jsx(){},jsxs(){}},'lightweight-charts':{createChart:()=>chart,ColorType:{Solid:1},LineStyle:{Solid:0},LineType:{WithSteps:1}},'@/utils/candleStream':{subscribeCandles:(_u,_s,fn)=>{listener=fn;return()=>{listener=undefined}}}};
const exports={};vm.runInNewContext(transpile('app/charts/LiveCandleChart.tsx'),{exports,require:n=>dependencies[n]??{},Intl,Date,Map,Set,Number,console,setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:i=>timers.delete(i)});
exports.default({symbol:'TEST',streamUrl:'ws://test',timeframe:'5m'});
for(const effect of effects){const c=effect();if(c)cleanups.push(c)}
const at=s=>Date.parse('2026-10-13T'+s+':00+05:30')/1000;
const bar=(time,close,volume)=>({type:'candle',symbol:'TEST',kind:'update',time,open:100,high:close,low:100,close,volume});
listener(bar(at('10:10'),110,50));listener(bar(at('10:15'),120,70));
for(const fn of timers.values())fn();timers.clear();
assert.equal(series[0].data.length,2,'Both boundary candles rendered');assert.equal(series[0].data[0].close,110);assert.equal(series[1].data[0].value,50);
const aggregated=exports.aggregateBars([bar(at('09:15'),110,50),bar(at('09:40'),120,60),bar(at('09:45'),130,70)],'30m');
assert.equal(aggregated.length,2);assert.equal(aggregated[0].time,at('09:15'));assert.equal(aggregated[1].time,at('09:45'));
cleanups.reverse().forEach(fn=>fn());assert.equal(listener,undefined);
// Shared socket visibility, snapshot-only history, cleanup and focus storms.
const listeners=new Map();let hidden=false;const sockets=[];
class Socket {static OPEN=1;constructor(){this.readyState=0;this.sent=[];sockets.push(this)}send(v){this.sent.push(JSON.parse(v))}close(){this.readyState=3}open(){this.readyState=1;this.onopen?.()}message(m){this.onmessage?.({data:JSON.stringify(m)})}}
const streams={};vm.runInNewContext(transpile('utils/candleStream.ts'),{exports:streams,Map,Set,JSON,WebSocket:Socket,document:{get hidden(){return hidden},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)},setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:i=>timers.delete(i)});
const a=streams.subscribeCandles('ws://test','A',()=>{},()=>{});const b=streams.subscribeCandles('ws://test','B',()=>{},()=>{});
assert.equal(sockets.length,1);sockets[0].open();assert.deepEqual([...sockets[0].sent.at(-1).symbols],['A','B']);
hidden=true;listeners.get('visibilitychange')();assert.equal(sockets[0].readyState,3);
hidden=false;listeners.get('visibilitychange')();listeners.get('visibilitychange')();assert.equal(sockets.length,2);
a();b();assert.equal(listeners.size,0);
const once=streams.subscribeCandles('ws://once','H',()=>{},()=>{},true);sockets.at(-1).open();sockets.at(-1).message({type:'snapshot',bars:[]});assert.equal(sockets.at(-1).readyState,3);once();
console.log('PASS: actual chart boundary render/volume, NSE30m alignment, shared socket, visibility/focus storm and historical one-shot cleanup');
