import LineBreaksClient from './LineBreaksClient';
import manifest from '@/data/oi-line-breaks/manifest.json';

export default async function LineBreaksPage({searchParams}:{searchParams:Promise<{date?:string;cut?:string}>}){
  const {date,cut}=await searchParams;
  const selected=typeof date==='string'&&manifest.sessions.some(item=>item.date===date)?date:manifest.sessions.at(-1)!.date;
  const initialCut=typeof cut==='string'&&/^\d{2}:\d{2}$/.test(cut)?cut:'latest';
  return <LineBreaksClient initialDate={selected} initialCut={initialCut} sessions={manifest.sessions}/>;
}
