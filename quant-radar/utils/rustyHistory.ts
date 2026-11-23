// Authenticated Rusty views reuse compact, redacted history across slider cuts.
// Nothing here is shared through a public CDN or sent as a full browser history.
type Snapshot=Record<string,unknown>;
export type RustyRvolPoints=Record<string,Record<string,[number,number,boolean|null]>>;
export type RustyCleanRunnerTuple=[string,number,string,number]; // [cut_ist, tier, lane, score]
export type RustyCleanRunnerDay={bull?:Record<string,RustyCleanRunnerTuple>;bear?:Record<string,RustyCleanRunnerTuple>};

export function projectRustySnapshot(snapshot:Snapshot,rvol?:RustyRvolPoints,cleanRunners?:RustyCleanRunnerDay){
  const cut=String(snapshot.cut||snapshot.time||'').slice(0,5);
  const validCut=/^\d{2}:\d{2}$/.test(cut);
  const visible=(side:unknown,sideKey:'bull'|'bear')=>Array.isArray(side)?side.map(value=>{
    const original=value as Record<string,unknown>;
    const nearby=original.nearby_oi;
    const fields=['ce_pct','pe_pct','oi_bias','flow_type','flow_label','badge_color','badge_bg','conviction'];
    const row=Array.isArray(nearby)&&nearby.length===fields.length
      ? {...original,...Object.fromEntries(fields.map((field,i)=>[field,nearby[i]]))}
      : original;
    const hm=String(row.c_time||'').slice(0,5);
    const closed=/^\d{2}:\d{2}$/.test(hm)&&validCut&&
      Number(hm.slice(0,2))*60+Number(hm.slice(3))+5<=Number(cut.slice(0,2))*60+Number(cut.slice(3));
    const saved=closed?rvol?.[hm]?.[String(row.s)]:undefined;
    const recorded=typeof row.c_rvol==='number'&&Number.isFinite(row.c_rvol);
    // Causal Clean-Runner projection: native live cr_tier (when cr_cut <= cut) takes precedence,
    // otherwise packaged causal Clean-Runner lookup fires strictly when cut >= crTuple[0].
    const nativeCrCut=typeof row.cr_cut==='string'&&/^\d{2}:\d{2}$/.test(row.cr_cut)?row.cr_cut:null;
    const nativeCrActive=typeof row.cr_tier==='number'&&Number.isFinite(row.cr_tier)&&(!nativeCrCut||!validCut||nativeCrCut<=cut);
    const savedCr=!nativeCrActive&&validCut?cleanRunners?.[sideKey]?.[String(row.s)]:undefined;
    const savedCrActive=Array.isArray(savedCr)&&savedCr.length>=4&&typeof savedCr[0]==='string'&&savedCr[0]<=cut;
    const cr_tier=nativeCrActive?Number(row.cr_tier):savedCrActive?Number(savedCr![1]):null;
    const cr_lane=nativeCrActive?(typeof row.cr_lane==='string'?row.cr_lane:null):savedCrActive?String(savedCr![2]):null;
    const cr_cut=nativeCrActive?(nativeCrCut??(validCut?cut:null)):savedCrActive?String(savedCr![0]):null;
    const cr_score=nativeCrActive?(typeof row.cr_score==='number'&&Number.isFinite(row.cr_score)?row.cr_score:null):savedCrActive?Number(savedCr![3]):null;
    const projected={s:row.s,mv:row.mv,brk:row.brk,bt:row.bt,ls:row.ls,p:row.rusty_pct,rr:row.rusty_rank,dr:row.rk??null,
      pi:row.put_inc_rank,ci:row.call_inc_rank,w:row.mr,ce:row.ce_pct??null,pe:row.pe_pct??null,
      ce_pct:row.ce_pct??null,pe_pct:row.pe_pct??null,oi_bias:row.oi_bias??null,flow_type:row.flow_type??null,
      flow_label:row.flow_label??null,badge_color:row.badge_color??null,badge_bg:row.badge_bg??null,
      conviction:row.conviction??null,is_new_discovery:row.is_new_discovery??false,
      c_rvol:recorded?row.c_rvol:saved?.[0]??null,c_rvol_samples:recorded?row.c_rvol_samples??null:saved?.[1]??null,
      c_rvol_source:!recorded&&saved?'historical_cash':null,c_rvol_ohlc_match:!recorded&&saved?saved[2]:null,
      c_time:row.c_time??null,c_open:row.c_open??null,c_close:row.c_close??null,c_high:row.c_high??null,
      c_low:row.c_low??null,c_body:row.c_body??null,c_uw:row.c_uw??null,c_lw:row.c_lw??null,
      c_mv:row.c_mv??null,is_maru:row.is_maru??false,is_solid:row.is_solid??false,
      candle_tier:row.candle_tier??null,tgt_pct:row.tgt_pct??null,oi_broken:row.oi_broken??null,oi_break_time:row.oi_break_time??null,entry_confirmed:row.entry_confirmed??false,
      cr_tier,cr_lane,cr_cut,cr_score,
      rfac:typeof row.rfac==='number'&&Number.isFinite(row.rfac)?row.rfac:null,
      rfac_c:typeof row.rfac_c==='number'&&Number.isFinite(row.rfac_c)?row.rfac_c:null,
      rfac_s:typeof row.rfac_s==='string'?row.rfac_s:null,
      rfac_o20:typeof row.rfac_o20==='number'&&Number.isFinite(row.rfac_o20)?row.rfac_o20:null,
      rfac_d:typeof row.rfac_d==='number'&&Number.isFinite(row.rfac_d)?row.rfac_d:null,
      rfac_pk:typeof row.rfac_pk==='string'?row.rfac_pk:null,
      cs_b:row.cs_b===3||row.cs_b===5?row.cs_b:null,
      cs_s:row.cs_s===3||row.cs_s===5?row.cs_s:null,
      cs_l:Array.isArray(row.cs_l)&&row.cs_l.length===4?row.cs_l:null};
    // Omitted unavailable fields render identically and avoid repeated null keys.
    return Object.fromEntries(Object.entries(projected).filter(([,value])=>value!==null&&value!==undefined));
  }):[];
  return {
    source:'rusty',cap:'RUSTY',cut:snapshot.cut,time:snapshot.time,
    ...(snapshot.cs_v===1?{cs_v:1}:{}),
    bull:visible(snapshot.bull,'bull'),bear:visible(snapshot.bear,'bear'),
  };
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
