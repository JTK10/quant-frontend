import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

type BosItem = {
  Name: string;
  Symbol: string;
  Direction: string;
  Signal_Time: string;
  Entry_Price: number;
  SL: number;
  Target: number;
  RiskReward: string;
  RVOL: number;
  PCR: number;
  Body_Pct: number;
  EMA_Gap_Pct: number;
  Coil_Score: number;
  Range_Expan: number;
  Opt_Vol_OI_Ratio: number;
  Chart: string;
};

async function getBosData(dateStr: string): Promise<{ items: BosItem[] } | null> {
  try {
    const url = await getInternalApiUrl(`/api/analytics?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function MetricCard({ title, value, tone = 'neutral' }: { title: string; value: string | number; tone?: 'neutral' | 'bull' | 'bear' }) {
  const color =
    tone === 'bull'
      ? 'var(--color-brand-bull)'
      : tone === 'bear'
        ? 'var(--color-brand-bear)'
        : 'var(--color-brand-text)';

  return (
    <div
      className="rounded-xl border px-5 py-4 relative overflow-hidden"
      style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
    >
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{ background: 'linear-gradient(90deg,transparent,rgba(79,142,247,0.3),transparent)' }}
      />
      <div className="font-mono text-[9px] tracking-[0.22em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>{title}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isBull = direction === 'BULLISH';
  const isBear = direction === 'BEARISH';
  return (
    <span
      className="font-mono text-[10px] font-bold px-2 py-1 rounded tracking-wider"
      style={{
        color: isBull ? 'var(--color-brand-bull)' : isBear ? 'var(--color-brand-bear)' : 'var(--color-brand-muted)',
        background: isBull ? 'var(--color-brand-bullbg)' : isBear ? 'var(--color-brand-bearbg)' : 'var(--color-brand-border)',
      }}
    >
      {direction}
    </span>
  );
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatRiskReward(value: string) {
  if (!value || value === 'N/A') return 'N/A';
  return value.includes(':') ? value : `1:${value}`;
}

export default async function AnalyticsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getBosData(dateStr);

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
          <h1 className="text-2xl font-bold tracking-wide text-white">BOS Break Out</h1>
        </div>
        <div
          className="rounded-xl border p-12 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            ERROR LOADING BOS BREAK OUT DATA
          </p>
        </div>
      </div>
    );
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const bullish = items.filter((item) => item.Direction === 'BULLISH').length;
  const bearish = items.filter((item) => item.Direction === 'BEARISH').length;
  const avgRvol = average(items.map((item) => item.RVOL));
  const avgPcr = average(items.filter((item) => item.PCR > 0).map((item) => item.PCR));

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">BOS Break Out</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            BREAK OF STRUCTURE RADAR
            <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <MetricCard title="TOTAL SIGNALS" value={items.length} />
        <MetricCard title="BULLISH" value={bullish} tone="bull" />
        <MetricCard title="BEARISH" value={bearish} tone="bear" />
        <MetricCard title="AVG RVOL / PCR" value={`${avgRvol.toFixed(2)}x / ${avgPcr.toFixed(2)}`} />
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div className="px-5 py-3.5 border-b" style={{ borderColor: 'var(--color-brand-border)', background: 'rgba(0,0,0,0.2)' }}>
          <span className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            BOS BREAK OUT BOARD
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-10 text-center font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            NO BOS BREAK OUT SIGNALS FOR {dateStr}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-brand-border)', background: 'rgba(0,0,0,0.15)' }}>
                  {['VIEW', 'STOCK', 'SIDE', 'TIME OF BREAKOUT', 'ENTRY', 'SL', 'TARGET', 'R:R', 'RVOL', 'PCR', 'BODY %', 'EMA GAP %', 'OPT VOL/OI'].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3 font-mono text-[9px] tracking-widest"
                      style={{ color: 'var(--color-brand-muted)' }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.Symbol}-${item.Signal_Time}-${index}`} className="border-b" style={{ borderColor: 'rgba(26,40,64,0.5)' }}>
                    <td className="px-5 py-3.5">
                      {item.Chart ? (
                        <a
                          href={item.Chart}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs"
                          style={{ color: 'var(--color-brand-accent)' }}
                        >
                          TV
                        </a>
                      ) : (
                        <span className="font-mono text-xs" style={{ color: 'var(--color-brand-muted)' }}>N/A</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold" style={{ color: 'var(--color-brand-text)' }}>{item.Symbol || item.Name}</div>
                      {item.Symbol !== item.Name && (
                        <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>{item.Name}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <DirectionBadge direction={item.Direction} />
                    </td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{item.Signal_Time || 'N/A'}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums" style={{ color: 'var(--color-brand-text)' }}>Rs {item.Entry_Price.toFixed(2)}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums" style={{ color: 'var(--color-brand-bear)' }}>Rs {item.SL.toFixed(2)}</td>
                    <td className="px-5 py-3.5 font-mono tabular-nums" style={{ color: 'var(--color-brand-bull)' }}>Rs {item.Target.toFixed(2)}</td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{formatRiskReward(item.RiskReward)}</td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{item.RVOL.toFixed(2)}x</td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{item.PCR.toFixed(2)}</td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{item.Body_Pct.toFixed(2)}%</td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{item.EMA_Gap_Pct.toFixed(2)}%</td>
                    <td className="px-5 py-3.5 font-mono" style={{ color: 'var(--color-brand-text)' }}>{(item.Opt_Vol_OI_Ratio * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
