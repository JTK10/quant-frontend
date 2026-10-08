import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

let authenticated=true;
const json=(body,init={})=>({body,status:init.status??200,headers:new Headers(init.headers)});
const NextResponse={json,next:()=>({headers:new Headers()}),redirect:()=>({status:307})};
const auth={SESSION_COOKIE:'test',validSession:async()=>authenticated,sameOrigin:()=>true,
  requireApiSession:async()=>authenticated?null:json({error:'Please sign in'},{status:401,headers:{'Cache-Control':'private, no-store'}})};
function load(path,dependencies,globals={}){
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,Headers,URL,Date,Buffer,AbortSignal,...globals,require:name=>dependencies[name]});
  return exports;
}
const proxy=load('proxy.ts',{'next/server':{NextResponse},'@/utils/auth':auth}).proxy;
const request=path=>({nextUrl:new URL('https://test.invalid'+path),url:'https://test.invalid'+path,method:'GET',headers:new Headers(),cookies:{get:()=>({value:'test'})}});
assert.equal((await proxy(request('/api/pallas'))).headers.get('Cache-Control'),null,'Route must own Pallas cache headers');
assert.equal((await proxy(request('/api/nifty-signals'))).headers.get('Cache-Control'),'private, no-store','Other endpoints keep their policy');
authenticated=false;
assert.equal((await proxy(request('/api/pallas'))).status,401);
assert.equal((await proxy(request('/api/pallas'))).headers.get('Cache-Control'),'private, no-store');
authenticated=true;
const feedDeps={
  'next/server':{NextResponse},'node:fs/promises':{readFile:async()=>JSON.stringify([])},'node:path':{join:(...parts)=>parts.join('/')},
  '@/utils/auth':auth,'@/utils/backend':{getTodayIstDate:()=> '2026-10-09'},
  '@/utils/pallas':{PALLAS_DATES:['2026-10-08'],foldPallas:()=>({signals:[]})},
  '@/utils/pallasFeed':{pallasInflight:()=>async(_key,fn)=>fn(),newPallasReadBudget:()=>({}),readPallasFeed:async()=>({documents:[{}],next:undefined})},
  '@/utils/pallasTime':{pallasAsOf:()=>Date.now()},
};
const route=load('app/api/pallas/route.ts',feedDeps,{
  process:{cwd:()=>'.',env:{PANTHER_CLIENT_ID:'test',PANTHER_CLIENT_SECRET:'test',PANTHER_TOKEN_URL:'https://test.invalid/token',PANTHER_SIGNALS_URL:'https://test.invalid/feed'}},
  fetch:async()=>({ok:true,status:200,json:async()=>({access_token:'test',expires_in:3600})}),
});
assert.equal((await route.GET(request('/api/pallas?mode=history&date=2026-10-08'))).headers.get('Cache-Control'),'private, max-age=3600, stale-while-revalidate=86400');
assert.equal((await route.GET(request('/api/pallas?mode=live&date=2026-10-09'))).headers.get('Cache-Control'),'private, max-age=15, stale-while-revalidate=30');
authenticated=false;
const denied=await route.GET(request('/api/pallas?mode=history&date=2026-10-08'));
assert.equal(denied.status,401);assert.equal(denied.headers.get('Cache-Control'),'private, no-store');
console.log('PASS: Pallas private live/history cache TTLs, authenticated proxy pass-through, anonymous rejection and unchanged other-route policy.');
