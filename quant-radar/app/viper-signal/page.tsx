import type {Metadata} from 'next';
import ViperSignalClient from './ViperSignalClient';
import {sessionDates, sessionRows} from './signalArchive';
import {validDate} from './model';
import {istSessionDate} from '@/utils/sessionPolling';

export const metadata: Metadata = {title: 'Viper Signal | Quant Radar'};

export default async function ViperSignalPage({searchParams}: {
  searchParams: Promise<{date?: string | string[]}>;
}) {
  const {date: requested} = await searchParams;
  const today = istSessionDate();
  const dates = new Set(sessionDates);
  const day = new Date(today + "T00:00:00Z");
  for (let offset = 1; offset <= 14; offset++) {
    day.setUTCDate(day.getUTCDate() - 1);
    if (day.getUTCDay() % 6 !== 0) dates.add(day.toISOString().slice(0, 10));
  }
  const date = typeof requested === 'string' && validDate(requested) && requested <= today
    ? requested
    : undefined;

  if (date) dates.add(date);
  const archive = Boolean(date && sessionDates.includes(date));
  return <ViperSignalClient key={date ?? 'live'} date={date} dates={[...dates].sort().reverse()}
    archive={archive} rows={archive && date ? sessionRows(date) : []} />;
}
