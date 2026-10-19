import PageHeader from '@/components/PageHeader';
import {AutoRefresh,DatePicker} from '@/components/Controls';
import SectorOiClient from './SectorOiClient';
import {resolveDate,type DateSearchParams} from '@/utils/date';
import {getInternalApiUrl,fetchInternalApi} from '@/utils/internalApi';
import {buildSectorOi,type SectorOiBoard} from '@/utils/sectorOi';
export const dynamic='force-dynamic';
export default async function SectorPage({searchParams}:{searchParams:DateSearchParams}){
 const dateStr=await resolveDate(searchParams);let board:SectorOiBoard|null=null,error='';
 try{
  const url=await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=rusty&view=rusty`);
  const response=await fetchInternalApi(url,{cache:'default'});
  if(!response.ok)throw new Error('Rusty sector feed unavailable');
  const data=await response.json();if(!Array.isArray(data.snapshots))throw new Error('Invalid Rusty sector feed');
  const latest=data.snapshots.filter((s:Record<string,unknown>)=>s.source==='rusty'&&Array.isArray(s.bull)&&Array.isArray(s.bear)).sort((a:Record<string,unknown>,b:Record<string,unknown>)=>String(a.cut||a.time||'').localeCompare(String(b.cut||b.time||''))).at(-1);
  if(latest)board=buildSectorOi(latest);else error='No Rusty snapshot available for this session yet.';
 }catch{error='Refresh failed: Rusty sector feed unavailable.';}
 return <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white"><PageHeader title="SECTOR SCOPE" subtitle="RUSTY OI BULL / BEAR BREADTH" badge="OI 5M" dateStr={dateStr} accentColor="#fce205"><DatePicker/><AutoRefresh interval={300000}/></PageHeader><SectorOiClient key={dateStr} board={board} error={error} date={dateStr}/></div>;
}
