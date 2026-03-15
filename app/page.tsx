import AutoRefresh from './components/AutoRefresh';
import DatePicker from './components/DatePicker';
import SmartRadarPremium from './components/SmartRadarPremium';
import type { RadarStock } from './types/radar';
import { resolveDate, type DateSearchParams } from './utils/date';
import { getInternalApiUrl } from './utils/internalApi';
import { toNumber } from './utils/scanner';

export const dynamic = 'force-dynamic';

async function getRadarData(dateStr: string): Promise<RadarStock[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return [...raw].sort((a, b) => {
      const rankA = toNumber(a.SignalRank ?? a.SmartRank);
      const rankB = toNumber(b.SignalRank ?? b.SmartRank);
      return rankB - rankA;
    });
  } catch {
    return [];
  }
}

export default async function RadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getRadarData(dateStr);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Smart Radar</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            AI-POWERED EXPANSION SIGNALS
            <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>
              {dateStr}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={30000} />
        </div>
      </div>

      <SmartRadarPremium data={data} />
    </div>
  );
}
