import SolFeed from './SolFeed';
import {resolveDate,type DateSearchParams} from '@/utils/date';
export const dynamic='force-dynamic';
export default async function SolPage({searchParams}:{searchParams:DateSearchParams}) {
  const dateStr=await resolveDate(searchParams), params=await searchParams;
  return <SolFeed key={dateStr} dateStr={dateStr} followToday={!params?.date}/>;
}
