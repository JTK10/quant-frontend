import DatePicker from '../components/DatePicker';
import AITopPicksDashboard from '../components/AITopPicksDashboard';
import { resolveDate, type DateSearchParams } from '../utils/date';

export const revalidate = 30;

export default async function AISignalsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">AI Top Picks</h1>
          </div>
          <p className="font-mono text-xs tracking-[0.24em]" style={{ color: 'var(--color-brand-muted)' }}>
            SMART RADAR TOP 5
            <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
          <p className="text-sm mt-3 max-w-2xl" style={{ color: 'var(--color-brand-muted)' }}>
            Manual AI trigger mode. We only call the backend when you click the analysis button.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
        </div>
      </div>

      <AITopPicksDashboard dateStr={dateStr} />
    </div>
  );
}
