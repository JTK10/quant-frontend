import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getAISignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/ai?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export default async function AISignalsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getAISignals(dateStr);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">AI Verdicts</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            MACHINE LEARNING SIGNALS
            <span className="ml-2" style={{ color:'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      {signals.length === 0 && (
        <div className="rounded-xl border p-12 text-center"
          style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            NO AI SIGNALS FOR {dateStr}
          </p>
        </div>
      )}

      <div className="space-y-5">
        {signals.map((sig: any) => {
          const hiConf  = sig.Confidence > 80;
          const confCol = hiConf ? 'var(--color-brand-bull)' : 'var(--color-brand-gold)';
          return (
            <div key={sig.Name} className="rounded-xl border overflow-hidden relative"
              style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
              {/* Top accent line */}
              <div className="absolute top-0 inset-x-0 h-px"
                style={{ background:`linear-gradient(90deg,transparent,${confCol}80,transparent)` }} />

              <div className="p-6">
                {/* Name + decision */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-wide">{sig.Name}</h2>
                    <div className="font-mono text-[10px] mt-1" style={{ color:'var(--color-brand-muted)' }}>
                      Signal Time: {sig.Time}
                    </div>
                  </div>
                  <div className="font-bold text-sm px-4 py-2 rounded-lg tracking-wider"
                    style={{
                      background: hiConf ? 'var(--color-brand-bullbg)' : 'rgba(240,165,0,0.1)',
                      color:      confCol,
                      border:     `1px solid ${confCol}40`,
                    }}>
                    {sig.Decision?.replace('_',' ')}
                  </div>
                </div>

                {/* Reason */}
                <div className="rounded-lg border px-4 py-3 mb-5 text-sm italic leading-relaxed"
                  style={{
                    background:   'rgba(0,0,0,0.3)',
                    borderColor:  'var(--color-brand-border)',
                    color:        'var(--color-brand-muted)',
                  }}>
                  "{sig.Reason}"
                </div>

                {/* Trading metrics grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-xl border p-4"
                  style={{ background:'rgba(0,0,0,0.25)', borderColor:'var(--color-brand-border)' }}>
                  <div>
                    <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color:'var(--color-brand-bull)' }}>TARGET</div>
                    <div className="font-mono text-xl font-bold text-white">{sig.Target}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color:'var(--color-brand-bear)' }}>STOP LOSS</div>
                    <div className="font-mono text-xl font-bold text-white">{sig.StopLoss}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color:'var(--color-brand-muted)' }}>RISK/REWARD</div>
                    <div className="font-mono text-xl font-bold text-white">{sig.RiskReward}</div>
                  </div>
                  <div>
                    <div className="flex justify-between font-mono text-[9px] tracking-widest mb-2" style={{ color:'var(--color-brand-muted)' }}>
                      <span>CONFIDENCE</span>
                      <span style={{ color: confCol }}>{sig.Confidence}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background:'var(--color-brand-border)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width:`${sig.Confidence}%`, background: confCol }} />
                    </div>
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
