export type BullPreset = '' | 'ce' | 'pe' | 'both';
type Candidate={s:string;c_rvol?:number|null;ce_pct?:number|null;pe_pct?:number|null};
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function bullShortlists<T extends Candidate>(rows:T[],limit=5,side:"bull"|"bear"="bull"){
 const rank=(leg:'ce_pct'|'pe_pct')=>{
  const pool=rows.filter(r=>valid(r.c_rvol)&&r.c_rvol!>0&&valid(r[leg])&&(side==='bull'?(leg==='ce_pct'?r[leg]!<0:r[leg]!>0):(leg==='ce_pct'?r[leg]!>0:r[leg]!<0)));
  const oi=(r:T)=>(side==='bull'?(leg==='ce_pct'?-1:1):(leg==='ce_pct'?1:-1))*r[leg]!;
  // Equal-weight percentile ordering: sum of competition ranks. Ties use
  // higher RVOL, stronger directional OI, then symbol for repeatable output.
  const ranks=pool.map(r=>({row:r,total:2+pool.filter(p=>p.c_rvol!>r.c_rvol!).length+pool.filter(p=>oi(p)>oi(r)).length}));
  return ranks.sort((a,b)=>a.total-b.total||b.row.c_rvol!-a.row.c_rvol!||oi(b.row)-oi(a.row)||a.row.s.localeCompare(b.row.s)).slice(0,limit).map(x=>x.row);
 };
 const ce=rank('ce_pct'),pe=rank('pe_pct');
 return {ce,pe,both:[...new Map([...ce,...pe].map(r=>[r.s,r])).values()]};
}
