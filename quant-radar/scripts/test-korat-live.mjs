import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../utils/oiLineLive.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function('exports','require',code)(exports,name=>({
  './aurumFeed':{getSharedOrdsToken:async()=> 'test-token',invalidateSharedOrdsToken:()=>{}},
  './resultCache':{resultCache:()=>async(_key,_ttl,loader)=>loader()},
  '@/app/oi-line-breaks/types':{lineKey:row=>`${row.symbol}|${row.leg}|${row.strike}`},
})[name]);

const day='2026-11-03',sig_date='20261103',cut='09:20';
const now=Date.parse('2026-11-03T09:21:00+05:30');
const common={sig_date,date:day,decision_cut:cut,version:1,ts:now/1000-20,
  available_at:'2026-11-03T09:20:40+05:30',prior_day:'2026-11-02'};
const index={...common,source:'oi_line_breaks_index',kind:'INDEX',
  Doc_ID:'oi-line-breaks|v1|20261103|INDEX|0920',coverage_counts:{status:'READY'}};
const snapshot={...common,source:'oi_line_breaks_0920',kind:'SNAPSHOT',
  Doc_ID:'oi-line-breaks|v1|20261103|SNAPSHOT|0920',setup:[],move:[],evidence:{}};
const originalFetch=globalThis.fetch,originalUrl=process.env.PANTHER_SIGNALS_URL;
process.env.PANTHER_SIGNALS_URL='https://example.test/ords/signals';
const reads=[];
globalThis.fetch=async url=>{
  const source=new URL(url).searchParams.get('src');
  reads.push(source);
  return new Response(JSON.stringify({items:[{doc:JSON.stringify(source==='oi_line_breaks_index'?index:snapshot)}],hasMore:false}),
    {status:200,headers:{'content-type':'application/json'}});
};
try{
  const sessions=[{date:day,cuts:0,coverage:'live_capture',last_cut:'',bytes:0}];
  const full=await exports.readLiveKorat(day,'latest',sessions,now);
  assert.equal(full.cut,cut);assert.equal(full.status,'READY');
  assert.deepEqual(reads,['oi_line_breaks_index','oi_line_breaks_0920']);
  reads.length=0;
  const unchanged=await exports.readLiveKorat(day,'latest',sessions,now,cut);
  assert.equal(unchanged.unchanged,true);
  assert.deepEqual(reads,['oi_line_breaks_index'],'unchanged cut must not fetch the full snapshot');
  assert.ok(JSON.stringify(unchanged).length<250,'unchanged response should be small');
  console.log('PASS: live index/snapshot read, source/date validation, unchanged-cut cursor budget');
}finally{globalThis.fetch=originalFetch;
  if(originalUrl===undefined)delete process.env.PANTHER_SIGNALS_URL;
  else process.env.PANTHER_SIGNALS_URL=originalUrl;}
