// Bounded local replay of actual recorded feeds; never load-tests production.
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const root=process.argv[2];if(!root)throw Error('Pass the downloaded research folder');
const documents=JSON.parse(fs.readFileSync(root+'/oracle_documents_20261012.json','utf8'));
const docs=documents.filter(d=>d.source==='rusty');
const source=fs.readFileSync('app/api/panther-signals/route.ts','utf8');
const oldSource=execFileSync('git',['show','502e416:quant-radar/app/api/panther-signals/route.ts'],{encoding:'utf8'});
const compile=(text,deps,globals={})=>{const exports={};vm.runInNewContext(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Date,Intl,Buffer,Headers,URL,Response,AbortSignal,Map,Set,console,...globals,require:name=>deps[name]});return exports;};
const resultCache=compile(fs.readFileSync('utils/resultCache.ts','utf8'),{}).resultCache;
const backend=compile(fs.readFileSync('utils/backend.ts','utf8'),{'./symbolMap.json':JSON.parse(fs.readFileSync('utils/symbolMap.json','utf8'))});
class NextResponse extends Response{static json(body,init){return new NextResponse(JSON.stringify(body),init);}}
const payload=JSON.stringify({items:docs.map(doc=>({doc:JSON.stringify(doc)})),hasMore:false});
const init=text=>compile(text,{'next/server':{NextResponse},'@/utils/auth':{requireApiSession:async()=>null},'@/utils/backend':{...backend,getTodayIstDate:()=> '2026-10-13'},'@/utils/resultCache':{resultCache}},
 {process:{env:{PANTHER_CLIENT_ID:'test',PANTHER_CLIENT_SECRET:'test',PANTHER_TOKEN_URL:'https://test.invalid/token',PANTHER_SIGNALS_URL:'https://test.invalid/feed'}},fetch:async url=>new Response(String(url).includes('/token')?JSON.stringify({access_token:'test',expires_in:3600}):payload)});
const req=q=>({nextUrl:new URL('https://test.invalid/api/panther-signals?'+q)});
async function sample(route,query){const cpu=process.cpuUsage(),start=performance.now();const response=await route.GET(req(query));const text=await response.text();if(response.status!==200)throw Error(text);const used=process.cpuUsage(cpu),body=JSON.parse(text);return {cpu_ms:(used.user+used.system)/1000,elapsed_ms:performance.now()-start,bytes:Buffer.byteLength(text),cuts:Array.isArray(body)?body.length:body.snapshots.length,timeline_cuts:body.cuts?.length};}
const query='date=2026-10-12&sources=rusty';
const old=init(oldSource),current=init(source);
const baseline=await sample(old,query);
const initial=await sample(current,query+'&view=rusty');
const latest=docs.map(s=>s.cut).sort().at(-1);
const incremental=await sample(current,query+'&view=rusty&after='+latest);
const cached=await sample(current,query+'&view=rusty&after='+latest);
const report={fixture:{documents:docs.length,raw_feed_bytes:Buffer.byteLength(payload)},old_full:baseline,new_initial:initial,new_incremental:incremental,new_cached:cached,
 incremental_byte_reduction_pct:100*(1-incremental.bytes/baseline.bytes),peak_local_rss_mb:process.resourceUsage().maxRSS/1024,
 cadence:{old_requests_per_hour:80,new_normal_requests_per_hour:12,new_max_delayed_retry_requests_per_hour:24},
 caveat:'Local API replay, not Vercel billing measurement; page render savings excluded. Cold starts and users on separate instances reduce process-local cache reuse.'};
console.log(JSON.stringify(report,null,2));
