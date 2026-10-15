// Authenticated Rusty views reuse compact, redacted history across slider cuts.
// Nothing here is shared through a public CDN or sent as a full browser history.
type Snapshot=Record<string,unknown>;
export function projectRustySnapshot(snapshot:Snapshot){
  const visible=(side:unknown)=>Array.isArray(side)?side.map(value=>{
    const row=value as Record<string,unknown>;
    const projected={s:row.s,mv:row.mv,brk:row.brk,bt:row.bt,ls:row.ls,p:row.rusty_pct,rr:row.rusty_rank,dr:row.rk??null,
      pi:row.put_inc_rank,ci:row.call_inc_rank,w:row.mr,ce:row.ce_pct??null,pe:row.pe_pct??null,
      ce_pct:row.ce_pct??null,pe_pct:row.pe_pct??null,oi_bias:row.oi_bias??null,flow_type:row.flow_type??null,
      flow_label:row.flow_label??null,badge_color:row.badge_color??null,badge_bg:row.badge_bg??null,
      conviction:row.conviction??null,is_new_discovery:row.is_new_discovery??false,
      c_time:row.c_time??null,c_open:row.c_open??null,c_close:row.c_close??null,c_high:row.c_high??null,
      c_low:row.c_low??null,c_body:row.c_body??null,c_uw:row.c_uw??null,c_lw:row.c_lw??null,
      c_mv:row.c_mv??null,is_maru:row.is_maru??false,is_solid:row.is_solid??false,
      candle_tier:row.candle_tier??null,tgt_pct:row.tgt_pct??null,oi_broken:row.oi_broken??null,oi_break_time:row.oi_break_time??null,entry_confirmed:row.entry_confirmed??false};
    // Omitted unavailable fields render identically and avoid repeated null keys.
    return Object.fromEntries(Object.entries(projected).filter(([,value])=>value!==null&&value!==undefined));
  }):[];
  return {source:'rusty',cap:'RUSTY',cut:snapshot.cut,time:snapshot.time,bull:visible(snapshot.bull),bear:visible(snapshot.bear)};
}
type History={cuts:string[];snapshots:Map<string,string>;loaded:number;bytes:number};
export function rustyHistoryCache({maxEntries=3,maxBytes=16*1024*1024,retention=300000}={}){
  const values=new Map<string,History>(),pending=new Map<string,Promise<History>>();let bytes=0;
  const remove=(key:string)=>{const old=values.get(key);if(old)bytes-=old.bytes;values.delete(key);};
  return async(date:string,freshness:number,cut:string|null,load:()=>Promise<Snapshot[]>):Promise<History>=>{
    const now=Date.now();for(const [key,value]of values)if(now-value.loaded>=retention)remove(key);
    const hit=values.get(date);
    if(hit&&(cut?hit.snapshots.has(cut):now-hit.loaded<freshness)){
      values.delete(date);values.set(date,hit);return hit;
    }
    const active=pending.get(date);if(active)return active;
    const task=Promise.resolve().then(load).then(rows=>{
      const snapshots=new Map<string,string>();
      for(const row of rows){const key=String(row.cut||row.time||'');if(key)snapshots.set(key,JSON.stringify(row));}
      const cuts=[...snapshots.keys()].sort();
      const size=Buffer.byteLength(JSON.stringify(cuts))+[...snapshots.values()].reduce((n,s)=>n+Buffer.byteLength(s),0);
      const value={cuts,snapshots,loaded:Date.now(),bytes:size};
      remove(date);
      if(size<=maxBytes){while(values.size>=maxEntries||bytes+size>maxBytes)remove(values.keys().next().value!);values.set(date,value);bytes+=size;}
      return value;
    }).finally(()=>pending.delete(date));
    pending.set(date,task);return task;
  };
}
export function rustyHistoryResponse(history:History,cut:string|null,after:string|null){
  const latest=history.cuts.at(-1);
  const wanted=cut?[cut]:[...new Set([after,latest].filter((s):s is string=>!!s))].sort();
  const snapshots=wanted.filter(c=>!after||c>=after).map(c=>history.snapshots.get(c)).filter(Boolean);
  return '{"snapshots":['+snapshots.join(',')+'],"cuts":'+JSON.stringify(history.cuts)+'}';
}
