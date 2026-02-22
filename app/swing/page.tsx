import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getActiveSwings(dateStr: string) {
  const url = await getInternalApiUrl(`/api/swing?date=${encodeURIComponent(dateStr)}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

export default async function SwingPage({ searchParams }: { searchParams: { date?: string } }) {
  const dateStr = searchParams.date || new Date().toISOString().split('T')[0];
  const swings = await getActiveSwings(dateStr);

  return (
    <div className="font-sans max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Swing Trading Engine</h2>
          <p className="text-brand-muted text-sm mt-1">Daily Hybrid Adaptive Swing Model</p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#0f1522] border-b border-brand-border">
            <tr className="text-brand-muted uppercase text-xs">
              <th className="px-5 py-3 font-medium tracking-wider">Asset</th>
              <th className="px-5 py-3 font-medium tracking-wider">Side</th>
              <th className="px-5 py-3 font-medium tracking-wider">Setup</th>
              <th className="px-5 py-3 font-medium tracking-wider">Confidence</th>
              <th className="px-5 py-3 font-medium tracking-wider">Trigger</th>
              <th className="px-5 py-3 font-medium tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {swings.map((trade: any, idx: number) => {
              const isBull = trade.Direction === "LONG";
              const color = isBull ? "text-brand-bull" : "text-brand-bear";
              const barColor = isBull ? "bg-brand-bull" : "bg-brand-bear";

              return (
                <tr key={idx} className="hover:bg-white/5 transition-colors group">
                  <td className="p-4 font-bold text-white group-hover:text-brand-accent transition-colors">
                    {trade.Symbol}
                  </td>
                  <td className={`p-4 font-bold ${color}`}>
                    {trade.Direction}
                  </td>
                  <td className="p-4 text-brand-muted">
                    {trade.Setup}
                  </td>
                  <td className="p-4 w-48">
                    <div className="flex justify-between text-xs mb-1 text-brand-muted">
                      <span>Score</span>
                      <span className="font-bold text-white">{trade.Confidence}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${barColor}`} style={{ width: `${trade.Confidence}%` }}></div>
                    </div>
                  </td>
                  <td className="p-4 font-mono text-gray-200">
                    ₹{trade.Trigger}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${trade.Status === 'ACTIVE' ? 'bg-brand-bullBg text-brand-bull' : 'bg-yellow-500/10 text-yellow-500'}`}>
                      {trade.Status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {swings.length === 0 && (
          <div className="p-8 text-center text-brand-muted italic">
            No active swing candidates stored for today.
          </div>
        )}
      </div>
    </div>
  );
}
