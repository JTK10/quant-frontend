import AutoRefresh from './components/AutoRefresh';
import DatePicker from './components/DatePicker';
import { getTradingViewUrl } from './utils/tradingview';
import { ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getRadarData(dateStr: string) {
  const url = `${process.env.AWS_LAMBDA_URL}?route=smart-radar&date=${dateStr}`;
  
  const res = await fetch(url, {
    headers: { 
      'x-radar-secret': process.env.AWS_RADAR_SECRET || '' 
    },
    cache: 'no-store'
  });
  
  // If you still get a 403, add this log to see what's happening in Vercel logs
  if (res.status === 403) {
      console.error("The Handshake failed. Check if AWS_RADAR_SECRET in Vercel matches AWS.");
  }

  if (!res.ok) return [];
  return res.json();
}

export default async function Dashboard({ searchParams }: { searchParams: { date?: string } }) {
  // 2. Get date from URL (e.g., ?date=2026-02-20)
  const dateStr = searchParams.date || new Date().toISOString().split('T')[0];

  // 3. Fetch LIVE data (No more dummy arrays!)
  const signals = await getRadarData(dateStr);

  const topThree = signals.slice(0, 3);
  const tableData = signals.slice(3);

  return (
    <div className="font-sans max-w-7xl mx-auto">
      <AutoRefresh interval={60000} /> 
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Smart Radar</h1>
          <p className="text-brand-muted text-sm mt-1">Live algorithmic order flow.</p>
        </div>
        <DatePicker /> {/* Interactive Date Picker */}
      </div>

      {/* Spotlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {topThree.map((stock: any, idx: number) => {
          const isBull = stock.OI > 0;
          return (
            <div key={idx} className="bg-brand-surface border border-brand-border rounded-xl p-5">
              <div className="flex justify-between items-start mb-4">
                <a href={getTradingViewUrl(stock.Name)} target="_blank" rel="noopener noreferrer" className="text-xl font-bold text-white hover:text-brand-accent flex items-center gap-2">
                  {stock.Name} <ExternalLink size={14} className="text-brand-muted" />
                </a>
                <span className={`px-2.5 py-1 rounded text-xs font-bold ${isBull ? 'bg-brand-bullBg text-brand-bull' : 'bg-brand-bearBg text-brand-bear'}`}>
                  {isBull ? 'LONG' : 'SHORT'}
                </span>
              </div>
              <div className="flex justify-between items-end mt-6">
                <div>
                  <div className="text-xs text-brand-muted mb-1 font-medium uppercase">Smart Rank</div>
                  <div className="text-4xl font-black text-white">{stock.SmartRank.toFixed(1)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-brand-muted mb-1 font-medium uppercase">OI Shift</div>
                  <div className={`flex items-center justify-end gap-1 text-lg font-bold ${isBull ? 'text-brand-bull' : 'text-brand-bear'}`}>
                    {isBull ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    {stock.OI > 0 ? '+' : ''}{stock.OI}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Data Table */}
      <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-brand-border">
          <h3 className="font-semibold text-white">Market Radar Feed</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-[#0f1522] border-b border-brand-border text-brand-muted">
              <th className="px-5 py-3 font-medium uppercase text-xs">Symbol</th>
              <th className="px-5 py-3 font-medium uppercase text-xs">Action</th>
              <th className="px-5 py-3 font-medium uppercase text-xs">Rank</th>
              <th className="px-5 py-3 font-medium uppercase text-xs text-right">OI Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {tableData.map((stock: any, idx: number) => {
              const isBull = stock.OI > 0;
              return (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-4">
                    <a href={getTradingViewUrl(stock.Name)} target="_blank" rel="noopener noreferrer" className="font-bold text-white hover:text-brand-accent flex items-center gap-2 w-fit">
                      {stock.Name} <ExternalLink size={12} className="text-brand-muted" />
                    </a>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${isBull ? 'bg-brand-bullBg text-brand-bull' : 'bg-brand-bearBg text-brand-bear'}`}>
                      {isBull ? 'LONG' : 'SHORT'}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-bold text-gray-200">{stock.SmartRank.toFixed(1)}</td>
                  <td className={`px-5 py-4 text-right font-mono font-bold ${isBull ? 'text-brand-bull' : 'text-brand-bear'}`}>
                    {stock.OI > 0 ? '+' : ''}{stock.OI}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
