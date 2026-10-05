import {Readable} from 'node:stream';
import chain from 'stream-chain';
import {parser, type Token} from 'stream-json/parser.js';
import {pick} from 'stream-json/filters/pick.js';
import {streamValues} from 'stream-json/streamers/stream-values.js';
import type {PallasDocument} from './pallas';

// ORDS uses an unpaged custom handler: its limit hint does not bound this
// response. Consume it one document at a time instead of assembling every
// stock's repeated candle history in memory. Never return a partial feed.
export type PallasReadBudget = {bytes:number; documents:number; maxBytes:number};
export const newPallasReadBudget = ():PallasReadBudget => ({bytes:0,documents:0,maxBytes:64*1024*1024});

export async function readPallasFeed(response:Response, date:string, symbol:string|undefined, budget:PallasReadBudget) {
  if(!response.body)throw new Error('Empty feed response');
  const reader=response.body.getReader(), decoder=new TextDecoder();
  async function* chunks() {
    try {
      for(;;) {
        const {done,value}=await reader.read();
        if(done)break;
        budget.bytes+=value.byteLength;
        if(budget.bytes>budget.maxBytes)throw new Error('Feed exceeded streamed budget');
        yield decoder.decode(value,{stream:true});
      }
      yield decoder.decode();
    } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  let depth=0, itemsKey=false, itemsSeen=false, hasMore=false, next:string|undefined;
  const documents:PallasDocument[]=[];
  const pipeline=chain([
    Readable.from(chunks()),
    parser({streamValues:false}),
    (token:Token)=>{
      if(depth===0&&token.name!=='startObject')throw new Error('Invalid feed envelope');
      if(itemsKey) {
        if(token.name!=='startArray')throw new Error('Invalid feed items');
        itemsSeen=true;itemsKey=false;
      }
      if(token.name==='keyValue'&&depth===1&&token.value==='items')itemsKey=true;
      if(token.name==='startObject'||token.name==='startArray')depth++;
      if(token.name==='endObject'||token.name==='endArray')depth--;
      if(depth>32)throw new Error('Feed nesting exceeded budget');
      if(token.name==='stringValue'&&Buffer.byteLength(token.value)>2*1024*1024)throw new Error('Feed document exceeded budget');
      return token;
    },
    pick({filter:/^items\.\d+$|^(hasMore|links)$/}),
    streamValues()
  ]);
  try {
    for await(const item of pipeline) {
      const value:unknown=item.value;
      if(typeof value==='boolean'){hasMore=value;continue;}
      if(Array.isArray(value)) {
        if(value.length>20)throw new Error('Invalid feed links');
        const link=value.find(v=>v?.rel==='next');
        if(link){if(typeof link.href!=='string')throw new Error('Invalid next link');next=link.href;}
        continue;
      }
      if(!value||typeof value!=='object')throw new Error('Invalid feed item');
      if(++budget.documents>10000)throw new Error('Feed document count exceeded budget');
      const row=value as {doc?:unknown};
      let doc:PallasDocument;
      try {doc=(typeof row.doc==='string'?JSON.parse(row.doc):row.doc??row) as PallasDocument;}catch{continue;}
      if(!doc||doc.source!=='pallas'||String(doc.sig_date)!==date.replaceAll('-',''))continue;
      documents.push({source:doc.source,sig_date:doc.sig_date,available_at:doc.available_at,Doc_ID:doc.Doc_ID,
        kind:doc.kind,status:doc.status,cut:doc.cut,health:doc.health,
        signals:doc.signals,candidates:doc.candidates,quotes:doc.quotes,
        // The board never needs candles. The inspector reads only its symbol.
        bars:symbol&&Array.isArray(doc.bars)?doc.bars.filter(b=>b[0]===symbol):undefined});
    }
    if(!itemsSeen)throw new Error('Missing feed items');
    if(hasMore&&!next)throw new Error('Incomplete feed page');
    return {documents,next};
  } finally {pipeline.destroy();await reader.cancel().catch(()=>{});}
}

// Match the retained pages' in-flight sharing, without a result cache or a
// stale-success fallback. Separate dates/symbols/as-of boundaries never mix.
export function pallasInflight<T>() {
  const pending=new Map<string,Promise<T>>();
  return (key:string,load:()=>Promise<T>):Promise<T>=>{
    const existing=pending.get(key);if(existing)return existing;
    const task=load().finally(()=>{if(pending.get(key)===task)pending.delete(key);});
    pending.set(key,task);return task;
  };
}
