import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const dynamic = 'force-dynamic';

async function getSwings(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/swing?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache:'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

function StatusBadge({ status }: { status: string }) {
  const isActive    = status === 'ACTIVE' || status === 'TRIGGERED';
  const isPending   = status === 'PENDING';
  const style = isActive
    ? { color:'var(--color-brand-bull)',  background:'var(--color-brand-bullbg)' }
    : isPending
    ? { color:'var(--color-brand-gold)',  background:'rgba(240,165,0,0.1)' }
    : { color:'var(--color-brand-muted)', background:'var(--color-brand-border)' };
  return (
    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded tracking-wider" style={style}>
      {status}
    </span>
  );
}

export default async function SwingPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const swings  = await getSwings(dateStr);

  const active  = swings.filter((s: any) => s.Status === 'ACTIVE' || s.Status === 'TRIGGERED').length;
  const pending = swings.filter((s: any) => s.Status === 'PENDING').length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background:'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Swing Engine</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
            HYBRID ADAPTIVE SWING MODEL
            <span className="ml-2" style={{ color:'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label:'TOTAL',   value: swings.length,  col:'var(--color-brand-text)' },
          { label:'ACTIVE',  value: active,          col:'var(--color-brand-bull)' },
          { label:'PENDING', value: pending,         col:'var(--color-brand-gold)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border px-5 py-3.5 relative overflow-hidden"
            style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
            <div className="absolute top-0 inset-x-0 h-px"
              style={{ background:'linear-gradient(90deg,transparent,rgba(79,142,247,0.3),transparent)' }} />
            <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color:'var(--color-brand-muted)' }}>{s.label}</div>
            <div className="text-2xl font-bold" style={{ color: s.col }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden"
        style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>

        {/* Head */}
        <div className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest"
          style={{
            gridTemplateColumns:'1fr 5rem 8rem 10rem 7rem 7rem',
            borderColor:'var(--color-brand-border)',
            background:'rgba(0,0,0,0.2)',
            color:'var(--color-brand-muted)',
          }}>
          {['ASSET','SIDE','SETUP','CONFIDENCE','TRIGGER','STATUS'].map(h => <div key={h}>{h}</div>)}
        </div>

        <div>
          {swings.map((trade: any, idx: number) => {
            const isBull  = trade.Direction === 'LONG';
            const dirCol  = isBull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
            const conf    = typeof trade.Confidence === 'number' ? trade.Confidence : Number(trade.Confidence) || 0;
            const barCol  = conf >= 70
              ? 'var(--color-brand-bull)'
              : conf >= 45 ? 'var(--color-brand-gold)' : 'var(--color-brand-bear)';

            return (
              <div
                key={idx}
                className="grid gap-3 px-5 py-4 border-b items-center"
                style={{
                  gridTemplateColumns:'1fr 5rem 8rem 10rem 7rem 7rem',
                  borderColor:'rgba(26,40,64,0.5)',
                  transition:'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div className="font-semibold text-sm" style={{ color:'var(--color-brand-text)' }}>
                  {trade.Symbol}
                </div>
                <div className="font-bold font-mono text-xs" style={{ color: dirCol }}>
                  {trade.Direction}
                </div>
                <div className="font-mono text-[10px]" style={{ color:'var(--color-brand-muted)' }}>
                  {trade.Setup ?? '—'}
                </div>
                <div>
                  <div className="flex justify-between font-mono text-[9px] mb-1" style={{ color:'var(--color-brand-muted)' }}>
                    <span>CONF</span>
                    <span style={{ color: barCol }}>{conf}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'var(--color-brand-border)' }}>
                    <div className="h-full rounded-full" style={{ width:`${Math.min(conf,100)}%`, background: barCol }} />
                  </div>
                </div>
                <div className="font-mono text-sm tabular-nums" style={{ color:'var(--color-brand-text)' }}>
                  ₹{trade.Trigger ?? '—'}
                </div>
                <div>
                  <StatusBadge status={trade.Status ?? '—'} />
                </div>
              </div>
            );
          })}
        </div>

        {swings.length === 0 && (
          <div className="p-10 text-center font-mono text-xs tracking-widest"
            style={{ color:'var(--color-brand-muted)' }}>
            NO SWING CANDIDATES
          </div>
        )}
      </div>
    </div>
  );
}
