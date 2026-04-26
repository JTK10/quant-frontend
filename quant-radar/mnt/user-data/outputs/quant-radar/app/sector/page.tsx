import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import PageHeader from '../components/PageHeader';
import { DatePicker, AutoRefresh } from '../components/Controls';
import SectorFlowClient from '../components/SectorFlowClient';

export const dynamic = 'force-dynamic';

export type SectorData = {
  key: string; label: string; symbols: string[];
  signals: {
    name: string; sym: string; side: 'BULL' | 'BEAR' | 'NEUTRAL';
    conf: number; rvol: number; move: number; time: string; module: string; chart: string;
  }[];
  totalSignals: number; bullCount: number; bearCount: number;
  avgMove: number; bullRatio: number; isBullish: boolean;
};

async function getSectorData(dateStr: string): Promise<SectorData[]> {
  try {
    const url = await getInternalApiUrl(`/api/sector?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const sectors = await getSectorData(dateStr);

  const liveSectors = sectors.filter((s) => s.totalSignals > 0);
  const bullSectors = liveSectors.filter((s) => s.isBullish).length;
  const bearSectors = liveSectors.filter((s) => !s.isBullish).length;
  const totalSignals = liveSectors.reduce((a, s) => a + s.totalSignals, 0);
  const dominantSector = liveSectors[0] ?? null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Sector Flow"
        subtitle="MARKET ROTATION · SECTOR STRENGTH MAP"
        badge="LIVE HEATMAP"
        dateStr={dateStr}
        accentColor="var(--color-gold)"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      {/* Summary bar */}
      <div
        className="flex items-center gap-0 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        {[
          { label: 'TOTAL SECTORS', value: sectors.length, color: 'var(--color-text2)' },
          { label: 'LIVE THEMES', value: liveSectors.length, color: 'var(--color-accent)' },
          { label: 'BULL SECTORS', value: bullSectors, color: 'var(--color-bull)' },
          { label: 'BEAR SECTORS', value: bearSectors, color: 'var(--color-bear)' },
          { label: 'LIVE SIGNALS', value: totalSignals, color: 'var(--color-gold)' },
          {
            label: 'LEAD SECTOR',
            value: dominantSector?.label ?? '—',
            color: dominantSector?.isBullish ? 'var(--color-bull)' : dominantSector ? 'var(--color-bear)' : 'var(--color-muted)',
          },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="flex-1 px-4 py-3"
            style={{ borderRight: i < 5 ? '1px solid var(--color-border)' : 'none' }}
          >
            <div className="font-mono text-[7px] tracking-[0.22em] mb-0.5" style={{ color: 'var(--color-muted)' }}>
              {stat.label}
            </div>
            <div className="text-lg font-bold truncate" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        <SectorFlowClient sectors={sectors} />
      </div>
    </div>
  );
}
