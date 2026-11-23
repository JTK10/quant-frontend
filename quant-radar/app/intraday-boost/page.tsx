import { resolveDate, type DateSearchParams } from '@/utils/date';
import { istSessionDate } from '@/utils/sessionPolling';
import RustyFeed from '@/app/rusty/RustyFeed';
import IntradayBoostClient from './IntradayBoostClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Intraday Boost | Quant Radar' };

export default async function IntradayBoostPage({ searchParams }: { searchParams: DateSearchParams }) {
  const params = await searchParams;
  const dateStr = await resolveDate(searchParams);
  const followToday = !params?.date || dateStr === istSessionDate();
  return <RustyFeed key={dateStr} dateStr={dateStr} followToday={followToday} Board={IntradayBoostClient} pagePath="/intraday-boost" />;
}
