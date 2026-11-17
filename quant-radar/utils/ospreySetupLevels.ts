import {getSharedOrdsToken,invalidateSharedOrdsToken} from './aurumFeed';
import {resultCache} from './resultCache';
export type SetupOI={date:string;levels:number[]};
const shared=resultCache<Record<string,SetupOI>>({maxEntries:16,maxBytes:1024*1024});
export function ospreySetupLevels(date:string){
  return shared(date,3600000,async()=>{
    const endpoint=process.env.PANTHER_SIGNALS_URL;if(!endpoint)throw Error('OI origin unavailable');
    const origin=new Date(date+'T00:00:00Z'),deadline=AbortSignal.timeout(6500);
    for(let offset=1;offset<=10;offset++){
      const day=new Date(origin);day.setUTCDate(day.getUTCDate()-offset);if([0,6].includes(day.getUTCDay()))continue;
      const prior=day.toISOString().slice(0,10),url=new URL(endpoint);url.searchParams.set('src','chart_oi_close');url.searchParams.set('sig_date',prior.replaceAll('-',''));
      const response=await fetch(url,{headers:{Authorization:'Bearer '+await getSharedOrdsToken()},cache:'no-store',signal:deadline,redirect:'error'});
      if(response.status===401)invalidateSharedOrdsToken();if(!response.ok||!response.body)throw Error('OI origin unavailable');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
      try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>160000)throw Error('OI byte budget exceeded');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
      const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(data.hasMore||!Array.isArray(data.items)||data.items.length>80)throw Error('Incomplete OI feed');
      const result:Record<string,SetupOI>={};
      const docs=data.items.map((item:{doc?:unknown})=>typeof item.doc==='string'?JSON.parse(item.doc):item.doc??item).sort((a:{ts?:number},b:{ts?:number})=>Number(b.ts??0)-Number(a.ts??0));
      for(const doc of docs){
        if(doc.source!=='chart_oi_close'||String(doc.sig_date)!==prior.replaceAll('-','')||!Array.isArray(doc.oi_levels)||doc.oi_levels.length>400)throw Error('OI identity mismatch');
        for(const row of doc.oi_levels){
          if(typeof row[0]!=='string'||!/^[A-Z0-9 &._-]{1,30}$/.test(row[0])||result[row[0]])continue;
          const levels=[...(Array.isArray(row[3])?row[3]:[]),...(Array.isArray(row[4])?row[4]:[])].slice(0,4).map((w:unknown[])=>w[0]);
          if(levels.some(p=>typeof p!=='number'||!Number.isFinite(p)||p<=0))continue;
          result[row[0]]={date:prior,levels:levels as number[]};
        }
      }
      if(Object.keys(result).length)return result;
    }
    return {};
  });
}
