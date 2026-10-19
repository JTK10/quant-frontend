import sectorMap from '@/app/rusty/sectors.json';
export type OiDirection='BULL'|'BEAR'|'NEUTRAL'|'UNAVAILABLE';
type Raw=Record<string,unknown>;
export type SectorOiStock={symbol:string;direction:OiDirection;classification:string;ce:number|null;pe:number|null;move:number|null;price:number|null};
export type SectorOiCard={sec:string;net:number|null;bull:number;bear:number;neutral:number;valid:number;available:number;total:number;missing:number;stocks:SectorOiStock[]};
export type SectorOiBoard={cut:string;sectors:SectorOiCard[];unmapped:number};
const bull=new Set(['CE_DOWN_PE_UP','PE_OI_BUILD','CE_OI_SHARP_DROP','CE_OI_SURGE','PE_OI_DECLINE']);
const bear=new Set(['CE_UP_PE_DOWN','CE_OI_BUILD','PE_OI_SHARP_DROP','BOTH_LEGS_OI_WEAK','CE_OI_DECLINE']);
const neutral=new Set(['NEUTRAL','DUAL_OI_BUILD_CHOP']);
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
export function buildSectorOi(snapshot:Raw,mapping:Record<string,string[]>=sectorMap):SectorOiBoard{
 const rows=new Map<string,SectorOiStock>();const signatures=new Map<string,string>();
 for(const side of ['bull','bear']){
  const entries=snapshot[side];if(!Array.isArray(entries))continue;
  for(const raw of entries){
   if(!raw||typeof raw.s!=='string')continue;
   const r=raw as Raw;const symbol=String(r.s).trim().toUpperCase();if(!symbol)continue;
   const ce=num(r.ce_pct),pe=num(r.pe_pct),type=String(r.flow_type||'');
   const direction:OiDirection=ce===null||pe===null?'UNAVAILABLE':neutral.has(type)?'NEUTRAL':side==='bull'&&bull.has(type)?'BULL':side==='bear'&&bear.has(type)?'BEAR':'UNAVAILABLE';
   const row:SectorOiStock={symbol,direction,classification:typeof r.flow_label==='string'?r.flow_label:'Classification unavailable',ce,pe,move:num(r.mv),price:num(r.c_close)};
   const signature=JSON.stringify(row);
   if(signatures.has(symbol)&&signatures.get(symbol)!==signature){rows.set(symbol,{...row,direction:'UNAVAILABLE',classification:'Conflicting rows'});continue;}
   if(rows.get(symbol)?.classification==='Conflicting rows')continue;
   signatures.set(symbol,signature);rows.set(symbol,row);
  }
 }
 const mapped=new Set<string>();
 const sectors=Object.entries(mapping).map(([sec,symbols])=>{
  const members=[...new Set(symbols.map(s=>s.trim().toUpperCase()))];members.forEach(s=>mapped.add(s));
  const stocks=members.map(s=>rows.get(s)).filter((r):r is SectorOiStock=>!!r);
  const count=(d:OiDirection)=>stocks.filter(r=>r.direction===d).length;
  const bull=count('BULL'),bear=count('BEAR'),neutral=count('NEUTRAL'),valid=bull+bear+neutral;
  stocks.sort((a,b)=>({BULL:0,BEAR:1,NEUTRAL:2,UNAVAILABLE:3}[a.direction]-{BULL:0,BEAR:1,NEUTRAL:2,UNAVAILABLE:3}[b.direction])||a.symbol.localeCompare(b.symbol));
  return {sec,net:valid?100*(bull-bear)/valid:null,bull,bear,neutral,valid,available:stocks.length,total:members.length,missing:members.length-valid,stocks};
 }).sort((a,b)=>a.net===null?(b.net===null?a.sec.localeCompare(b.sec):1):b.net===null?-1:b.net-a.net||b.valid-a.valid||a.sec.localeCompare(b.sec));
 return {cut:String(snapshot.cut||snapshot.time||''),sectors,unmapped:[...rows.keys()].filter(s=>!mapped.has(s)).length};
}
