import type {Metadata} from 'next';
import ViperSignalClient from './ViperSignalClient';
import {sessionDates, sessionRows} from './signalArchive';

export const metadata: Metadata = {title: 'Viper Signal | Quant Radar'};

export default async function ViperSignalPage({searchParams}: {
  searchParams: Promise<{date?: string | string[]}>;
}) {
  const {date: requested} = await searchParams;
  const date = typeof requested === 'string' && sessionDates.includes(requested)
    ? requested
    : sessionDates.find(day => sessionRows(day).length > 0) ?? sessionDates[0];

  return <ViperSignalClient date={date} dates={sessionDates} rows={date ? sessionRows(date) : []} />;
}
