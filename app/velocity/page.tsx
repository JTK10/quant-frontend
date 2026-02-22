import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';

export const dynamic = 'force-dynamic';

async function getVelocityData(dateStr: string) {
  // const url = `${process.env.AWS_LAMBDA_URL}?route=market-velocity&date=${dateStr}`;
  // const res = await fetch(url, {
  //   headers: { 'X-Radar-Secret': process.env.AWS_RADAR_SECRET || '' },
  //   cache: 'no-store'
  // });
  // if (!res.ok) return { bias: "NEUTRAL", bulls: [], bears: [] };
  // return res.json();

  // Simulated Data
  return {
    bias: "BULLISH",
    bulls: [{ Name: "RELIANCE", Price: 2950.4, OI: 5.2, Break: "PDH" }, { Name: "TCS", Price: 4100.0, OI: 3.1, Break: "INSIDE" }],
    bears: [{ Name: "HDFCBANK", Price: 1420.5, OI: -4.5, Break: "PDL" }]
  };
}

export default async function VelocityPage({ searchParams }: { searchParams: { date?: string } }) {
  const dateStr = searchParams.date || new Date().toISOString().split('T')[0];
  const data = await getVelocityData(dateStr);
  const isBullish = data.bias === "BULLISH";

  return (
    <div className="font-sans max-w-7xl mx-auto">
      <AutoRefresh interval={30000} />
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Market Velocity</h1>
          <p className="text-brand-muted text-sm mt-1">Real-time buyer vs. seller momentum.</p>
        </div>
        <DatePicker />
      </div>

      {/* Bias Indicator */}
      <div className={`mb-10 p-6 rounded-xl border flex items-center justify-between bg-brand-surface ${isBullish ? 'border-brand-bull' : 'border-brand-bear'}`}>
        <div>
          <h3 className="text-sm font-bold tracking-widest text-brand-muted uppercase">Current Market Bias</h3>
          <div className={`text-5xl font-black drop-shadow-lg ${isBullish ? 'text-brand-bull' : 'text-brand-bear'}`}>
            {data.bias}
          </div>
        </div>
        <div className="text-right">
          <div className="text-brand-bull font-bold">Bulls: {data.bulls.length}</div>
          <div className="text-brand-bear font-bold">Bears: {data.bears.length}</div>
        </div>
      </div>

      {/* Split Order Book View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
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
