import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getAISignals(dateStr: string) {
  const url = await getInternalApiUrl(`/api/ai?date=${encodeURIComponent(dateStr)}`);
  const res = await fetch(url, { cache: 'no-store' });
  
  if (!res.ok) return [];
  return res.json();
}

export default async function AISignalsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getAISignals(dateStr);

  return (
    <div className="font-sans max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">AI Verdicts Dashboard</h1>
          <p className="text-brand-muted text-sm mt-1">Daily machine learning driven trade signals.</p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="space-y-6">
        {signals.map((sig: any) => {
          const isHighConviction = sig.Confidence > 80;
          
          return (
            <div key={sig.Name} className={`bg-brand-surface border border-brand-border rounded-2xl p-8`}>
              
              {/* Header */}
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-3xl font-black text-white">{sig.Name}</h2>
                  <span className="text-brand-muted text-sm">Signal Time: {sig.Time}</span>
                </div>
                <div className={`px-4 py-2 rounded-lg font-black ${isHighConviction ? 'bg-brand-bull text-slate-950' : 'bg-yellow-500 text-slate-950'}`}>
                  {sig.Decision.replace('_', ' ')}
                </div>
              </div>

              {/* AI Reasoning block */}
              <div className="bg-white/5 border border-brand-border p-4 rounded-xl mb-6 text-brand-muted font-medium italic">
                " {sig.Reason} "
              </div>

              {/* Trading Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/30 p-4 rounded-xl border border-brand-border">
                <div>
                  <div className="text-brand-bull text-xs font-bold mb-1 tracking-wider">TARGET</div>
                  <div className="text-xl font-mono text-white">{sig.Target}</div>
                </div>
                <div>
                  <div className="text-brand-bear text-xs font-bold mb-1 tracking-wider">STOPLOSS</div>
                  <div className="text-xl font-mono text-white">{sig.StopLoss}</div>
                </div>
                <div>
                  <div className="text-brand-muted text-xs font-bold mb-1 tracking-wider">R/R RATIO</div>
                  <div className="text-xl font-mono text-white">{sig.RiskReward}</div>
                </div>
                
                {/* Confidence Bar */}
                <div>
                  <div className="text-brand-muted text-xs font-bold mb-1 tracking-wider flex justify-between">
                    <span>CONFIDENCE</span> <span>{sig.Confidence}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden mt-2">
                    <div 
                      className={`h-full ${isHighConviction ? 'bg-brand-bull' : 'bg-yellow-500'}`} 
                      style={{ width: `${sig.Confidence}%` }}
                    ></div>
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
