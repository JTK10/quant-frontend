import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import SectorSkyline from '../components/SectorSkyline';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import type { RadarStock, SectorStrength } from '../types/radar';
import { buildSectorData } from '../utils/sectorSkyline';

export const dynamic = 'force-dynamic';

async function getRadarStocks(dateStr: string): Promise<RadarStock[]> {
  // Use the radar endpoint — it has full OI/SmartRank data needed for sector building
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = Number(v.replace(/[%+,]/g,'').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function Pill({ label, value, bull }: { label: string; value: string; bull?: boolean | null }) {
  let col = 'var(--color-brand-text)';
  if (bull === true)  col = 'var(--color-brand-bull)';
  if (bull === false) col = 'var(--color-brand-bear)';
  return (
    <div className="rounded-xl border px-4 py-3.5 relative overflow-hidden"
      style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background:'linear-gradient(90deg,transparent,rgba(79,142,247,0.3),transparent)' }} />
      <div className="font-mono text-[9px] tracking-[0.22em] mb-1" style={{ color:'var(--color-brand-muted)' }}>{label}</div>
      <div className="text-xl font-bold" style={{ color: col }}>{value}</div>
    </div>
  );
}

function SectorCard({ sec }: { sec: SectorStrength }) {
  const isBull      = sec.strength >= 0;
  const intensityPct= Math.min(Math.abs(sec.strength) / 25, 1);
  const avg         = typeof sec.avgOi === 'number' ? sec.avgOi : 0;
  const bullR       = typeof sec.bullRatio === 'number' ? sec.bullRatio : 0.5;
  const accentCol   = isBull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';

  // Top 4 stocks by OI magnitude
  const topStocks = [...sec.stocks]
    .sort((a,b) => Math.abs(toNum(b.OI ?? b['OI %'])) - Math.abs(toNum(a.OI ?? a['OI %'])))
    .slice(0, 4);

  return (
    <div
      className="rounded-xl border overflow-hidden relative group transition-shadow hover:shadow-[0_0_24px_rgba(60,130,246,0.18)]"
      style={{
        background:   'var(--color-brand-surface)',
        borderColor:  `rgba(${isBull ? '5,217,143' : '240,54,90'},${0.12 + intensityPct * 0.35})`,
        transition:   'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      {/* Strength bar (top edge) */}
      <div className="absolute top-0 left-0 h-0.5 transition-all duration-500"
        style={{
          width:      `${Math.max(intensityPct * 100, 8)}%`,
          background: accentCol,
          boxShadow:  `0 0 8px ${accentCol}`,
        }} />

      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 85% 15%, rgba(${isBull ? '5,217,143' : '240,54,90'},${0.03 + intensityPct * 0.07}) 0%, transparent 65%)`,
        }} />

      <div className="relative p-4">
        {/* Name + badge */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="font-bold text-sm tracking-wide uppercase" style={{ color:'var(--color-brand-text)' }}>
              {sec.name}
            </div>
            <div className="font-mono text-[9px] mt-0.5" style={{ color:'var(--color-brand-muted)' }}>
              {sec.stocks.length} stock{sec.stocks.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div
            className="font-mono text-xs font-bold px-2 py-0.5 rounded"
            style={{
              color:      accentCol,
              background: `rgba(${isBull ? '5,217,143' : '240,54,90'},0.1)`,
            }}
          >
            {isBull ? '▲' : '▼'} {isBull ? '+' : ''}{sec.strength.toFixed(1)}
          </div>
        </div>

        {/* Avg OI bar */}
        <div className="mb-3">
          <div className="flex justify-between font-mono text-[9px] mb-1" style={{ color:'var(--color-brand-muted)' }}>
            <span>AVG OI</span>
            <span style={{ color: accentCol }}>{avg > 0 ? '+' : ''}{avg.toFixed(1)}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background:'var(--color-brand-border)' }}>
            <div className="h-full rounded-full"
              style={{ width:`${Math.min(intensityPct * 100, 100)}%`, background: accentCol }} />
          </div>
        </div>

        {/* Bull/Bear split bar */}
        <div className="flex h-1.5 rounded-full overflow-hidden mb-3" style={{ background:'var(--color-brand-bearbg)' }}>
          <div style={{ width:`${bullR * 100}%`, background:'var(--color-brand-bull)' }} />
        </div>
        <div className="flex justify-between font-mono text-[9px] mb-3" style={{ color:'var(--color-brand-muted)' }}>
          <span style={{ color:'var(--color-brand-bull)' }}>▲ {(bullR * 100).toFixed(0)}%</span>
          <span style={{ color:'var(--color-brand-bear)' }}>▼ {((1 - bullR) * 100).toFixed(0)}%</span>
        </div>

        {/* Top stocks */}
        {topStocks.length > 0 && (
          <div className="border-t pt-3 space-y-1.5" style={{ borderColor:'rgba(26,40,64,0.5)' }}>
            {topStocks.map((s, si) => {
              const oi   = toNum(s.OI ?? s['OI %']);
              const bull = oi >= 0;
              return (
                <div key={`${s.Name}-${si}`} className="flex justify-between items-center">
                  <span className="text-[11px] font-medium truncate" style={{ color:'var(--color-brand-text)', opacity:0.85 }}>
                    {s.Name}
                  </span>
                  <span className="font-mono text-[10px] font-semibold ml-2 shrink-0"
                    style={{ color: bull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}>
                    {bull ? '+' : ''}{oi.toFixed(1)}%
                  </span>
                </div>
              );
            })}
            {sec.stocks.length > 4 && (
              <div className="font-mono text-[9px] pt-0.5" style={{ color:'var(--color-brand-muted)' }}>
                +{sec.stocks.length - 4} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const stocks  = await getRadarStocks(dateStr);
  const sectors = buildSectorData(stocks);

  const bullSectors   = sectors.filter(s => s.strength >  0).length;
  const bearSectors   = sectors.filter(s => s.strength <= 0).length;
  const topSector     = sectors[0]?.name ?? '—';
  const bottomSector  = sectors[sectors.length - 1]?.name ?? '—';

  return (
    <div className="max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Sector View</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            OI-BASED CAPITAL FLOW
            <span className="ml-2" style={{ color:'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Pill label="SECTORS"    value={sectors.length.toString()} />
        <Pill label="BULLISH"    value={bullSectors.toString()} bull={bullSectors > bearSectors} />
        <Pill label="BEARISH"    value={bearSectors.toString()} bull={bullSectors < bearSectors ? false : null} />
        <Pill label="STRONGEST"  value={topSector} />
      </div>

      {/* ── Skyline chart (moved from home page) ─────────── */}
      <div className="mb-6">
        <SectorSkyline sectors={sectors} />
      </div>

      {/* ── Sector grid ──────────────────────────────────── */}
      {sectors.length === 0 ? (
        <div className="rounded-xl border p-12 text-center"
          style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            NO SECTOR DATA FOR {dateStr}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background:'var(--color-brand-border)' }} />
            <span className="font-mono text-[9px] tracking-[0.25em] uppercase px-1"
              style={{ color:'var(--color-brand-muted)' }}>Sector Detail · {sectors.length} sectors</span>
            <div className="flex-1 h-px" style={{ background:'var(--color-brand-border)' }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sectors.map(sec => <SectorCard key={sec.name} sec={sec} />)}
          </div>
        </>
      )}
    </div>
  );
}
