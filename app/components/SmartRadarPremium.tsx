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

/* Medal colour for top-3 */
const MEDAL = [
  { bg: 'linear-gradient(135deg,#f0a500,#c97d00)', text: '#000', label: '1ST' },
  { bg: 'linear-gradient(135deg,#b0bec5,#78909c)', text: '#000', label: '2ND' },
  { bg: 'linear-gradient(135deg,#bf7a3e,#8d5524)', text: '#fff', label: '3RD' },
];

function scoreColor(v: number) {
  if (v >= 80) return 'var(--color-brand-bull)';
  if (v >= 55) return 'var(--color-brand-gold)';
  return 'var(--color-brand-bear)';
}

function OiBadge({ oi }: { oi: number }) {
  const bull = oi >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded"
      style={{
        color:      bull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)',
        background: bull ? 'var(--color-brand-bullbg)' : 'var(--color-brand-bearbg)',
      }}
    >
      {bull ? '▲' : '▼'} {Math.abs(oi).toFixed(1)}%
    </span>
  );
}

function ConfBar({ value }: { value: number }) {
  const pct  = Math.min(Math.max(value, 0), 100);
  const col  = scoreColor(pct);
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
        <span>CONFIDENCE</span>
        <span style={{ color: col }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-brand-border)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg,${col}99,${col})` }}
        />
      </div>
    </div>
  );
}

export default function SmartRadarPremium({ data }: { data: RadarStock[] }) {
  const topFive = data.slice(0, 5);
  const rest    = data.slice(5);

  if (!data.length) {
    return (
      <div className="rounded-xl border p-12 text-center"
        style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>
        <div className="font-mono text-xs tracking-widest" style={{ color:'var(--color-brand-muted)' }}>
          NO RADAR SIGNALS FOR SELECTED DATE
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">

      {/* ─── AI CHAMPIONS ─────────────────────────────────── */}
      <section>
        <SectionDivider label="AI Champions" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
          {topFive.map((stock, i) => {
            const peakScore  = toNum(stock.Peak_Score);
            const smartRank  = toNum(stock.SmartRank);
            const oi         = toNum(stock.OI ?? stock['OI %']);
            const sigScore   = toNum(stock.Signal_Generated_Score);
            const medal      = MEDAL[i];
            const breakType  = typeof stock.Break === 'string' ? stock.Break : '';

            return (
              <div
                key={stock.Name}
                className="relative rounded-xl border overflow-hidden group"
                style={{
                  background:   'var(--color-brand-surface)',
                  borderColor:  'var(--color-brand-border)',
                  transition:   'border-color 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'rgba(79,142,247,0.35)';
                  (e.currentTarget as HTMLElement).style.boxShadow   = '0 0 32px rgba(79,142,247,0.08)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-brand-border)';
                  (e.currentTarget as HTMLElement).style.boxShadow   = 'none';
                }}
              >
                {/* Gradient glow top line */}
                <div className="absolute top-0 inset-x-0 h-px"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(79,142,247,0.5),transparent)' }} />

                {/* Rank badge */}
                {medal && (
                  <div
                    className="absolute top-3.5 right-3.5 font-mono text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{ background: medal.bg, color: medal.text, letterSpacing: '0.1em' }}
                  >
                    {medal.label}
                  </div>
                )}
                {!medal && (
                  <div className="absolute top-3.5 right-3.5 font-mono text-[10px] px-2 py-0.5 rounded"
                    style={{ background:'var(--color-brand-border)', color:'var(--color-brand-muted)' }}>
                    #{i + 1}
                  </div>
                )}

                <div className="p-5">
                  {/* Stock name + break type */}
                  <div className="mb-4 pr-12">
                    <div className="text-lg font-bold text-white tracking-wide leading-none">{stock.Name}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      {breakType && (
                        <span className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                          style={{ background:'var(--color-brand-accentbg)', color:'var(--color-brand-accent)' }}>
                          {breakType}
                        </span>
                      )}
                      <OiBadge oi={oi} />
                    </div>
                  </div>

                  {/* Score row */}
                  <div className="flex items-end gap-4 mb-5">
                    <div>
                      <div className="font-mono text-[9px] tracking-widest mb-0.5" style={{ color:'var(--color-brand-muted)' }}>PEAK SCORE</div>
                      <div className="text-3xl font-bold tabular-nums"
                        style={{ color: scoreColor(sigScore), fontVariantNumeric:'tabular-nums' }}>
                        {peakScore.toFixed(1)}
                      </div>
                    </div>
                    <div className="border-l pl-4 pb-1" style={{ borderColor:'var(--color-brand-border)' }}>
                      <div className="font-mono text-[9px] tracking-widest mb-0.5" style={{ color:'var(--color-brand-muted)' }}>SMART RANK</div>
                      <div className="text-xl font-mono" style={{ color:'var(--color-brand-text)' }}>
                        #{smartRank.toFixed(0)}
                      </div>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div className="mb-5">
                    <ConfBar value={sigScore} />
                  </div>

                  {/* Chart link */}
                  <Link href={stock.Chart} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider transition-colors"
                    style={{ color:'var(--color-brand-accent)' }}>
                    VIEW CHART <span>→</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FULL RANKINGS ─────────────────────────────────── */}
      {rest.length > 0 && (
        <section>
          <SectionDivider label={`Full Rankings · ${rest.length} more`} />
          <div className="mt-5 rounded-xl border overflow-hidden"
            style={{ background:'var(--color-brand-surface)', borderColor:'var(--color-brand-border)' }}>

            {/* Table head */}
            <div className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest"
              style={{
                gridTemplateColumns: '2.5rem 1fr 5rem 5rem 9rem 5.5rem',
                borderColor:'var(--color-brand-border)',
                background:'rgba(0,0,0,0.2)',
                color:'var(--color-brand-muted)',
              }}>
              {['#','ASSET','PEAK','RANK','SIGNAL','CHART'].map(h => <div key={h}>{h}</div>)}
            </div>

            <div className="overflow-y-auto" style={{ maxHeight:'460px' }}>
              {rest.map((stock, i) => {
                const peakScore = toNum(stock.Peak_Score);
                const smartRank = toNum(stock.SmartRank);
                const sigScore  = toNum(stock.Signal_Generated_Score);
                const oi        = toNum(stock.OI ?? stock['OI %']);
                const col       = scoreColor(sigScore);
                return (
                  <div
                    key={stock.Name}
                    className="grid gap-3 px-5 py-3 border-b items-center group cursor-default"
                    style={{
                      gridTemplateColumns:'2.5rem 1fr 5rem 5rem 9rem 5.5rem',
                      borderColor:'rgba(26,40,64,0.6)',
                      transition:'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <div className="font-mono text-[10px]" style={{ color:'var(--color-brand-muted)' }}>#{i + 6}</div>
                    <div>
                      <div className="font-semibold text-sm" style={{ color:'var(--color-brand-text)' }}>{stock.Name}</div>
                      {oi !== 0 && (
                        <div className="font-mono text-[10px]" style={{ color: oi > 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}>
                          {oi > 0 ? '+' : ''}{oi.toFixed(1)}% OI
                        </div>
                      )}
                    </div>
                    <div className="font-mono text-sm tabular-nums" style={{ color:'var(--color-brand-text)' }}>{peakScore.toFixed(1)}</div>
                    <div className="font-mono text-sm tabular-nums" style={{ color:'var(--color-brand-muted)' }}>{smartRank.toFixed(0)}</div>
                    {/* Conf bar */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background:'var(--color-brand-border)' }}>
                        <div className="h-full rounded-full" style={{ width:`${Math.min(sigScore,100)}%`, background:col }} />
                      </div>
                      <span className="font-mono text-[10px] w-8 text-right" style={{ color: col }}>{sigScore.toFixed(0)}</span>
                    </div>
                    <Link href={stock.Chart} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[10px] tracking-wider transition-colors"
                      style={{ color:'var(--color-brand-accent)' }}>
                      CHART →
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background:'var(--color-brand-border)' }} />
      <span className="font-mono text-[10px] tracking-[0.25em] uppercase px-1"
        style={{ color:'var(--color-brand-muted)' }}>{label}</span>
      <div className="flex-1 h-px" style={{ background:'var(--color-brand-border)' }} />
    </div>
  );
}
