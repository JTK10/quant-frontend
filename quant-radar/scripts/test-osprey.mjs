import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {gzipSync,gunzipSync} from 'node:zlib';

function load(path, dependencies={}, extra={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  vm.runInNewContext(code,{exports,require:name=>dependencies[name],Date,URL,Headers,
    Buffer,AbortController,AbortSignal,Response,...extra});
  return exports;
}
const policy=load('utils/sessionPolling.ts');
const model=load('app/osprey/model.ts');
const {createOspreyFeed}=load('app/osprey/feed.ts',{'@/utils/sessionPolling':policy,'./model':model});
const at=s=>Date.parse(s+'+05:30');
const friday='2026-10-09';
const testBoard=(date,cut='10:00')=>({date,source:'osprey',cut,cuts:[cut],rows:[],available:true});
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness(start, props={}) {
  let now=start,id=0,hidden=false,deferred=false,inflight=0,maxInflight=0;
  let resolve;
  const timers=new Map(),requests=[],states=[],errors=[],resets=[];
  const feed=createOspreyFeed({now:()=>now,hidden:()=>hidden,
    setTimer:(fn,ms)=>{timers.set(++id,{fn,due:now+ms});return id;},
    clearTimer:id=>timers.delete(id),
    onReset:date=>resets.push(date),onData:board=>states.push(board),onError:err=>errors.push(err),
    read:async(date,cut,signal)=>{
      requests.push({date,cut,signal});inflight++;maxInflight=Math.max(inflight,maxInflight);
      try {
        if(deferred) return await new Promise((ok,bad)=>{resolve=(data)=>data instanceof Error?bad(data):ok(data);});
        return testBoard(date,cut);
      } finally {inflight--;}
    },...props,
  });
  return {feed,requests,states,errors,resets,timers,defer:()=>{deferred=true;},
    resolve:data=>resolve(data),get maxInflight(){return maxInflight;},
    visibility:async value=>{hidden=value;feed.visibility();await flush();},
    advance:async ms=>{
      const end=now+ms;
      for(let i=0;i<2000;i++){
        const next=[...timers].filter(([,t])=>t.due<=end).sort(([,a],[,b])=>a.due-b.due)[0];
        if(!next){now=end;await flush();return;}
        now=next[1].due;timers.delete(next[0]);next[1].fn();await flush();
      }
      throw Error('Polling never settled');
    }};
}
const live=harness(at(friday+'T10:00:00'));
await flush();
assert.equal(live.requests.length,1);
await live.advance(299999);
assert.equal(live.requests.length,1);
live.defer();
await live.advance(1);
for(let i=0;i<10;i++) await live.visibility(i%2===0);
await live.advance(600000);
assert.equal(live.requests.length,2);
assert.equal(live.maxInflight,1);
await live.visibility(true);
live.resolve(new Error('transient'));
await flush();
assert.equal(live.states.at(-1).cut,'10:00');
assert.match(live.errors.at(-1),/last received/);
assert.equal(live.timers.size,0);
await live.visibility(false);
assert.equal(live.requests.length,3,'One request on visibility return');
live.feed.stop();
assert.ok(live.requests.at(-1).signal.aborted);

for(const [start,props] of [
  [at('2026-10-10T10:00:00'),{}],
  [at(friday+'T10:00:00'),{initialDate:'2026-10-08'}],
  [at(friday+'T10:00:00'),{initialDate:friday,selectedCut:'09:35'}],
]){
  const h=harness(start,props);await flush();await h.advance(2*60*60*1000);
  await h.visibility(true);await h.visibility(false);
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].cut,props.selectedCut);
  h.feed.stop();
}
const close=harness(at(friday+'T15:31:00'));
await flush();await close.advance(30*60000);
assert.equal(close.requests.length,2,'Exactly one closing read');
close.feed.stop();
const rollover=harness(at(friday+'T23:59:30'));
await flush();await rollover.advance(120000);
assert.deepEqual(rollover.requests.map(r=>r.date),[friday,'2026-10-10']);
assert.deepEqual(rollover.resets,[friday,'2026-10-10']);
rollover.feed.stop();

const now=at(friday+'T10:01:00');
const projected=model.projectBoard({...testBoard(friday),rows:[{
  symbol:'GVT&D',mode:'Tracked',side:'BULL',confirmed:'09:35',first:'09:30',
  score:34,rvol:2,evidence:'CE_BUILD 09:35: 123 (+4)',mfe:7,level:212,
}]},friday,null,now);
assert.equal(projected.rows[0].state,'Confirmed');
assert.equal(projected.rows[0].strikes,'CE buildup');
assert.ok(!('mfe' in projected.rows[0])&&!('level' in projected.rows[0]));
assert.equal(projected.rows[0].ce_pct,null,'Old snapshots remain readable');
const biasRow=model.projectBoard({...testBoard(friday),rows:[{
  symbol:'TEST',mode:'Tracked',side:'BULL',ce_pct:0,pe_pct:4.25,oi_bias:4.25,
}]},friday,null,now).rows[0];
assert.equal(biasRow.ce_pct,0,'Zero OI change is a valid reading');
assert.equal(biasRow.pe_pct,4.25);
assert.equal(biasRow.oi_bias,4.25);
const oldRow={symbol:'TEST',mode:'Tracked',side:'BULL',score:10};
const variants=[{id:'same',rows:[oldRow]},{id:'same',rows:[{...oldRow,ce_pct:0,pe_pct:4,oi_bias:4}]}];
assert.equal(model.selectSnapshotRows(variants)[0].oi_bias,4);
assert.equal(model.selectSnapshotRows([...variants].reverse())[0].ce_pct,0);
assert.throws(()=>model.selectSnapshotRows([variants[0],{id:'same',rows:[{...oldRow,score:20}]}]),/Conflicting/);
assert.throws(()=>model.selectSnapshotRows([variants[0],{...variants[1],id:'other'}]),/identity/);
assert.throws(()=>model.selectSnapshotRows([variants[1],{id:'same',rows:[{...oldRow,ce_pct:0,pe_pct:4,oi_bias:5}]}]),/Conflicting/);
assert.throws(()=>model.selectSnapshotRows([...variants,variants[0]]),/count/);
assert.throws(()=>model.projectBoard(testBoard(friday,'10:05'),friday,null,now),/cut/);
assert.throws(()=>model.projectBoard({...testBoard(friday),rows:[projected.rows[0],projected.rows[0]]},friday,null,now),/Duplicate/);

let allowed=true, cursor='osprey', failed=false;
const requests=[];
class NextResponse {
  constructor(body,init={}) {this.body=JSON.parse(body);this.status=init.status??200;this.headers=new Headers(init.headers);}
  static json(body,init) {return new NextResponse(JSON.stringify(body),init);}
}
const fakeDate='2020-11-12';
const doc=(source,cut,kind)=>({source,cap:'OSPREY',date:fakeDate,sig_date:'20201112',cut,kind,ts:at(fakeDate+'T'+cut+':05')/1000,encoding:'gzip+base64',payload:gzipSync('[]').toString('base64')});
const api=load('app/api/osprey/route.ts',{
  'next/server':{NextResponse},
  'node:zlib':{gunzipSync},
  '@/utils/auth':{requireApiSession:async()=>allowed?null:NextResponse.json({}, {status:401})},
  '@/utils/aurumFeed':{getSharedOrdsToken:async()=>'token',invalidateSharedOrdsToken:()=>{}},
  '@/utils/resultCache':load('utils/resultCache.ts'),
  '@/utils/sessionPolling':policy,
  '@/app/osprey/model':model,
  '@/utils/ospreySetupLevels':{ospreySetupLevels:async()=>({})},
},{process:{env:{PANTHER_SIGNALS_URL:'https://example.invalid/feed'}},
  fetch:async url=>{
    const source=url.searchParams.get('src');cursor=source;
    requests.push([source,url.searchParams.get('sig_date')]);
    if(failed) return new Response('',{status:503});
    const items=source==='osprey'?[doc('osprey','09:55','INDEX'),doc('osprey','10:00','INDEX')]:
      [doc(source, source==='osprey-0955'?'09:55':'10:00','SNAPSHOT')];
    return new Response(JSON.stringify({items:items.map(doc=>({doc:JSON.stringify(doc)}))}));
  },
});
const request=(date=fakeDate,cut='')=>({nextUrl:new URL('https://example.invalid/api/osprey?date='+date+(cut?'&cut='+cut:''))});
allowed=false;assert.equal((await api.GET(request())).status,401);assert.equal(requests.length,0);allowed=true;
assert.equal((await api.GET(request(fakeDate,'09:53'))).status,400);
const [latest,concurrent]=await Promise.all([api.GET(request()),api.GET(request())]);
assert.equal(latest.body.cut,'10:00');assert.equal(concurrent.body.cut,'10:00');
assert.equal(latest.body.cuts.join(','),'09:55,10:00');assert.deepEqual(requests,[['osprey','20201112'],['osprey-1000','20201112']]);
assert.match(latest.headers.get('Cache-Control'),/^private, max-age=3600/);
assert.equal((await api.GET(request(fakeDate,'09:55'))).body.cut,'09:55');assert.equal(cursor,'osprey-0955');
assert.equal(requests.length,3);
failed=true;const error=await api.GET(request('2020-11-11'));assert.equal(error.status,503);assert.equal(error.headers.get('Cache-Control'),'private, no-store');
console.log('Osprey polling, auth, projection and cache regressions passed.');
