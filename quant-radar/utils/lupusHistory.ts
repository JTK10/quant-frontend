/** Compact dated Lupus snapshots; never mix health rows or another session. */
export function projectLupusHistory(rows:any[],date:string){
  const compact=date.replaceAll('-','');
  const cuts:Record<string,{bull:any[];bear:any[]}>={};
  const latest=new Map<string,any>();
  for(const row of rows){
    if(row.source!=='lupus'||String(row.sig_date??row.date?.replaceAll('-',''))!==compact)continue;
    const cut=String(row.cut??row.time??'').slice(0,5);
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(cut)||cut<'09:15'||cut>'15:25')continue;
    if(!Array.isArray(row.bull)||!Array.isArray(row.bear))continue;
    if(!latest.has(cut)||(row.ts??0)>(latest.get(cut).ts??0))latest.set(cut,row);
  }
  const fields=['symbol','rank','ce','pe','ce5','price','line','move','pdh','trapExcursion','trapDrawdown','trapHigh','failure','wall_date','coverage','source','reclaim'];
  const project=(values:any[])=>values.filter(v=>v&&typeof v.symbol==='string').map(v=>Object.fromEntries(fields.map(k=>[k,v[k]??null])));
  for(const [cut,row] of [...latest].sort(([a],[b])=>a.localeCompare(b)))cuts[cut]={bull:project(row.bull),bear:project(row.bear)};
  return {date, cuts, origin:'RECORDED_LUPUS',lastRecordedCut:Object.keys(cuts).at(-1)??null};
}
