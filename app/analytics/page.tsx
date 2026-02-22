import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getAnalyticsData(dateStr: string) {
  const url = await getInternalApiUrl(`/api/analytics?date=${encodeURIComponent(dateStr)}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function AnalyticsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getAnalyticsData(dateStr);
  
  if (!data) return <div className="text-white">Error loading analytics.</div>;

  const { metrics, trades } = data;

  return (
    <div className="font-sans max-w-7xl mx-auto text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Swing Performance Analytics</h2>
          <p className="text-brand-muted text-sm mt-1">Live execution metrics from the hybrid swing model for <span className="text-brand-accent">{dateStr}</span>.</p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard title="Total Trades" value={metrics.totalTrades} />
        <MetricCard title="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} isBull={metrics.winRate > 50} />
        <MetricCard title="Avg Return" value={`${metrics.avgReturn.toFixed(2)}%`} isBull={metrics.avgReturn > 0} />
        <MetricCard title="Avg Hold" value={`${metrics.avgHold.toFixed(1)}d`} />
        <MetricCard title="Best Trade" value={`+${metrics.bestTrade.toFixed(1)}%`} isBull={true} />
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-border">
          <h3 className="font-semibold text-white">Execution Log</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#0f1522] border-b border-brand-border text-brand-muted">
              <th className="px-5 py-3 font-medium uppercase text-xs">Symbol</th>
              <th className="px-5 py-3 font-medium uppercase text-xs">Side</th>
              <th className="px-5 py-3 font-medium uppercase text-xs text-right">Return</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {trades.map((t: any, i: number) => (
              <tr key={i} className="hover:bg-white/5">
                <td className="px-5 py-4 font-bold">{t.Symbol}</td>
                <td className="px-5 py-4 text-brand-muted">{t.Direction}</td>
                <td className={`px-5 py-4 text-right font-bold ${t.ReturnPct > 0 ? 'text-brand-bull' : 'text-brand-bear'}`}>
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

function MetricCard({ title, value, isBull = null }: { title: string, value: any, isBull?: boolean | null }) {
  let color = "text-white";
  if (isBull === true) color = "text-brand-bull";
  if (isBull === false) color = "text-brand-bear";

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5 shadow-sm">
      <div className="text-brand-muted text-xs font-bold uppercase mb-2 tracking-wider">{title}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}
