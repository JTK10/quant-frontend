import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const read=p=>fs.readFileSync(p,'utf8');
const json=p=>JSON.parse(read(p));
const overrides=json('app/sector/sectorOverrides.json');
const production=json('../backend/osprey/sectors.json');
assert.equal(Object.keys(overrides).length,5);
for(const [symbol,sector] of Object.entries(overrides))assert.equal(production[symbol],sector);
const exports={};
class Response {
 constructor(body,options){this.body=body;this.options=options;}
}
const dependencies={
 'next/server':{NextResponse:Response},
 '@/utils/auth':{requireApiSession:async()=>null},
 '@/utils/sessionPolling':{istSessionDate:()=> '2026-11-16'},
 '@/app/rusty/sectors.json':json('app/rusty/sectors.json'),
 './industryFallback.json':json('app/sector/workspace/industryFallback.json'),
 '../sectorOverrides.json':overrides,
 '../baselinePrepared.json':{'2026-11-13':{'10:00':{'CEMENT|ALL':[10,4],'BANK|ALL':[5,22],'METAL|ALL':[1,11]}}},
 '../workspaceTemplate':'<script>/*__PAYLOAD__*/</script>',
 '../workspaceRuntime':'',
};
vm.runInNewContext(ts.transpileModule(read('app/sector/workspace/route.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,{exports,Map,Set,Date,JSON,require:name=>{
 assert(name in dependencies,`Unexpected dependency ${name}`);return dependencies[name];
}});
const response=await exports.GET({nextUrl:{searchParams:new URLSearchParams('date=2026-11-16')}});
const members=JSON.parse(response.body.match(/const MEMBERS=(.*?);const BASELINE=/s)[1]);
const history=JSON.parse(response.body.match(/const BASELINE=(.*?);/s)[1]);
for(const [symbol,sector] of Object.entries(overrides)){
 assert(members[sector].includes(symbol));
 assert.equal(Object.values(members).flat().filter(s=>s===symbol).length,symbol==='AUBANK'?3:1,
  `${symbol}: one primary group; bank retains BANK and FIN SERVICE aggregates`);
}
assert.equal(members['PVT BANK'].length,14);
assert.equal(members.CEMENT.length,5);
assert.equal(members['Consumer Durables'].length,9);
assert.equal(members['Capital Goods'].length,12);
for(const removed of ['Construction Materials','Construction','Textiles'])assert(!(removed in members));
assert(!('CEMENT|ALL' in history['10:00']),'Changed groups must not use old-membership baselines');
assert('BANK|ALL' in history['10:00']);
assert('METAL|ALL' in history['10:00']);
assert.equal(response.options.headers['Cache-Control'],'private, max-age=300');
assert(read('app/sector/SectorWorkspace.tsx').includes('mapping=20261116'));
console.log('PASS: real Sector Scope route applies five changes, matches Osprey, preserves bank aggregates, drops empty groups and invalidates incompatible baselines.');
