import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {foldPallas} from '../utils/pallas.ts';
import {readPallasFeed,newPallasReadBudget,pallasInflight} from '../utils/pallasFeed.ts';
import {initialPallasRefresh,pallasRefreshReducer,pallasRefreshView} from '../utils/pallasRefresh.ts';

const date='2026-10-01',limit=Date.parse(date+'T11:30:00+05:30');
const originals=JSON.parse(await fs.readFile('data/pallas/'+date+'.json','utf8'));
const signal=originals.find(d=>d.kind==='CONFIRMED').signals[0];
const bars=Array.from({length:213},(_,s)=>Array.from({length:30},(_,i)=>[
  s===0?signal.Symbol:'STOCK'+s,`${String(9+Math.floor((15+i*5)/60)).padStart(2,'0')}:${String((15+i*5)%60).padStart(2,'0')}`,
  100,101,99,100,Date.parse(date+'T11:30:00+05:30')/1000])).flat();
const repeated=Array.from({length:30},(_,i)=>({source:'pallas',sig_date:'20261001',available_at:date+'T11:29:00+05:30',
  Doc_ID:'large-snapshot-'+i,kind:'SNAPSHOT',status:'Monitoring · हिन्दी',cut:'11:25',signals:[],candidates:[],quotes:[],bars}));
const mutation={...originals.find(d=>d.kind==='CONFIRMED'),Doc_ID:'later-duplicate',available_at:date+'T11:29:00+05:30',signals:[{...signal,Reference_Premium:99999,AI_Score:1}]};
const docs=[...originals,...repeated,mutation].reverse();
const payload=JSON.stringify({items:docs.map(doc=>({doc:JSON.stringify(doc)})),hasMore:false,links:[]});
assert.ok(Buffer.byteLength(payload)>6000000);
const start=performance.now(),budget=newPallasReadBudget();
const result=await readPallasFeed(new Response(payload),date,undefined,budget);
assert.deepEqual(foldPallas(result.documents,date,limit),foldPallas(docs,date,limit));
assert.ok(result.documents.every(d=>d.bars===undefined));
assert.ok(JSON.stringify(result.documents).length<payload.length/10);
assert.equal(foldPallas(result.documents,date,limit).signals.find(s=>s.Event_ID===signal.Event_ID).Reference_Premium,signal.Reference_Premium);
console.log(`PASS ${budget.bytes} upstream bytes > old 6 MB limit; streaming strips other stocks' candle history, keeps frozen signals (${Math.round(performance.now()-start)} ms)`);

const inspector=await readPallasFeed(new Response(payload),date,signal.Symbol,newPallasReadBudget());
assert.deepEqual(foldPallas(inspector.documents,date,limit,signal.Symbol),foldPallas(docs,date,limit,signal.Symbol));
assert.ok(inspector.documents.every(d=>!d.bars||d.bars.every(b=>b[0]===signal.Symbol)));
assert.deepEqual(foldPallas(inspector.documents,date,limit-1,signal.Symbol),foldPallas(docs,date,limit-1,signal.Symbol));
console.log('PASS inspector symbol isolation, completed-candle/receipt cutoffs and unsorted frozen duplicates');

const tiny=JSON.stringify({items:[{doc:JSON.stringify({...originals[0],status:'हिन्दी · UTF8'})}],hasMore:true,links:[{rel:'next',href:'https://example.test/feed?offset=20'}]});
const bytes=Buffer.from(tiny);
const fragmented=new Response(new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();}}));
const page=await readPallasFeed(fragmented,date,undefined,newPallasReadBudget());
assert.equal(page.next,'https://example.test/feed?offset=20');
assert.equal(page.documents[0].status,'हिन्दी · UTF8');
assert.equal((await readPallasFeed(new Response('{"items":[]}'),date,undefined,newPallasReadBudget())).documents.length,0);
for(const body of ['{"items":[',JSON.stringify({error:'bad feed'}),JSON.stringify({items:[],hasMore:true}),'{"items":null}']) {
  await assert.rejects(readPallasFeed(new Response(body),date,undefined,newPallasReadBudget()));
}
await assert.rejects(readPallasFeed(new Response(tiny),date,undefined,{bytes:0,documents:0,maxBytes:10}));
console.log('PASS split UTF8, valid empty session, next-page metadata, malformed/truncated/missing/over-budget feed rejection');

const share=pallasInflight();let calls=0,release;
const blocked=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
const one=share(date,blocked),two=share(date,blocked);assert.equal(one,two);assert.equal(calls,1);
release('fresh');assert.equal(await two,'fresh');
assert.equal(await share(date,async()=>{calls++;return 'next update';}),'next update');assert.equal(calls,2);
await assert.rejects(share(date,async()=>{throw new Error('outage');}));
assert.equal(await share(date,async()=>'recovered'),'recovered');
console.log('PASS simultaneous readers share a request; later reads and recovered failures fetch afresh');

const data=foldPallas(originals,date,limit),key='live|'+date+'|';
let state=pallasRefreshReducer(initialPallasRefresh,{type:'reset',key});
state=pallasRefreshReducer(state,{type:'success',key,data});
state=pallasRefreshReducer(state,{type:'failure',key,error:'HTTP 503'});
assert.equal(pallasRefreshView(state,key).data,data);assert.equal(state.error,'HTTP 503');
const newer={...data,cut:'11:30'};state=pallasRefreshReducer(state,{type:'success',key,data:newer});
assert.equal(state.error,'');assert.equal(state.data,newer);
const next='live|2026-10-05|';assert.equal(pallasRefreshView(state,next).data,null);
state=pallasRefreshReducer(state,{type:'reset',key:next});
state=pallasRefreshReducer(state,{type:'success',key,data});assert.equal(state.data,null);
const replay='research|'+date+'|600';state=pallasRefreshReducer(state,{type:'reset',key:replay});
state=pallasRefreshReducer(state,{type:'success',key:replay,data});
assert.equal(pallasRefreshView(state,'research|'+date+'|555').data,null);
state=pallasRefreshReducer(state,{type:'reset',key:'research|'+date+'|555'});
state=pallasRefreshReducer(state,{type:'failure',key:'research|'+date+'|555',error:'outage'});
assert.equal(state.data,null);
console.log('PASS failed refresh retains same-session board, success recovers, date/mode/rewind immediately hide old data and late requests cannot restore it');
