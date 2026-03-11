import AutoRefresh from './components/AutoRefresh';
import DatePicker from './components/DatePicker';
import SmartRadarPremium from './components/SmartRadarPremium';
import type { RadarStock } from './types/radar';
import { resolveDate, type DateSearchParams } from './utils/date';
import { getInternalApiUrl } from './utils/internalApi';

export const revalidate = 30;

async function getRadarData(dateStr: string): Promise<RadarStock[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return [...raw].sort((a, b) => toNum(b.SmartRank) - toNum(a.SmartRank));
  } catch {
    return [];
  }
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[%+,]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
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
