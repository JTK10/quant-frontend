import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const route=fs.readFileSync('app/api/oi-line-breaks/route.ts','utf8');
let denied=null;
const exports={};
const code=ts.transpileModule(route,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','require',code)(exports,name=>{
  if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,...options})}};
  if(name==='@/utils/auth')return {requireApiSession:async()=>denied};
  throw new Error('Retired route loaded an unexpected dependency: '+name);
});
const retired=await exports.GET({});
assert.equal(retired.status,410);
assert.equal(retired.body.replacement,'/sol');
assert.equal(retired.headers['Cache-Control'],'private, no-store');
denied={status:401};
assert.equal(await exports.GET({}),denied);
assert.ok(!fs.readFileSync('next.config.ts','utf8').includes('/api/oi-line-breaks'),
  'Retired API must not package the Korat archives into a Vercel function');
console.log('PASS: retired Korat API has no feed/archive dependencies, returns410 after auth and401 when denied.');
