'use client';

import { useEffect, useMemo, useState } from 'react';

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

function formatRunTime(date: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
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

export default function AITopPicksDashboard({ dateStr }: { dateStr: string }) {
  const [picks, setPicks] = useState<AiSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState('');

  useEffect(() => {
    setPicks([]);
    setLoading(false);
    setHasRun(false);
    setError('');
    setLastRun('');
  }, [dateStr]);

  async function fetchAIPicks() {
    try {
      setLoading(true);
      setHasRun(true);
      setError('');

      const response = await fetch(`/api/ai?date=${encodeURIComponent(dateStr)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const data = await response.json();
      const rows = Array.isArray(data) ? data : [];
      setPicks(rows.slice(0, 5));
      setLastRun(formatRunTime(new Date()));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setPicks([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const avgConfidence = average(picks.map((signal) => signal.Confidence));
    const avgLiveMove = average(picks.map((signal) => Math.abs(signal.LiveMove)));
    const highConviction = picks.filter((signal) => signal.Confidence >= 80).length;

    return {
      avgConfidence,
      avgLiveMove,
      highConviction,
    };
  }, [picks]);

  return (
    <div className="space-y-8">
      <section
        className="rounded-2xl border p-6"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: 'var(--color-brand-muted)' }}>
              ON-DEMAND AI ANALYSIS
            </div>
            <p className="text-sm mt-3 max-w-2xl" style={{ color: 'var(--color-brand-muted)' }}>
              AI stays idle until you run it. Click once to fetch the current Top 5 picks for {dateStr} from the existing
              `ai-signals` backend route.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              onClick={fetchAIPicks}
              disabled={loading}
              className="px-5 py-3 rounded-xl border font-mono text-xs tracking-[0.22em] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: loading ? 'rgba(60,130,246,0.1)' : 'var(--color-brand-accentbg)',
                borderColor: 'var(--color-brand-border)',
                color: loading ? 'var(--color-brand-accent)' : 'var(--color-brand-text)',
              }}
            >
              {loading ? 'SCANNING MARKET...' : hasRun ? 'RUN AGAIN' : 'RUN AI ANALYSIS'}
            </button>
            <div className="font-mono text-[10px] tracking-[0.18em]" style={{ color: 'var(--color-brand-muted)' }}>
              {lastRun ? `LAST RUN ${lastRun} IST` : 'NOT RUN YET'}
            </div>
          </div>
        </div>
      </section>

      {!hasRun && (
        <div
          className="rounded-xl border p-12 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            CLICK RUN AI ANALYSIS TO LOAD TOP PICKS
          </p>
        </div>
      )}

      {loading && (
        <div
          className="rounded-xl border p-12 text-center fade-up"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-[0.24em]" style={{ color: 'var(--color-brand-accent)' }}>
            SCANNING MARKET WITH AI...
          </p>
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-xl border p-10 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-[0.2em]" style={{ color: 'var(--color-brand-bear)' }}>
            AI FETCH FAILED: {error}
          </p>
        </div>
      )}

      {!loading && hasRun && !error && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MetricCard label="TOP PICKS" value={String(picks.length)} accent="var(--color-brand-text)" />
            <MetricCard label="HIGH CONVICTION" value={String(stats.highConviction)} accent="var(--color-brand-bull)" />
            <MetricCard label="AVG PROBABILITY" value={`${stats.avgConfidence.toFixed(1)}%`} accent="var(--color-brand-accent)" />
            <MetricCard label="AVG LIVE MOVE" value={`${stats.avgLiveMove.toFixed(2)}%`} accent="var(--color-brand-gold)" />
          </div>

          {picks.length === 0 && (
            <div
              className="rounded-xl border p-12 text-center"
              style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
            >
              <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
                NO AI TOP PICKS RETURNED FOR {dateStr}
              </p>
            </div>
          )}

          <div className="grid xl:grid-cols-2 gap-5">
            {picks.map((signal, index) => {
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
        </>
      )}
    </div>
  );
}
