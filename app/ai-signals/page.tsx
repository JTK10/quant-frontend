import Link from 'next/link';
import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import { resolveSignalSide, toNumber, toText } from '../utils/scanner';

export const dynamic = 'force-dynamic';

async function getAISignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/ai?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'rgba(0,0,0,0.25)', borderColor: 'var(--color-brand-border)' }}
    >
      <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: accent || 'var(--color-brand-muted)' }}>
        {label}
      </div>
      <div className="font-mono text-xl font-bold text-white">{value}</div>
    </div>
  );
}

export default async function AISignalsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getAISignals(dateStr);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">AI Verdicts</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            SELECTED TRADE CONTEXT
            <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      {signals.length === 0 && (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            NO AI SIGNALS FOR {dateStr}
          </p>
        </div>
      )}

      <div className="space-y-5">
        {signals.map((sig: Record<string, unknown>, index: number) => {
          const confidence = toNumber(sig.Confidence);
          const confColor =
            confidence >= 80
              ? 'var(--color-brand-bull)'
              : confidence >= 65
                ? 'var(--color-brand-gold)'
                : 'var(--color-brand-bear)';
          const side = resolveSignalSide(sig);
          const sideColor = side === 'BULLISH' ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
          const sideBg = side === 'BULLISH' ? 'var(--color-brand-bullbg)' : 'var(--color-brand-bearbg)';
          const chart = toText(sig.Chart);

          return (
            <div
              key={`${toText(sig.Name)}-${toText(sig.Time)}-${index}`}
              className="rounded-xl border overflow-hidden relative"
              style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
            >
              <div
                className="absolute top-0 inset-x-0 h-px"
                style={{ background: `linear-gradient(90deg,transparent,${confColor}80,transparent)` }}
              />

              <div className="p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h2 className="text-2xl font-bold text-white tracking-wide">{toText(sig.Name, 'UNKNOWN')}</h2>
                      <span
                        className="font-mono text-[10px] tracking-widest px-2 py-0.5 rounded"
                        style={{ background: sideBg, color: sideColor }}
                      >
                        {side}
                      </span>
                      <span
                        className="font-mono text-[10px] tracking-widest px-2 py-0.5 rounded"
                        style={{ background: 'var(--color-brand-accentbg)', color: 'var(--color-brand-accent)' }}
                      >
                        {toText(sig.ModuleLabel ?? sig.Module, 'AI')}
                      </span>
                    </div>
                    <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                      Signal Time: {toText(sig.Time, '-')}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="font-bold text-sm px-4 py-2 rounded-lg tracking-wider"
                      style={{
                        background: 'rgba(240,165,0,0.1)',
                        color: confColor,
                        border: `1px solid ${confColor}40`,
                      }}
                    >
                      {toText(sig.Decision, 'AI SELECTED')}
                    </div>
                    {chart && (
                      <Link
                        href={chart}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] tracking-[0.2em] px-3 py-2 rounded-lg border transition-colors"
                        style={{
                          color: 'var(--color-brand-accent)',
                          borderColor: 'var(--color-brand-border)',
                        }}
                      >
                        OPEN CHART
                      </Link>
                    )}
                  </div>
                </div>

                <div
                  className="rounded-lg border px-4 py-3 text-sm italic leading-relaxed"
                  style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderColor: 'var(--color-brand-border)',
                    color: 'var(--color-brand-muted)',
                  }}
                >
                  "{toText(sig.Reason, '-')}."
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatCard label="ENTRY" value={toNumber(sig.Entry).toFixed(2)} accent="var(--color-brand-accent)" />
                  <StatCard label="TARGET" value={toNumber(sig.Target).toFixed(2)} accent="var(--color-brand-bull)" />
                  <StatCard label="STOP LOSS" value={toNumber(sig.StopLoss).toFixed(2)} accent="var(--color-brand-bear)" />
                  <StatCard label="RISK/REWARD" value={toText(sig.RiskReward, '-')} />
                  <div
                    className="rounded-xl border p-4"
                    style={{ background: 'rgba(0,0,0,0.25)', borderColor: 'var(--color-brand-border)' }}
                  >
                    <div className="flex justify-between font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--color-brand-muted)' }}>
                      <span>CONFIDENCE</span>
                      <span style={{ color: confColor }}>{confidence.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--color-brand-border)' }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(confidence, 100)}%`, background: confColor }} />
                    </div>
                    <div className="font-mono text-sm font-bold text-white">{confidence.toFixed(0)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <StatCard label="PCR" value={toNumber(sig.PCR).toFixed(2)} />
                  <StatCard label="PCR OPEN" value={toNumber(sig.PCR_At_Open).toFixed(2)} />
                  <StatCard label="WALLS" value={toText(sig.Walls, '-')} />
                  <StatCard label="STRIKE REC" value={toText(sig.StrikeRec ?? sig.Strike_Rec, '-')} />
                  <StatCard label="DAY MOVE" value={`${toNumber(sig.LiveMove).toFixed(2)}%`} />
                </div>

                {(toText(sig.OptionsPlay) || toText(sig.Notes)) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {toText(sig.OptionsPlay) && (
                      <div
                        className="rounded-xl border p-4"
                        style={{ background: 'rgba(0,0,0,0.25)', borderColor: 'var(--color-brand-border)' }}
                      >
                        <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--color-brand-muted)' }}>
                          OPTIONS PLAY
                        </div>
                        <div className="text-sm leading-relaxed text-white">{toText(sig.OptionsPlay)}</div>
                      </div>
                    )}
                    {toText(sig.Notes) && (
                      <div
                        className="rounded-xl border p-4"
                        style={{ background: 'rgba(0,0,0,0.25)', borderColor: 'var(--color-brand-border)' }}
                      >
                        <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'var(--color-brand-muted)' }}>
                          SCANNER NOTES
                        </div>
                        <div className="text-sm leading-relaxed text-white">{toText(sig.Notes)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
