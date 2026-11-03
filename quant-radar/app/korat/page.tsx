import LineBreaksClient from '../oi-line-breaks/LineBreaksClient';
import {istSessionDate} from '@/utils/sessionPolling';
import {koratSessions} from '@/utils/oiLineDates';

export default async function KoratPage({searchParams}:{searchParams:Promise<{date?:string;cut?:string}>}){
  const {date,cut}=await searchParams;
  const sessions=koratSessions(istSessionDate());
  const selected=typeof date==='string'&&sessions.some(item=>item.date===date)?date:sessions.at(-1)!.date;
  const initialCut=typeof cut==='string'&&/^\d{2}:\d{2}$/.test(cut)?cut:'latest';
  return <LineBreaksClient initialDate={selected} initialCut={initialCut} sessions={sessions}/>;
}
