import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';

export const dynamic = 'force-dynamic';

async function getSectorData(dateStr: string) {
  // const url = `${process.env.AWS_LAMBDA_URL}?route=sector-heatmap&date=${dateStr}`;
  // const res = await fetch(url, {
  //   headers: { 'X-Radar-Secret': process.env.AWS_RADAR_SECRET || '' },
  //   cache: 'no-store'
  // });
  // if (!res.ok) return [];
  // return res.json();
  
  // Simulated Aggregated Sector Data (Average OI Change)
  return [
    { Sector: "Banking", OI: 4.2 },
    { Sector: "IT", OI: 1.5 },
    { Sector: "Auto", OI: 8.4 },
    { Sector: "Metals", OI: -3.2 },
    { Sector: "Pharma", OI: -1.1 },
    { Sector: "Energy", OI: 0.5 },
  ].sort((a, b) => b.OI - a.OI);
}

export default async function SectorPage({ searchParams }: { searchParams: { date?: string } }) {
  const dateStr = searchParams.date || new Date().toISOString().split('T')[0];
  const sectors = await getSectorData(dateStr);

  return (
    <div className="font-sans max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Sector Heatmap</h2>
          <p className="text-brand-muted text-sm mt-1">Capital flow based on Open Interest velocity.</p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {sectors.map((sec: any) => {
          const isBull = sec.OI > 0;
          
          // Calculate opacity based on strength (Max 10% OI for 100% opacity)
          const strength = Math.min(Math.abs(sec.OI) / 10, 1); 
          
          // Generate dynamic style object for the background
          const bgStyle = isBull 
            ? `rgba(16, 185, 129, ${Math.max(strength, 0.15)})` // brand.bull
            : `rgba(239, 68, 68, ${Math.max(strength, 0.15)})`; // brand.bear

          return (
            <div 
              key={sec.Sector}
              className="relative p-6 rounded-xl border border-brand-border flex flex-col justify-between aspect-video transition-transform hover:scale-105 cursor-default overflow-hidden"
              style={{ backgroundColor: bgStyle }}
            >
              <div className="font-black text-xl tracking-wide z-10 text-white">{sec.Sector}</div>
              <div className="flex justify-between items-end z-10">
                <span className="text-sm font-semibold text-white/70">Avg OI Shift</span>
                <span className={`text-2xl font-black text-white`}>
                  {isBull ? '+' : ''}{sec.OI.toFixed(1)}%
                </span>
              </div>
              
              {/* Glass overlay to ensure text is always readable */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none"></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
