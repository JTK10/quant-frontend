import AutoRefresh from './components/AutoRefresh';
import DatePicker from './components/DatePicker';
import SmartRadarPremium from './components/SmartRadarPremium';
import type { RadarStock } from './types/radar';
import { resolveDate, type DateSearchParams } from './utils/date';
import { getInternalApiUrl } from './utils/internalApi';

export const dynamic = 'force-dynamic';

async function getRadarData(dateStr: string): Promise<RadarStock[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
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

export default async function RadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data    = await getRadarData(dateStr);

  const bulls  = data.filter(d => toNum(d.OI ?? d['OI %']) > 0).length;
  const bears  = data.filter(d => toNum(d.OI ?? d['OI %']) < 0).length;
  const topScore = data.length ? toNum(data[0]?.Peak_Score) : 0;

  return (
    <div className="max-w-7xl mx-auto w-full">

      {/* ── Page header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Smart Radar</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            AI-POWERED EXPANSION SIGNALS
            <span className="ml-2" style={{ color:'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={30000} />
        </div>
      </div>

      {/* ── Stat strip ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label:'SIGNALS',   value: data.length,           color:'var(--color-brand-text)'  },
          { label:'BULLISH',   value: bulls,                  color:'var(--color-brand-bull)'  },
          { label:'BEARISH',   value: bears,                  color:'var(--color-brand-bear)'  },
          { label:'TOP SCORE', value: topScore.toFixed(1),    color:'var(--color-brand-gold)'  },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-xl border px-5 py-4 relative overflow-hidden"
            style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}
          >
            {/* top line */}
            <div className="absolute top-0 inset-x-0 h-px"
              style={{ background:'linear-gradient(90deg,transparent,rgba(79,142,247,0.3),transparent)' }} />
            <div className="font-mono text-[9px] tracking-[0.22em] mb-1"
              style={{ color:'var(--color-brand-muted)' }}>{s.label}</div>
            <div className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Main radar table ─────────────────────────── */}
      <SmartRadarPremium data={data} />
    </div>
  );
}
