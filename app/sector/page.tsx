import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

type SectorDatum = {
  Sector: string;
  OI: number;
};

function normalizeSectorData(data: unknown): SectorDatum[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const sectors: SectorDatum[] = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const sector =
      (typeof record.Sector === 'string' && record.Sector) ||
      (typeof record.sector === 'string' && record.sector) ||
      (typeof record.Name === 'string' && record.Name) ||
      (typeof record.name === 'string' && record.name) ||
      null;

    const oiValue =
      record.OI ??
      record.oi ??
      record.OIChange ??
      record.oiChange ??
      record.oi_change ??
      record.value;
    const oi = typeof oiValue === 'number' ? oiValue : Number(oiValue);

    if (!sector || Number.isNaN(oi)) {
      continue;
    }

    sectors.push({ Sector: sector, OI: oi });
  }

  return sectors.sort((a, b) => b.OI - a.OI);
}

async function getSectorData(dateStr: string) {
  const url = await getInternalApiUrl(`/api/sector?date=${encodeURIComponent(dateStr)}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];

  const data: unknown = await res.json();
  return normalizeSectorData(data);
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const sectors = await getSectorData(dateStr);

  return (
    <div className="font-sans max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Sector Heatmap</h2>
          <p className="text-brand-muted text-sm mt-1">Capital flow based on Open Interest velocity.</p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {sectors.map((sec) => {
          const isBull = sec.OI > 0;
          
          // Calculate opacity based on strength (Max 10% OI for 100% opacity)
          const strength = Math.min(Math.abs(sec.OI) / 10, 1); 
          
          // Generate dynamic style object for the background
          const bgStyle = isBull 
            ? `rgba(16, 185, 129, ${Math.max(strength, 0.15)})` // brand.bull
            : `rgba(239, 68, 68, ${Math.max(strength, 0.15)})`; // brand.bear

          return (
            <div 
              key={sec.Sector}
              className="relative p-6 rounded-xl border border-brand-border flex flex-col justify-between aspect-video transition-transform hover:scale-105 cursor-default overflow-hidden"
              style={{ backgroundColor: bgStyle }}
            >
              <div className="font-black text-xl tracking-wide z-10 text-white">{sec.Sector}</div>
              <div className="flex justify-between items-end z-10">
                <span className="text-sm font-semibold text-white/70">Avg OI Shift</span>
                <span className={`text-2xl font-black text-white`}>
                  {isBull ? '+' : ''}{sec.OI.toFixed(1)}%
                </span>
              </div>
              
              {/* Glass overlay to ensure text is always readable */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
            </div>
          );
        })}
      </div>

      {sectors.length === 0 && (
        <div className="mt-8 text-center text-brand-muted italic">
          No sector data available for {dateStr}.
        </div>
      )}
    </div>
  );
}
