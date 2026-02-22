import DatePicker from '../components/DatePicker';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({ searchParams }: { searchParams: { date?: string } }) {
  const dateStr = searchParams.date || new Date().toISOString().split('T')[0];
  
  // Dummy Analytics Data
  const metrics = { totalTrades: 42, winRate: 64.5, avgReturn: 1.2, avgHold: 3.5, bestTrade: 14.5 };
  const trades = [
    { Symbol: "RELIANCE", Direction: "LONG", Entry_Date: "2026-01-10", ReturnPct: 4.5, Exit_Reason: "Target Hit" },
    { Symbol: "TCS", Direction: "SHORT", Entry_Date: "2026-01-12", ReturnPct: -1.2, Exit_Reason: "Stop Loss" },
  ];

  return (
    <div className="font-sans max-w-7xl mx-auto text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Swing Analytics</h2>
          <p className="text-brand-muted text-sm mt-1">Historical backtest performance.</p>
        </div>
        <DatePicker />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricCard title="Total Trades" value={metrics.totalTrades} />
        <MetricCard title="Win Rate" value={`${metrics.winRate}%`} isBull={metrics.winRate > 50} />
        <MetricCard title="Avg Return" value={`${metrics.avgReturn}%`} isBull={metrics.avgReturn > 0} />
        <MetricCard title="Avg Hold" value={metrics.avgHold} />
        <MetricCard title="Best Trade" value={`+${metrics.bestTrade}%`} isBull={true} />
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
    <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
      <div className="text-brand-muted text-xs font-semibold uppercase mb-2">{title}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
    </div>
  );
}
