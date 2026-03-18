import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';

export const revalidate = 30;

type AiSignal = {
  Name: string;
  Side: string;
  Entry: string;
  Decision: string;
  Time: string;
  Reason: string;
  Target: string;
  StopLoss: string;
  RiskReward: string;
  Confidence: number;
  LiveMove: number;
  OI: number;
  PCR: string;
  Walls: string;
  Module: string;
  Chart: string;
};

async function getAISignals(dateStr: string): Promise<AiSignal[]> {
  try {
    const url = await getInternalApiUrl(`/api/ai?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { next: { revalidate: 30 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatLevel(value: string) {
  if (!value || value === 'N/A' || value === '-') return value || '-';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `Rs ${parsed.toFixed(2)}` : value;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function getProbabilityTheme(confidence: number) {
  if (confidence >= 80) {
    return {
      tone: 'HIGH CONVICTION',
      color: 'var(--color-brand-bull)',
      background: 'var(--color-brand-bullbg)',
      gradient: 'linear-gradient(90deg, #05d98f, #57f3be)',
    };
  }

  if (confidence >= 70) {
    return {
      tone: 'TRACKING',
      color: 'var(--color-brand-accent)',
      background: 'var(--color-brand-accentbg)',
      gradient: 'linear-gradient(90deg, #3c82f6, #74a6ff)',
    };
  }

  return {
    tone: 'LOWER EDGE',
    color: 'var(--color-brand-muted)',
    background: 'rgba(155,177,207,0.12)',
    gradient: 'linear-gradient(90deg, #7286a4, #aab8cb)',
  };
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-xl border px-5 py-4 relative overflow-hidden fade-up"
      style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
    >
      <div
        className="absolute top-0 inset-x-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${accent}80,transparent)` }}
      />
      <div className="font-mono text-[9px] tracking-[0.22em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

export default async function AISignalsPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getAISignals(dateStr);
  const topPicks = signals.slice(0, 5);

  const avgConfidence = average(topPicks.map((signal) => signal.Confidence));
  const avgLiveMove = average(topPicks.map((signal) => Math.abs(signal.LiveMove)));
  const highConviction = topPicks.filter((signal) => signal.Confidence >= 80).length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-5 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">AI Top Picks</h1>
          </div>
          <p className="font-mono text-xs tracking-[0.24em]" style={{ color: 'var(--color-brand-muted)' }}>
            SMART RADAR TOP 5
            <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>{dateStr}</span>
          </p>
          <p className="text-sm mt-3 max-w-2xl" style={{ color: 'var(--color-brand-muted)' }}>
            Ranked AI trade cards with confidence gauges, execution levels, and live option context from the existing backend feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        <MetricCard label="TOP PICKS" value={String(topPicks.length)} accent="var(--color-brand-text)" />
        <MetricCard label="HIGH CONVICTION" value={String(highConviction)} accent="var(--color-brand-bull)" />
        <MetricCard label="AVG PROBABILITY" value={`${avgConfidence.toFixed(1)}%`} accent="var(--color-brand-accent)" />
        <MetricCard label="AVG LIVE MOVE" value={`${avgLiveMove.toFixed(2)}%`} accent="var(--color-brand-gold)" />
      </div>

      {topPicks.length === 0 && (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            NO AI TOP PICKS FOR {dateStr}
          </p>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-5">
        {topPicks.map((signal, index) => {
          const theme = getProbabilityTheme(signal.Confidence);
          const isLead = index === 0;
          const sideText = signal.Side && signal.Side !== '-' ? signal.Side.toUpperCase() : '';
          const sideColor = sideText.includes('BULL')
            ? 'var(--color-brand-bull)'
            : sideText.includes('BEAR')
              ? 'var(--color-brand-bear)'
              : 'var(--color-brand-muted)';
          const sideBackground = sideText.includes('BULL')
            ? 'var(--color-brand-bullbg)'
            : sideText.includes('BEAR')
              ? 'var(--color-brand-bearbg)'
              : 'rgba(155,177,207,0.12)';

          return (
            <article
              key={`${signal.Name}-${signal.Time}-${index}`}
              className={`rounded-2xl border overflow-hidden relative fade-up ${isLead ? 'xl:col-span-2' : ''}`}
              style={{
                background: isLead
                  ? 'linear-gradient(135deg, rgba(24,41,68,1), rgba(18,32,53,1))'
                  : 'var(--color-brand-surface)',
                borderColor: 'var(--color-brand-border)',
                animationDelay: `${index * 80}ms`,
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg,transparent,${theme.color}90,transparent)` }}
              />

              <div className="p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
                      style={{ color: theme.color, background: theme.background }}
                    >
                      #{String(index + 1).padStart(2, '0')}
                    </div>
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h2 className="text-2xl font-bold text-white tracking-wide">{signal.Name}</h2>
                        <span
                          className="font-mono text-[10px] px-2.5 py-1 rounded-full tracking-[0.2em]"
                          style={{ color: theme.color, background: theme.background }}
                        >
                          {theme.tone}
                        </span>
                        {sideText && (
                          <span
                            className="font-mono text-[10px] px-2.5 py-1 rounded-full tracking-[0.18em]"
                            style={{ color: sideColor, background: sideBackground }}
                          >
                            {sideText}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] mt-2" style={{ color: 'var(--color-brand-muted)' }}>
                        <span>MODULE: {signal.Module || 'AI SIGNAL'}</span>
                        <span>TIME: {signal.Time || '-'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="px-4 py-2 rounded-xl border font-bold text-sm tracking-wider"
                      style={{ color: theme.color, borderColor: `${theme.color}50`, background: `${theme.color}14` }}
                    >
                      {signal.Decision.replaceAll('_', ' ')}
                    </div>
                    {signal.Chart && (
                      <a
                        href={signal.Chart}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl border font-mono text-xs tracking-[0.18em]"
                        style={{ color: 'var(--color-brand-accent)', borderColor: 'var(--color-brand-border)' }}
                      >
                        TV
                      </a>
                    )}
                  </div>
                </div>

                <div className={`grid gap-5 ${isLead ? 'xl:grid-cols-[1.15fr,0.85fr]' : 'lg:grid-cols-[1.1fr,0.9fr]'}`}>
                  <div className="space-y-5">
                    <section
                      className="rounded-2xl border p-5"
                      style={{ background: 'rgba(0,0,0,0.24)', borderColor: 'var(--color-brand-border)' }}
                    >
                      <div className="flex items-end justify-between mb-3">
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: 'var(--color-brand-muted)' }}>
                            WIN PROBABILITY
                          </div>
                          <div className="text-4xl font-bold leading-none mt-2" style={{ color: theme.color }}>
                            {signal.Confidence.toFixed(0)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: 'var(--color-brand-muted)' }}>
                            LIVE MOVE
                          </div>
                          <div
                            className="font-mono text-lg mt-2"
                            style={{ color: signal.LiveMove >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}
                          >
                            {formatSignedPercent(signal.LiveMove)}
                          </div>
                        </div>
                      </div>
                      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(signal.Confidence, 100)}%`,
                            background: theme.gradient,
                            animation: 'fillBar 0.75s ease-out both',
                          }}
                        />
                      </div>
                    </section>

                    <section
                      className="rounded-2xl border p-5"
                      style={{ background: 'rgba(0,0,0,0.24)', borderColor: 'var(--color-brand-border)' }}
                    >
                      <div className="font-mono text-[10px] tracking-[0.22em] mb-3" style={{ color: 'var(--color-brand-muted)' }}>
                        AI RATIONALE
                      </div>
                      <p className="text-sm leading-7" style={{ color: 'var(--color-brand-text)' }}>
                        {signal.Reason}
                      </p>
                    </section>
                  </div>

                  <div className="space-y-5">
                    <section
                      className="rounded-2xl border p-5"
                      style={{ background: 'rgba(0,0,0,0.24)', borderColor: 'var(--color-brand-border)' }}
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>
                            ENTRY
                          </div>
                          <div className="text-lg font-bold text-white">{formatLevel(signal.Entry)}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>
                            RISK / REWARD
                          </div>
                          <div className="text-lg font-bold text-white">{signal.RiskReward}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-bull)' }}>
                            TARGET
                          </div>
                          <div className="text-lg font-bold text-white">{formatLevel(signal.Target)}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-bear)' }}>
                            STOP LOSS
                          </div>
                          <div className="text-lg font-bold text-white">{formatLevel(signal.StopLoss)}</div>
                        </div>
                      </div>
                    </section>

                    <section
                      className="rounded-2xl border p-5"
                      style={{ background: 'rgba(0,0,0,0.24)', borderColor: 'var(--color-brand-border)' }}
                    >
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>
                            OI CHANGE
                          </div>
                          <div className="font-mono text-sm text-white">{signal.OI.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>
                            PCR
                          </div>
                          <div className="font-mono text-sm text-white">{signal.PCR}</div>
                        </div>
                        <div>
                          <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: 'var(--color-brand-muted)' }}>
                            WALLS
                          </div>
                          <div className="font-mono text-sm text-white">{signal.Walls}</div>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
