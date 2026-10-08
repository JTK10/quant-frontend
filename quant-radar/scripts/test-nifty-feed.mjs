import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('utils/niftyFeed.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness(statuses=[]){
  const exports={},requests=[];let tokens=0;
  vm.runInNewContext(code,{exports,URL,Date,Buffer,AbortSignal,process:{env:{PANTHER_CLIENT_ID:'test',PANTHER_CLIENT_SECRET:'test',PANTHER_TOKEN_URL:'https://test.invalid/oauth/token',PANTHER_SIGNALS_URL:'https://test.invalid/signals'}},fetch:async(url,options)=>{
    requests.push({url:String(url),authorization:options.headers.Authorization});
    if(String(url).endsWith('/oauth/token'))return {ok:true,status:200,json:async()=>({access_token:`token-${++tokens}`,expires_in:3600})};
    const status=statuses.shift()??200;
    return {ok:status===200,status,json:async()=>({items:[{doc:{source:new URL(url).searchParams.get('src')}}]})};
  }});
  return {load:exports.fetchNiftyFeed,requests,tokenCount:()=>tokens};
}
const concurrent=harness();
await Promise.all([concurrent.load('nifty_oi_close','2026-10-07'),concurrent.load('nifty_paper_signals','2026-10-08')]);
assert.equal(concurrent.tokenCount(),1,'Concurrent Nifty routes must share one token request');
await concurrent.load('nifty_paper_signals','2026-10-08');
assert.equal(concurrent.tokenCount(),1,'Ten-second signal polling must reuse a valid token');
assert.ok(concurrent.requests.some(r=>r.url.includes('sig_date=20261007')));
const revoked=harness([401,200]);
await revoked.load('nifty_oi_close','2026-10-07');
assert.equal(revoked.tokenCount(),2,'A rejected cached token must be replaced');
assert.deepEqual(revoked.requests.filter(r=>r.url.includes('/signals?')).map(r=>r.authorization),['Bearer token-1','Bearer token-2']);
const denied=harness([401,401]);
await assert.rejects(denied.load('nifty_paper_signals','2026-10-08'),/401/);
assert.equal(denied.tokenCount(),2,'Authentication retries must be bounded');
const unavailable=harness([503]);
await assert.rejects(unavailable.load('nifty_oi_close','2026-10-07'),/503/);
assert.equal(unavailable.tokenCount(),1,'An upstream outage must not be disguised as a successful empty feed');
console.log('PASS: Nifty token reuse, concurrent authentication, refreshed token on 401, bounded retry and feed failure reporting.');
