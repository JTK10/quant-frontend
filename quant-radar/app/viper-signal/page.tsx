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
  const date = typeof requested === 'string' && validDate(requested) && requested <= istSessionDate()
    ? requested
    : undefined;

  return <ViperSignalClient date={date} dates={sessionDates} rows={date ? sessionRows(date) : []} />;
}
