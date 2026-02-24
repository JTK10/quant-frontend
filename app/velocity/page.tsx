import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getVelocityData(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/velocity?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) return { bias:'NEUTRAL', bulls:[], bears:[] };
    return res.json();
  } catch { return { bias:'NEUTRAL', bulls:[], bears:[] }; }
}

export default async function VelocityPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data    = await getVelocityData(dateStr);
  const bias    = data.bias ?? 'NEUTRAL';
  const isBull  = bias === 'BULLISH';
  const isBear  = bias === 'BEARISH';
  const biasCol = isBull ? 'var(--color-brand-bull)' : isBear ? 'var(--color-brand-bear)' : 'var(--color-brand-gold)';

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Market Velocity</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            MOMENTUM SCANNER
            <span className="ml-2" style={{ color:'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={30000} />
        </div>
      </div>

      {/* Bias banner */}
      <div className="rounded-xl border px-6 py-5 mb-6 relative overflow-hidden"
        style={{
          background:   `rgba(${isBull ? '5,217,143' : isBear ? '240,54,90' : '240,165,0'},0.05)`,
          borderColor:  `rgba(${isBull ? '5,217,143' : isBear ? '240,54,90' : '240,165,0'},0.25)`,
        }}>
        <div className="absolute top-0 inset-x-0 h-px"
          style={{ background:`linear-gradient(90deg,transparent,${biasCol}80,transparent)` }} />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] tracking-[0.25em] mb-1" style={{ color:'var(--color-brand-muted)' }}>MARKET BIAS</div>
            <div className="text-4xl font-bold tracking-wider" style={{ color: biasCol }}>{bias}</div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color:'var(--color-brand-muted)' }}>BULLS</div>
              <div className="text-3xl font-bold" style={{ color:'var(--color-brand-bull)' }}>{data.bulls?.length ?? 0}</div>
            </div>
            <div className="w-px h-10" style={{ background:'var(--color-brand-border)' }} />
            <div className="text-center">
              <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color:'var(--color-brand-muted)' }}>BEARS</div>
              <div className="text-3xl font-bold" style={{ color:'var(--color-brand-bear)' }}>{data.bears?.length ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bull / Bear columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[
          { key:'bulls', label:'Bullish Momentum', col:'var(--color-brand-bull)', stocks: data.bulls ?? [], pos: true },
          { key:'bears', label:'Bearish Momentum', col:'var(--color-brand-bear)', stocks: data.bears ?? [], pos: false },
        ].map(({ key, label, col, stocks, pos }) => (
          <div key={key} className="rounded-xl border overflow-hidden"
            style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor:'var(--color-brand-border)', background:'rgba(0,0,0,0.2)' }}>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: col }} />
                <span className="font-mono text-[10px] tracking-widest uppercase" style={{ color: col }}>{label}</span>
              </div>
              <span className="font-mono text-[10px]" style={{ color:'var(--color-brand-muted)' }}>{stocks.length}</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight:'480px' }}>
              {stocks.map((stock: any, i: number) => (
                <div key={`${stock.Name}-${i}`} className="flex items-center justify-between px-5 py-3 border-b group"
                  style={{ borderColor:'rgba(26,40,64,0.5)', cursor:'default' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <div>
                    <div className="font-semibold text-sm" style={{ color:'var(--color-brand-text)' }}>{stock.Name}</div>
                    {stock.Break && (
                      <div className="font-mono text-[10px] mt-0.5" style={{ color:'var(--color-brand-muted)' }}>
                        {stock.Break}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm tabular-nums" style={{ color:'var(--color-brand-text)' }}>
                      ₹{typeof stock.Price === 'number' ? stock.Price.toFixed(2) : (stock.Price ?? '—')}
                    </div>
                    <div className="font-mono text-[11px] font-semibold" style={{ color: col }}>
                      {pos ? '+' : ''}{stock.OI}% OI
                    </div>
                  </div>
                </div>
              ))}
              {stocks.length === 0 && (
                <div className="p-8 text-center font-mono text-xs" style={{ color:'var(--color-brand-muted)' }}>
                  NO SIGNALS
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
