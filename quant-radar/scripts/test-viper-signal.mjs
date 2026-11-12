import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, deps = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  vm.runInNewContext(code, {exports, require: name => deps[name], Date, URL, Headers, AbortSignal, AbortController, Buffer, ...globals});
  return exports;
}
const baseModel = load('app/viper/model.ts');
const model = load('app/viper-signal/model.ts', {'../viper/model':baseModel});
const polling = load('utils/sessionPolling.ts');
const {createViperFeed} = load('app/viper-signal/feed.ts', {'./model': model, '@/utils/sessionPolling': polling});
const nowIst = (date, time) => Date.parse(date + 'T' + time + ':00+05:30');
const flush = async () => {for (let i = 0; i < 10; i++) await Promise.resolve();};
const board = (date, cut = '09:15') => ({source:'viper-signal', date, baseline:'2026-11-11', lastCut:cut, cuts:[{cut, bull:[], bear:[]}]});
function scenario(time, {history, pending = false} = {}) {
  let now = time, hidden = false, timerId = 0;
  const timers = new Map(), calls = [], events = [], pendingReads = [];
  const feed = createViperFeed({
    initialDate: history, now: () => now, hidden: () => hidden,
    setTimer: (fn, ms) => {const id=++timerId; timers.set(id, {fn, time:now+ms}); return id;},
    clearTimer: id => timers.delete(id),
    read: (date, known, signal) => {
      calls.push({date, known:[...known], signal});
      return pending ? new Promise((resolve,reject) => pendingReads.push({resolve,reject}))
        : Promise.resolve(board(date));
    },
    onReset: date => events.push(['reset',date]),
    onData: data => events.push(['data',data]),
    onError: error => events.push(['error',error]),
  });
  return {
    calls, events, timers, pendingReads, feed,
    at: value => {now=value; for (const [id,t] of [...timers]) if (t.time <= now) {timers.delete(id);t.fn();}},
    show: value => {hidden=!value; feed.visibility();},
  };
}
const historical = scenario(nowIst('2026-11-12','10:00'), {history:'2026-11-11'});
await flush();
historical.at(nowIst('2026-11-12','12:00'));
historical.show(false);historical.show(true);
assert.equal(historical.calls.length,1);
assert.equal(historical.timers.size,0);
historical.feed.stop();

const weekend = scenario(nowIst('2026-11-14','10:00'));
await flush();
weekend.at(nowIst('2026-11-14','12:00'));
await flush();
assert.equal(weekend.calls.length,1);
weekend.at(nowIst('2026-11-16','09:30'));
await flush();
assert.equal(weekend.calls.at(-1).date,'2026-11-16');
weekend.feed.stop();

const live = scenario(nowIst('2026-11-12','15:30'), {pending:true});
for(let i=0;i<15;i++) live.show(true);
assert.equal(live.calls.length,1);
live.pendingReads[0].resolve(board('2026-11-12','15:25'));
await flush();
live.show(false);
assert.equal(live.timers.size,0);
live.at(nowIst('2026-11-12','15:36'));
assert.equal(live.calls.length,1);
for(let i=0;i<15;i++) live.show(true);
assert.equal(live.calls.length,2);
assert.deepEqual(live.calls[1].known,['15:25']);
live.pendingReads[1].reject(new Error('outage'));
await flush();
assert.equal(live.events.at(-1)[0],'error');
assert.equal(live.events.filter(([kind])=>kind==='reset').length,1);
assert.equal(live.events.findLast(([kind])=>kind==='data')[1].lastCut,'15:25');
live.at(nowIst('2026-11-12','16:30'));
assert.equal(live.calls.length,2);
live.at(nowIst('2026-11-13','09:15'));
assert.equal(live.calls.at(-1).date,'2026-11-13');
assert.deepEqual(live.calls.at(-1).known,[]);
live.feed.stop();
assert.equal(live.calls.at(-1).signal.aborted,true);

let authenticated = false, originReads = 0, today='2026-11-12';
const auth = {requireApiSession:async()=>authenticated ? null : Response.json({}, {status:401}),validSession:async()=>authenticated};
class NextResponse extends Response {
  static next() {return new Response();}
  static redirect() {return new Response(null,{status:307});}
}
const mock = {source:'viper-signal',engine:'phoenix-live-v1',kind:'SNAPSHOT',sig_date:'20261111',date:'2026-11-11',
  baseline:'2026-11-09',cut:'09:45',Doc_ID:'viper-signal|phoenix-live-v1|20261111|0945',
  ts:nowIst('2026-11-11','09:46')/1000,recovered:true,bull:[{
    symbol:'RVNL',side:'BULL',cut:'09:45',route:'Standard ignition',strike:200,level:202,
    expiry:'2026-11-23',rvol:2.1,activeRvol:3.1,unwind:-20,opposite:5,
    oppositeConfirmed:true,first:true,
  }],bear:[]};
const request = path => ({url:'https://unit.invalid'+path,nextUrl:new URL('https://unit.invalid'+path),method:'GET',
  headers:new Headers(),cookies:{get:()=>({value:'mock'})}});
const route = load('app/api/viper-signal/route.ts', {
  'next/server':{NextResponse},'@/utils/auth':auth,'@/utils/aurumFeed':{getSharedOrdsToken:async()=>'mock'},
  '@/utils/sessionPolling':{istSessionDate:()=>today},'@/utils/resultCache':load('utils/resultCache.ts',{}),
  '@/app/viper-signal/model':model,
}, {process:{env:{PANTHER_SIGNALS_URL:'https://origin.invalid/feed'}},fetch:async url=>{
  originReads++;
  assert.equal(url.searchParams.get('src'),'viper-signal');
  assert.equal(url.searchParams.get('sig_date'),'20261111');
  return Response.json({items:[{doc:JSON.stringify(mock)}],hasMore:false});
}});
assert.equal((await route.GET(request('/api/viper-signal?date=2026-11-11'))).status,401);
assert.equal(originReads,0);
authenticated=true;
assert.equal((await route.GET(request('/api/viper-signal?date=2026-11-11&known=09:43'))).status,400);
const [full,delta] = await Promise.all([
  route.GET(request('/api/viper-signal?date=2026-11-11')),
  route.GET(request('/api/viper-signal?date=2026-11-11&known=09:45')),
]);
assert.equal(originReads,1);
assert.equal(full.headers.get('cache-control'),'private, max-age=3600, stale-while-revalidate=86400');
const fullBoard = await full.json();
assert.equal(fullBoard.cuts[0].recovered,true);
assert.equal(fullBoard.cuts[0].bull[0].symbol,'RVNL');
assert.equal(fullBoard.cuts[0].bull[0].oppositeConfirmed,true);
assert.equal(fullBoard.cuts[0].bull[0].expiry,undefined);
assert.deepEqual((await delta.json()).cuts,[]);
const proxy = load('proxy.ts', {'next/server':{NextResponse},'@/utils/auth':auth}).proxy;
assert.equal((await proxy(request('/api/viper-signal'))).headers.get('cache-control'),null);
console.log('PASS: Viper historical and weekend cadence, hidden tab, close and rollover, single in-flight request, stale preservation, private cache, origin deduplication and snapshot delta.');
