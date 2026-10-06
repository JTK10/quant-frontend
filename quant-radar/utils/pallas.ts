export type PallasSignal = {
  Event_ID:string; Event_Type:string; Issued_At:string; Symbol:string; Side:string; Expiry:string;
  Strike:number; Leg:string; Selected_Strike:string; Reference_Premium:number; Reference_Premium_At:string;
  Signal_Time:string; Breakout_Bar_Start:string; Breakout_Spot:number; Pole_Extreme:number;
  Pole_Move_Pct:number; Pole_Body_Pct:number; Flag_Pullback_Pct:number; PF_Ratio:number;
  Flow_Type:string; Volume_Share_Pct:number; Prior_OI_Line:number|null; Prior_OI_Line_Type:string;
  Line_Respect:boolean; Intraday_Wall_Buildup_Pct:number|null; Intraday_Wall_OI_Added:number|null;
  OI_Age_Seconds:number|null; Chain_Received_At:string; Confirmation_Status:string; Confirmation_At?:string; Recovered?:boolean;
  AI_Score?:number|null; AI_Model_ID?:string|null; AI_Status?:string; AI_Scored_At?:string|null;
  AI_Submodel?:string|null; Pattern_Type?:string; Breakout_Level?:number;
  OI_Wall_Broken?:boolean|null;
};
// Frozen experimental score only. A missing score never defaults to a value.
export function pallasAiScore(s:PallasSignal):number|null {
  const issued=Date.parse(s.Issued_At),scored=Date.parse(s.AI_Scored_At??'');
  return s.Event_Type==='CONFIRMED_CLOSE'&&s.AI_Status==='SCORED'&&Boolean(s.AI_Model_ID)&&
    typeof s.AI_Score==='number'&&Number.isFinite(s.AI_Score)&&s.AI_Score>=0&&s.AI_Score<=1&&
    Number.isFinite(issued)&&Number.isFinite(scored)&&scored<=issued?s.AI_Score:null;
}
export const passesPallasAi=(s:PallasSignal,cutoff=.70)=>{const score=pallasAiScore(s);return score!==null&&score>=cutoff;};
// A snapshot comparison at the alert time, not a claim that wall OI unwound.
// Compute from saved prices/levels so legacy records can use the same filter.
export function pallasOiCrossed(side:string,spot:unknown,line:unknown):boolean|null {
  if(typeof spot!=='number'||!Number.isFinite(spot)||spot<=0||typeof line!=='number'||!Number.isFinite(line)||line<=0)return null;
  return side==='BULL'?spot>=line:side==='BEAR'?spot<=line:null;
}
export function pallasEngineLabel(s:PallasSignal):{label:string;detail:string;reported:boolean} {
  if(s.Event_Type!=='CONFIRMED_CLOSE')return {label:'Engine pending',detail:'AI engine is assigned at candle confirmation',reported:false};
  const engine=s.AI_Submodel;
  if(engine==='pallas_pdh_break_ai'||s.AI_Model_ID?.startsWith('pallas-pdh-'))return {label:'Engine 3 · PDH/PDL',detail:'PDH/PDL breakout AI',reported:true};
  if(engine==='pallas_reverse_pole_cascade_ai')return {label:'Engine 2 · Reverse/Cascade',detail:'Reverse-pole / cascade AI',reported:true};
  if(engine==='pallas_standard_poleflag')return {label:'Engine 1 · Standard',detail:'Standard AI (also scores late-pole setups)',reported:true};
  if(engine)return {label:'Engine unrecognized',detail:`Reported submodel: ${engine}`,reported:true};
  // Legacy two-model producers did not publish AI_Submodel. Never infer the
  // third model from a PDH pattern: older PDH events used the standard model.
  if(['REVERSE_POLE','CASCADE'].includes(s.Pattern_Type??''))return {label:'Engine 2 · Reverse/Cascade',detail:'Inferred from the legacy reverse/cascade pattern; submodel was not recorded',reported:false};
  if(['STANDARD','LATE_POLE_FLAG','PDH_BREAK_FLAG','PDL_BREAK_FLAG'].includes(s.Pattern_Type??''))return {label:'Engine 1 · Standard',detail:'Legacy standard-AI route; submodel was not recorded',reported:false};
  return {label:'Legacy AI · engine unreported',detail:'This saved alert does not identify its scoring engine',reported:false};
}
export function pallasAiPassLabel(s:PallasSignal):string {
  if(s.Event_Type!=='CONFIRMED_CLOSE')return 'AI pending';
  return pallasAiScore(s)===null?'AI unavailable':passesPallasAi(s)?'AI passed ≥70':'Below 70';
}
export type PallasCandidate={symbol:string;side:string;stage:string;spot:number;pole_move_pct:number;flag_pb_pct:number;pole_extreme:number;prev_levels:{s1:number|null;r1:number|null}};
export type PallasQuote={symbol:string;expiry:string;strike:number;leg:string;ltp:number;received_at:string};
export type PallasBar=[string,string,number,number,number,number,number];
export type PallasDocument={source:string;sig_date:string;available_at:string;Doc_ID:string;kind:string;status:string;signals?:PallasSignal[];candidates?:PallasCandidate[];quotes?:PallasQuote[];bars?:PallasBar[];cut?:string;health?:{checked_at:string;tick_connected:boolean;tick_received_at:string|null}};
export const PALLAS_DATES=['2026-09-25','2026-09-28','2026-09-29','2026-09-30','2026-10-01'];
export type PallasResponse={date:string;mode:string;asof:string;status:string;stale:boolean;tick_connected?:boolean;checked_at?:string;tick_received_at?:string|null;signals:PallasSignal[];candidates:PallasCandidate[];quotes:PallasQuote[];bars:PallasBar[];cut?:string};
export const quoteKey=(s:{Symbol:string;Expiry:string;Strike:number;Leg:string})=>`${s.Symbol}|${s.Expiry}|${s.Strike}|${s.Leg}`;
export function foldPallas(docs:PallasDocument[],date:string,limit:number,symbol?:string):PallasResponse {
  const selected=docs.filter(d=>d.source==='pallas'&&String(d.sig_date)===date.replaceAll('-','')&&Number.isFinite(Date.parse(d.available_at))&&Date.parse(d.available_at)<=limit).sort((a,b)=>Date.parse(a.available_at)-Date.parse(b.available_at));
  const seen=new Set<string>(), events=new Map<string,PallasSignal>(), quotes=new Map<string,PallasQuote>(), bars=new Map<string,PallasBar>();
  let latest:PallasDocument|undefined, health:PallasDocument|undefined;
  for(const d of selected){
    if(seen.has(d.Doc_ID))continue;seen.add(d.Doc_ID);
    if(d.kind==='SNAPSHOT')latest=d;
    if(d.kind==='STATUS')health=d;
    for(const s of d.signals??[]){
      if(!s.Event_ID||!Number.isFinite(Date.parse(s.Issued_At))||Date.parse(s.Issued_At)>limit)continue;
      const first=events.get(s.Event_ID);
      if(!first&&d.kind!=='EARLY_STATUS')events.set(s.Event_ID,{...s});
      else if(first&&d.kind==='EARLY_STATUS'&&s.Confirmation_At&&Date.parse(s.Confirmation_At)<=limit)events.set(s.Event_ID,{...first,Confirmation_Status:s.Confirmation_Status,Confirmation_At:s.Confirmation_At});
    }
    for(const q of d.quotes??[]){
      if(Number.isFinite(q.ltp)&&q.ltp>0&&Date.parse(q.received_at)<=limit)quotes.set(`${q.symbol}|${q.expiry}|${q.strike}|${q.leg}`,q);
    }
    for(const b of d.bars??[]){
      const end=Date.parse(`${date}T${b[1]}:00+05:30`)+300000;
      if(symbol===b[0]&&end<=limit&&b[6]*1000<=limit)bars.set(b[1],b);
    }
  }
  const newest=selected.at(-1);
  const stamp=newest?.available_at;
  return {date,mode:'LIVE',asof:new Date(limit).toISOString(),status:health?.status??latest?.status??'No capture available for this session',checked_at:stamp,
    stale:!stamp||limit-Date.parse(stamp)>420000,tick_connected:health?.health?.tick_connected,tick_received_at:health?.health?.tick_received_at,
    signals:[...events.values()],candidates:latest?.candidates??[],quotes:[...quotes.values()],bars:[...bars.values()].sort((a,b)=>a[1].localeCompare(b[1])),cut:latest?.cut};
}
