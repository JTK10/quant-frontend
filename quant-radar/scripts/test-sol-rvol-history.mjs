import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import path from 'node:path';
import ts from 'typescript';

const exports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('utils/rustyHistory.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Map,Set,Promise,Buffer});
const {projectRustySnapshot}=exports;
const points={'09:55':{'TEST':[3.5,20,false]}};
let result=projectRustySnapshot({cut:'10:00',bull:[{s:'TEST',c_time:'09:55:00',ce_pct:-5,pe_pct:4}]},points);
assert.equal(result.bull[0].c_rvol,3.5);
assert.equal(result.bull[0].c_rvol_samples,20);
assert.equal(result.bull[0].c_rvol_source,'historical_cash');
assert.equal(result.bull[0].c_rvol_ohlc_match,false);
result=projectRustySnapshot({cut:'10:00',bull:[{s:'TEST',c_time:'09:55',c_rvol:1.25,c_rvol_samples:18}]},points);
assert.equal(result.bull[0].c_rvol,1.25,'Recorded RVOL wins over reconstruction');
assert.equal(result.bull[0].c_rvol_samples,18);
assert.ok(!('c_rvol_source' in result.bull[0]));
assert.ok(!('c_rvol' in projectRustySnapshot({cut:'09:55',bull:[{s:'TEST',c_time:'09:55'}]},points).bull[0]),'No forming candle');
assert.ok(!('c_rvol' in projectRustySnapshot({cut:'10:00',bull:[{s:'UNKNOWN',c_time:'09:55'}]},points).bull[0]),'No substitute symbol');
assert.ok(!('c_rvol' in projectRustySnapshot({cut:'10:00',bull:[{s:'TEST',c_time:'09:50'}]},points).bull[0]),'No substitute slot');

// Validate all packaged dates and demonstrate Nov6 finite values enter both lists.
const manifest=JSON.parse(fs.readFileSync('data/sol-rvol/manifest.json','utf8'));
for(const session of manifest.sessions){
  const data=JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/sol-rvol/${session.date}.json.gz`)));
  assert.equal(data.date,session.date);assert.equal(data.version,1);
  for(const rows of Object.values(data.points))for(const p of Object.values(rows)){
    assert.ok(Number.isFinite(p[0])&&p[0]>=0);assert.ok(Number.isInteger(p[1])&&p[1]>0&&p[1]<=20);
  }
}
const day=JSON.parse(zlib.gunzipSync(fs.readFileSync('data/sol-rvol/2026-11-06.json.gz')));
const cacheExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('utils/resultCache.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:cacheExports,Map,Promise,Buffer});
const archiveExports={};let fileReads=0;
new Function('exports','require',ts.transpileModule(fs.readFileSync('utils/rustyRvolArchive.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(archiveExports,name=>{
  if(name==='node:fs/promises')return {readFile:async file=>{fileReads++;return fs.promises.readFile(file);}};
  if(name==='node:zlib')return zlib;if(name==='node:path')return path;
  if(name==='@/data/sol-rvol/manifest.json')return manifest;
  if(name==='./resultCache')return cacheExports;
  throw new Error('Unexpected archive dependency '+name);
});
const [one,two]=await Promise.all([archiveExports.readRustyRvolArchive('20261106'),archiveExports.readRustyRvolArchive('20261106')]);
assert.equal(fileReads,1,'Concurrent historical cuts share one local file read');
assert.equal(one,two);assert.deepEqual(one,day.points);
await archiveExports.readRustyRvolArchive('20261106');assert.equal(fileReads,1,'Later cuts reuse the bounded archive cache');
assert.equal(await archiveExports.readRustyRvolArchive('../20261106'),undefined);
assert.equal(await archiveExports.readRustyRvolArchive('20260101'),undefined);
assert.equal(fileReads,1,'Unknown/invalid dates read no files');
const rankExports={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/sol/bullShortlist.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:rankExports,Map,Set});
const [hm,rows]=Object.entries(day.points).find(([hm,rows])=>hm==='09:55'&&Object.keys(rows).length>=10);
const fixture=Object.keys(rows).slice(0,12).map(s=>({s,c_time:hm,ce_pct:-3,pe_pct:4}));
const projected=projectRustySnapshot({cut:'10:00',bull:fixture},day.points).bull;
assert.equal(rankExports.bullShortlists(projected,5,'bull').pe.length,5);
assert.equal(rankExports.bullShortlists(projected,5,'bull').ce.length,5);
console.log(`PASS: ${manifest.sessions.length} historical RVOL archives, exact date/slot, recorded precedence, causal boundary and Nov6 top5 filters.`);
