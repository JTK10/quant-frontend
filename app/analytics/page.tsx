import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getAnalyticsData(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/analytics?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

function MetricCard({ title, value, bull = null }: { title: string; value: string | number; bull?: boolean | null }) {
  const col = bull === true ? 'var(--color-brand-bull)' : bull === false ? 'var(--color-brand-bear)' : 'var(--color-brand-text)';
  return (
    <div className="rounded-xl border px-5 py-4 relative overflow-hidden"
      style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
      <div className="absolute top-0 inset-x-0 h-px"
        style={{ background:'linear-gradient(90deg,transparent,rgba(79,142,247,0.3),transparent)' }} />
      <div className="font-mono text-[9px] tracking-[0.22em] mb-1" style={{ color:'var(--color-brand-muted)' }}>{title}</div>
      <div className="text-2xl font-bold" style={{ color: col }}>{value}</div>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data    = await getAnalyticsData(dateStr);

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
          <h1 className="text-2xl font-bold tracking-wide text-white">Analytics</h1>
        </div>
        <div className="rounded-xl border p-12 text-center"
          style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            ERROR LOADING ANALYTICS DATA
          </p>
        </div>
      </div>
    );
  }

  const { metrics, trades } = data;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Swing Analytics</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            EXECUTION METRICS
            <span className="ml-2" style={{ color:'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <MetricCard title="TOTAL TRADES"  value={metrics.totalTrades} />
        <MetricCard title="WIN RATE"      value={`${metrics.winRate.toFixed(1)}%`}   bull={metrics.winRate > 50} />
        <MetricCard title="AVG RETURN"    value={`${metrics.avgReturn.toFixed(2)}%`} bull={metrics.avgReturn > 0} />
        <MetricCard title="AVG HOLD"      value={`${metrics.avgHold.toFixed(1)}d`} />
        <MetricCard title="BEST TRADE"    value={`+${metrics.bestTrade.toFixed(1)}%`} bull={true} />
      </div>

      <div className="rounded-xl border overflow-hidden"
        style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
        <div className="px-5 py-3.5 border-b" style={{ borderColor:'var(--color-brand-border)', background:'rgba(0,0,0,0.2)' }}>
          <span className="font-mono text-[10px] tracking-widest" style={{ color:'var(--color-brand-muted)' }}>EXECUTION LOG</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor:'var(--color-brand-border)', background:'rgba(0,0,0,0.15)' }}>
              {['SYMBOL','SIDE','RETURN'].map(h => (
                <th key={h} className="px-5 py-3 font-mono text-[9px] tracking-widest"
                  style={{ color:'var(--color-brand-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((t: any, i: number) => (
              <tr key={i} className="border-b"
                style={{ borderColor:'rgba(26,40,64,0.5)', cursor:'default' }}
              >
                <td className="px-5 py-3.5 font-semibold" style={{ color:'var(--color-brand-text)' }}>{t.Symbol}</td>
                <td className="px-5 py-3.5 font-mono text-xs" style={{ color:'var(--color-brand-muted)' }}>{t.Direction}</td>
                <td className="px-5 py-3.5 font-mono font-bold text-right"
                  style={{ color: t.ReturnPct > 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}>
                  {t.ReturnPct > 0 ? '+' : ''}{t.ReturnPct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
