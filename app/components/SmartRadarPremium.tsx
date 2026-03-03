'use client';

import Link from 'next/link';
import type { RadarStock } from '../types/radar';

function toNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[%+,]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickText(stock: RadarStock, keys: string[]): string {
  for (const key of keys) {
    const value = stock[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  }
  return '-';
}

function scoreColor(v: number) {
  if (v >= 80) return 'var(--color-brand-bull)';
  if (v >= 55) return 'var(--color-brand-gold)';
  return 'var(--color-brand-bear)';
}

function OiBadge({ oi }: { oi: number }) {
  if (oi === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded"
        style={{
          color: 'var(--color-brand-muted)',
          background: 'var(--color-brand-border)',
        }}
      >
        OI 0.0%
      </span>
    );
  }

  const bull = oi > 0;
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{
        color: bull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)',
        background: bull ? 'var(--color-brand-bullbg)' : 'var(--color-brand-bearbg)',
      }}
    >
      {bull ? '+' : '-'}
      {Math.abs(oi).toFixed(1)}% OI
    </span>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: 'var(--color-brand-border)' }} />
      <span
        className="font-mono text-[10px] tracking-[0.25em] uppercase px-1"
        style={{ color: 'var(--color-brand-muted)' }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-brand-border)' }} />
    </div>
  );
}

export default function SmartRadarPremium({ data }: { data: RadarStock[] }) {
  if (!data.length) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
          NO RADAR SIGNALS FOR SELECTED DATE
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <SectionDivider label={`Full Rankings - ${data.length}`} />

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div
          className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest"
          style={{
            gridTemplateColumns: '2.5rem 1.2fr 5rem 5rem 9rem 7rem 6.5rem 8.5rem 5.5rem',
            borderColor: 'var(--color-brand-border)',
            background: 'rgba(0,0,0,0.2)',
            color: 'var(--color-brand-muted)',
          }}
        >
          {['#', 'ASSET', 'PEAK', 'RANK', 'SIGNAL', 'LOCK', 'LOCK TIME', 'TIMING', 'CHART'].map((h) => (
            <div key={h}>{h}</div>
          ))}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '700px' }}>
          {data.map((stock, i) => {
            const peakScore = toNum(stock.Peak_Score);
            const smartRank = toNum(stock.SmartRank);
            const sigScore = toNum(stock.Signal_Generated_Score);
            const oi = toNum(stock.OI ?? stock['OI %']);
            const lockState = pickText(stock, ['Locked', 'Lock', 'IsLocked']);
            const lockTime = pickText(stock, ['Lock Time', 'Lock_Time', 'LockTime']);
            const entryTime = pickText(stock, ['Entry Time', 'Entry_Time', 'entryTime', 'Signal_Generated_At', 'Time']);
            const reentry = pickText(stock, ['Reentry', 'Reentry Time', 'Reentry_Time', 'reentryTime', 'ReentryTime']);
            const breakType = pickText(stock, ['Break', 'BreakType']);
            const signalBar = Math.min(Math.max(sigScore, 0), 100);
            const signalColor = scoreColor(signalBar);

            return (
              <div
                key={`${stock.Name}-${i}`}
                className="grid gap-3 px-5 py-3 border-b items-center hover:bg-white/[0.02] transition-colors"
                style={{
                  gridTemplateColumns: '2.5rem 1.2fr 5rem 5rem 9rem 7rem 6.5rem 8.5rem 5.5rem',
                  borderColor: 'rgba(26,40,64,0.6)',
                }}
              >
                <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                  #{i + 1}
                </div>

                <div>
                  <div className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-brand-text)' }}>
                    {stock.Name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {breakType !== '-' && (
                      <span
                        className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--color-brand-accentbg)', color: 'var(--color-brand-accent)' }}
                      >
                        {breakType}
                      </span>
                    )}
                    <OiBadge oi={oi} />
                  </div>
                </div>

                <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                  {peakScore.toFixed(1)}
                </div>

                <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                  {smartRank.toFixed(1)}
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-brand-border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${signalBar}%`, background: signalColor }} />
                  </div>
                  <span className="font-mono text-[10px] w-8 text-right" style={{ color: signalColor }}>
                    {signalBar.toFixed(0)}
                  </span>
                </div>

                <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-text)' }}>
                  {lockState}
                </div>

                <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-text)' }}>
                  {lockTime}
                </div>

                <div className="font-mono text-[10px] leading-4" style={{ color: 'var(--color-brand-muted)' }}>
                  <div>E: {entryTime}</div>
                  <div>R: {reentry}</div>
                </div>

                <Link
                  href={stock.Chart}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] tracking-wider transition-colors hover:opacity-90"
                  style={{ color: 'var(--color-brand-accent)' }}
                >
                  CHART
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
