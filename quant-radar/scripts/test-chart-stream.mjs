import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile = p => ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
const rvolExports={};
vm.runInNewContext(transpile('app/charts/relativeVolume.ts'),{exports:rvolExports,Map,Number,Math,RangeError});
const seriesKinds={CandlestickSeries:'candles',HistogramSeries:'volume',LineSeries:'line',BaselineSeries:'baseline'};
const allAt=(day,hm)=>Date.parse(`${day}T${hm}:00+05:30`)/1000;
const at=s=>allAt('2026-10-13',s);
const bar=(time,close,volume,symbol='TEST')=>({type:'candle',symbol,kind:'update',time,open:100,high:close,low:100,close,volume});
function chartHarness(props={}) {
  const effects=[],cleanups=[],timers=new Map(),series=[],stateChanges=[],crosshairs=new Set();
  let nextTimer=0,listener;
  const paneFactors=[];
  const react={useEffect:fn=>effects.push(fn),useRef:value=>({current:value===null?{}:value}),useState:value=>[value,change=>stateChanges.push(change)],useCallback:fn=>fn};
  const chart={
    addSeries(kind,options,pane=0){
      const s={kind,options,pane,data:[],priceLines:[],
        setData(v){assert.equal(new Set(v.map(b=>b.time)).size,v.length,'No duplicate series timestamps');for(let i=1;i<v.length;i++)assert.ok(v[i-1].time<v[i].time,'Series timestamps sorted');this.data=v;},
        update(v){const i=this.data.findIndex(b=>b.time===v.time);if(i>=0)this.data[i]=v;else this.data.push(v);assert.equal(new Set(this.data.map(b=>b.time)).size,this.data.length,'No duplicate updates');},
        priceScale:()=>({applyOptions(){}}),createPriceLine(v){this.priceLines.push(v);return v;},removePriceLine(){},applyOptions(){}};
      series.push(s);return s;
    },
    panes:()=>[0,1].map(i=>({setStretchFactor:f=>{paneFactors[i]=f;}})),
    timeScale:()=>({setVisibleLogicalRange(){}}),
    subscribeCrosshairMove:fn=>crosshairs.add(fn),unsubscribeCrosshairMove:fn=>crosshairs.delete(fn),remove(){},
  };
  const dependencies={'react':react,'react/jsx-runtime':{jsx(){},jsxs(){}},'./relativeVolume':rvolExports,
    'lightweight-charts':{...seriesKinds,createChart:()=>chart,ColorType:{Solid:1},LineStyle:{Solid:0,Dashed:2},LineType:{WithSteps:1}},
    '@/utils/candleStream':{subscribeCandles:(_u,_s,fn)=>{listener=fn;return()=>{listener=undefined;};}}};
  const exports={};
  vm.runInNewContext(transpile('app/charts/LiveCandleChart.tsx'),{exports,require:n=>dependencies[n]??{},Intl,Date,Map,Set,Number,console,setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:i=>timers.delete(i)});
  exports.default({symbol:'TEST',streamUrl:'ws://test',timeframe:'5m',...props});
  for(const effect of effects){const cleanup=effect();if(cleanup)cleanups.push(cleanup);}
  return {exports,series,stateChanges,crosshairs,paneFactors,chart,
    emit:v=>{assert.ok(listener,'Active candle listener');listener(v);},
    flush:()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn();},
    close:()=>{cleanups.reverse().forEach(fn=>fn());assert.equal(listener,undefined);assert.equal(timers.size,0);assert.equal(crosshairs.size,0,'Crosshair listener cleaned up');}};
}
// Original raw-volume/boundary behavior remains the shared-chart default.
let h=chartHarness();
h.emit(bar(at('10:10'),110,50));h.emit(bar(at('10:15'),120,70));h.flush();
assert.equal(h.series[0].data.length,2,'Both boundary candles rendered');
assert.equal(h.series[0].data[0].close,110);assert.equal(h.series[1].data[0].value,50);
assert.equal(h.series[1].kind,'volume');
const aggregated=h.exports.aggregateBars([bar(at('09:15'),110,50),bar(at('09:40'),120,60),bar(at('09:45'),130,70)],'30m');
assert.equal(aggregated.length,2);assert.equal(aggregated[0].time,at('09:15'));assert.equal(aggregated[1].time,at('09:45'));
h.close();
h=chartHarness({symbol:'NIFTY 50',initialBars:[bar(at('10:00'),110,700,'NIFTY 50')]});
assert.equal(h.series.find(s=>s.kind==='volume').data[0].value,700,'Nifty Signals still gets raw volume by default');
assert.equal(h.series.filter(s=>s.options?.title==='RVOL').length,0);
h.close();
// Twenty previous weekday sessions at the same clock slot. Other slots cannot affect reference.
const previousDays=[];
for(let t=Date.UTC(2026,9,12);previousDays.length<20;t-=86400000){const d=new Date(t);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)previousDays.unshift(d.toISOString().slice(0,10));}
const history=previousDays.flatMap(day=>[bar(allAt(day,'10:00'),110,100),bar(allAt(day,'10:05'),110,9999)]);
h=chartHarness({relativeVolume:true,strictSession:true,includePreviousSession:false,sessionDate:'2026-10-13',initialBars:[...history,bar(at('10:00'),110,300)]});
const candles=h.series.find(s=>s.kind==='candles');const rvol=h.series.find(s=>s.options?.title==='RVOL');
assert.ok(rvol,'RVOL series exists');assert.equal(rvol.kind,'line');assert.equal(rvol.pane,1,'RVOL has its own pane');
assert.equal(h.series.filter(s=>s.kind==='volume').length,0,'Raw volume replaced only in RVOL mode');
assert.equal(h.paneFactors[0],4);assert.equal(h.paneFactors[1],1);
assert.equal(rvol.priceLines.length,1);assert.equal(rvol.priceLines[0].price,2);
assert.equal(rvol.data.length,1,'Strict replay displays only target session');assert.equal(candles.data.length,1);
assert.equal(rvol.data[0].value,3,'Baseline retains previous20 sessions despite strict display filtering');
assert.equal(candles.data[0].color,'#f59e0b','Exactly3x is orange (>2), not green (>3)');
assert.ok(h.stateChanges.some(v=>typeof v==='string'&&v.includes('20/20 sessions')),'Actual sample count reaches label');
h.emit(bar(at('10:00'),112,400));h.flush();
assert.equal(rvol.data.length,1);assert.equal(rvol.data[0].value,4,'Live bar revision uses stable historical denominator');
assert.equal(candles.data[0].color,'#22c55e','Above3x candle green');
assert.equal(candles.data[0].wickColor,'#22c55e');
for(const crosshair of h.crosshairs)crosshair({time:at('10:00')});
assert.ok(h.stateChanges.some(v=>typeof v==='string'&&v.includes('4.00')),'Crosshair can report RVOL value');
h.close();
// No history is whitespace, not fabricated zero volume or 1x RVOL.
h=chartHarness({relativeVolume:true,sessionDate:'2026-10-13',strictSession:true,initialBars:[bar(at('10:00'),110,300)]});
const missing=h.series.find(s=>s.options?.title==='RVOL').data[0];
assert.equal(missing.time,at('10:00'));assert.equal('value' in missing,false);
assert.equal(h.series.find(s=>s.kind==='candles').data[0].color,undefined);
h.close();
const timers=new Map();let id=0;
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
console.log('PASS: actual chart RVOL/default volume, pane/threshold/live revision/history/whitespace, NSE30m alignment, shared socket, visibility/focus storm and historical one-shot cleanup');
