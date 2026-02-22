import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { getTradingViewUrl } from '../utils/tradingview';
import { ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getVelocityData(dateStr: string) {
  const url = `${process.env.AWS_LAMBDA_URL}?route=market-velocity&date=${dateStr}`;
  const res = await fetch(url, {
    headers: { 'x-radar-secret': process.env.AWS_RADAR_SECRET || '' },
    cache: 'no-store'
  });
  if (!res.ok) return { bias: "NEUTRAL", bulls: [], bears: [] };
  return res.json();
}

export default async function VelocityPage({ searchParams }: { searchParams: { date?: string } }) {
  const dateStr = searchParams.date || new Date().toISOString().split('T')[0];
  
  const data = await getVelocityData(dateStr);
  const isBullish = data.bias === "BULLISH";

  return (
    <div className="font-sans max-w-7xl mx-auto text-white">
      <AutoRefresh interval={30000} />
      
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Market Velocity</h2>
          <p className="text-brand-muted text-sm mt-1">Showing momentum for: <span className="text-brand-accent">{dateStr}</span></p>
        </div>
        <DatePicker />
      </div>

      {/* Bias Indicator */}
      <div className={`mb-8 p-6 rounded-xl border flex items-center justify-between ${isBullish ? 'bg-brand-bullBg border-brand-bull/30' : 'bg-brand-bearBg border-brand-bear/30'}`}>
        <div>
          <div className="text-xs font-bold tracking-wider text-brand-muted uppercase">Market Bias</div>
          <div className={`text-4xl font-black mt-1 ${isBullish ? 'text-brand-bull' : 'text-brand-bear'}`}>
            {data.bias}
          </div>
        </div>
        <div className="text-right flex gap-8">
          <div>
            <div className="text-xs text-brand-muted uppercase font-bold">Bulls</div>
            <div className="text-2xl font-black text-brand-bull">{data.bulls.length}</div>
          </div>
          <div>
            <div className="text-xs text-brand-muted uppercase font-bold">Bears</div>
            <div className="text-2xl font-black text-brand-bear">{data.bears.length}</div>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* BULLISH COLUMN */}
        <div className="bg-brand-surface rounded-xl p-6 border border-brand-border">
          <h3 className="text-xl font-black text-brand-bull mb-4 border-b border-brand-border pb-2">🟢 Bullish Momentum</h3>
          <div className="space-y-3">
            {data.bulls.map((stock: any) => (
              <div key={stock.Name} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border-l-4 border-brand-bull hover:bg-white/10 transition-colors">
                <div>
                  <div className="font-bold text-lg text-white">{stock.Name}</div>
                  <div className="text-xs text-brand-muted">Break: {stock.Break}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white">{stock.Price.toFixed(2)}</div>
                  <div className="text-brand-bull text-sm font-bold">+{stock.OI}% OI</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BEARISH COLUMN */}
        <div className="bg-brand-surface rounded-xl p-6 border border-brand-border">
          <h3 className="text-xl font-black text-brand-bear mb-4 border-b border-brand-border pb-2">🔴 Bearish Momentum</h3>
          <div className="space-y-3">
            {data.bears.map((stock: any) => (
              <div key={stock.Name} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border-l-4 border-brand-bear hover:bg-white/10 transition-colors">
                <div>
                  <div className="font-bold text-lg text-white">{stock.Name}</div>
                  <div className="text-xs text-brand-muted">Break: {stock.Break}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-white">{stock.Price.toFixed(2)}</div>
                  <div className="text-brand-bear text-sm font-bold">{stock.OI}% OI</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
