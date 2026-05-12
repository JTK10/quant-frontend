'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type VelocityStock = {
  Name: string;
  ModuleLabel: string;
  Time: string;
  Confidence: number;
  RVOL: number;
  FlowNow: number;
  FlowOpen: number;
  ATM_Strike: string;
  Chart: string;
  Side: 'BULLISH' | 'BEARISH';
};

type SortKey = 'conf' | 'asset' | 'side' | 'module' | 'time' | 'rvol' | 'flowNow' | 'flowOpen' | 'atm';
type SortDirection = 'asc' | 'desc';

interface ScannerRow {
  stock: VelocityStock;
  rank: number;
  asset: string;
  side: string;
  module: string;
  time: string;
  confidence: number;
  rvol: number;
  flowNow: number;
  flowOpen: number;
  atmStrike: string;
  chart: string;
}

function confidenceColor(value: number) {
  if (value >= 80) return 'var(--color-brand-bull)';
  if (value >= 65) return 'var(--color-brand-gold)';
  return 'var(--color-brand-bear)';
}

function confidenceBg(value: number) {
  if (value >= 80) return 'rgba(5,217,143,0.14)';
  if (value >= 65) return 'rgba(214,153,26,0.14)';
  return 'rgba(230,85,115,0.14)';
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

export default function RvolPulseScanner({ data }: { data: VelocityStock[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('conf');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const rows = useMemo<ScannerRow[]>(
    () =>
      data.map((stock, index) => ({
        stock,
        rank: data.length - index,
        asset: stock.Name || 'UNKNOWN',
        side: stock.Side,
        module: stock.ModuleLabel,
        time: stock.Time || '-',
        confidence: stock.Confidence,
        rvol: stock.RVOL,
        flowNow: stock.FlowNow,
        flowOpen: stock.FlowOpen,
        atmStrike: stock.ATM_Strike || '-',
        chart: stock.Chart,
      })),
    [data]
  );

  const sortedRows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1;

    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'asset':
          return factor * a.asset.localeCompare(b.asset);
        case 'side':
          return factor * a.side.localeCompare(b.side);
        case 'module':
          return factor * a.module.localeCompare(b.module);
        case 'time':
          return factor * a.time.localeCompare(b.time);
        case 'conf':
          return factor * (a.confidence - b.confidence);
        case 'rvol':
          return factor * (a.rvol - b.rvol);
        case 'flowNow':
          return factor * (a.flowNow - b.flowNow);
        case 'flowOpen':
          return factor * (a.flowOpen - b.flowOpen);
        case 'atm':
          return factor * a.atmStrike.localeCompare(b.atmStrike);
        default:
          return factor * (a.confidence - b.confidence);
      }
    });
  }, [rows, sortDirection, sortKey]);

  if (!data.length) {
    return (
      <div
        className="rounded-xl border p-12 text-center"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
          NO SIGNALS FOR SELECTED DATE
        </div>
      </div>
    );
  }

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }

    const textLike =
      key === 'asset' || key === 'side' || key === 'module' || key === 'time' || key === 'atm';
    setSortKey(key);
    setSortDirection(textLike ? 'asc' : 'desc');
  };

  const sortTag = (key: SortKey) => {
    if (sortKey !== key) return 'SORT';
    return sortDirection === 'asc' ? 'ASC' : 'DESC';
  };

  return (
    <section className="space-y-5">
      <SectionDivider label={`Signal Tape — ${sortedRows.length} signals`} />

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div className="overflow-x-auto">
          <div
            className="grid gap-2 px-4 py-2 border-b font-mono text-[8px] tracking-[0.18em] min-w-[1000px]"
            style={{
              gridTemplateColumns: '4.5rem minmax(10.5rem,1.8fr) 5.5rem 5.5rem 4.75rem 5rem 4.75rem 5.25rem 5.25rem 6rem',
              borderColor: 'var(--color-brand-border)',
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--color-brand-muted)',
            }}
          >
            <span>TRADINGVIEW</span>
            {[
              { key: 'asset' as const, label: 'ASSET' },
              { key: 'side' as const, label: 'DIRECTION' },
              { key: 'module' as const, label: 'MODULE' },
              { key: 'time' as const, label: 'TIME' },
              { key: 'conf' as const, label: 'CONFIDENCE' },
              { key: 'rvol' as const, label: 'RVOL' },
              { key: 'flowNow' as const, label: 'LIVE FLOW' },
              { key: 'flowOpen' as const, label: 'OPEN FLOW' },
              { key: 'atm' as const, label: 'ATM STRIKE' },
            ].map((col, index) => (
              <button
                key={`${col.label}-${index}`}
                type="button"
                onClick={() => setSort(col.key)}
                className="text-left font-mono text-[9px] tracking-widest hover:text-[var(--color-brand-text)] transition-colors"
                style={{ color: 'inherit' }}
              >
                {col.label} {sortTag(col.key)}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '720px' }}>
            {sortedRows.map((row, index) => {
              const sideBull = row.side === 'BULLISH';
              const sideColor = sideBull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
              const sideBg = sideBull ? 'var(--color-brand-bullbg)' : 'var(--color-brand-bearbg)';
              const confidence = Math.min(Math.max(row.confidence, 0), 100);
              const confColor = confidenceColor(confidence);

              return (
                <div
                  key={`${row.asset}-${index}`}
                  className="grid gap-2 px-4 py-2.5 border-b items-center min-w-[1000px] hover:bg-white/[0.02] transition-colors"
                  style={{
                    gridTemplateColumns: '4.5rem minmax(10.5rem,1.8fr) 5.5rem 5.5rem 4.75rem 5rem 4.75rem 5.25rem 5.25rem 6rem',
                    borderColor: 'rgba(26,40,64,0.6)',
                  }}
                >
                  <div>
                    {row.chart ? (
                      <Link
                        href={row.chart}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 font-mono text-[9px] tracking-wider transition-colors hover:opacity-90"
                        style={{
                          color: 'var(--color-brand-accent)',
                          borderColor: 'rgba(60,130,246,0.28)',
                          background: 'rgba(60,130,246,0.08)',
                        }}
                      >
                        TV
                      </Link>
                    ) : (
                      <span className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                        -
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div
                      className="font-semibold text-[13px] leading-tight truncate"
                      style={{ color: 'var(--color-brand-text)' }}
                      title={row.asset}
                    >
                      {row.asset}
                    </div>
                    <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--color-brand-muted)' }}>
                      #{index + 1}
                    </div>
                  </div>

                  <div>
                    <span
                      className="font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded"
                      style={{ color: sideColor, background: sideBg }}
                    >
                      {sideBull ? 'BULL' : 'BEAR'}
                    </span>
                  </div>

                  <div className="font-mono text-[9px]" style={{ color: 'var(--color-brand-text)' }}>
                    {row.module}
                  </div>

                  <div className="font-mono text-[9px] tabular-nums" style={{ color: 'var(--color-brand-muted)' }}>
                    {row.time}
                  </div>

                  <div>
                    <span
                      className="inline-flex min-w-[42px] items-center justify-center rounded-full px-2 py-0.5 font-mono text-[9px]"
                      style={{ color: confColor, background: confidenceBg(confidence) }}
                    >
                      {confidence.toFixed(0)}
                    </span>
                  </div>

                  <div className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.rvol ? `${row.rvol.toFixed(1)}x` : '-'}
                  </div>

                  <div className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.flowNow ? row.flowNow.toFixed(2) : '-'}
                  </div>

                  <div className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.flowOpen ? row.flowOpen.toFixed(2) : '-'}
                  </div>

                  <div className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.atmStrike || '-'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
