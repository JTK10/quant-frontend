import AutoRefresh from './components/AutoRefresh';
import DatePicker from './components/DatePicker';
import SmartRadarPremium from './components/SmartRadarPremium';
import type { RadarStock } from './types/radar';
import { resolveDate, type DateSearchParams } from './utils/date';
import { getInternalApiUrl } from './utils/internalApi';

export const dynamic = 'force-dynamic';

async function getRadarData(dateStr: string) {
  const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export default async function RadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const raw = await getRadarData(dateStr);
  const data = Array.isArray(raw) ? (raw as RadarStock[]) : [];

  return (
    <div className="font-sans max-w-7xl mx-auto text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Smart Radar</h1>
          <p className="text-brand-muted text-sm mt-1">Signals for <span className="text-brand-accent">{dateStr}</span></p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={30000} />
        </div>
      </div>

      <SmartRadarPremium data={data} />
    </div>
  );
}
