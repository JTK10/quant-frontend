'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RadarStock } from '../types/radar';
import {
  formatModuleLabel,
  resolveSignalSide,
  toNumber,
  toText,
} from '../utils/scanner';

type SortKey = 'rank' | 'asset' | 'side' | 'module' | 'time' | 'conf' | 'rvol' | 'pcr' | 'atm';
type SortDirection = 'asc' | 'desc';

interface ScannerRow {
  stock: RadarStock;
  rank: number;
  asset: string;
  side: string;
  module: string;
  time: string;
  confidence: number;
  rvol: number;
  pcr: number;
  atmStrike: string;
  chart: string;
}

function confidenceColor(value: number) {
  if (value >= 80) return 'var(--color-brand-bull)';
  if (value >= 65) return 'var(--color-brand-gold)';
  return 'var(--color-brand-bear)';
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
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const rows = useMemo<ScannerRow[]>(
    () =>
      data.map((stock, index) => {
        const asset = toText(stock.Name) || 'UNKNOWN';
        const rankValue = toNumber(stock.SignalRank ?? stock.SmartRank);

        return {
          stock,
          rank: rankValue || data.length - index,
          asset,
          side: resolveSignalSide(stock),
          module: formatModuleLabel(stock.Module),
          time: toText(stock.Time ?? stock.Fired_At, '-'),
          confidence: toNumber(stock.Confidence ?? stock.Signal_Generated_Score),
          rvol: toNumber(stock.RVOL),
          pcr: toNumber(stock.PCR),
          atmStrike: toText(stock.ATM_Strike, '-'),
          chart: toText(stock.Chart),
        };
      }),
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
        case 'pcr':
          return factor * (a.pcr - b.pcr);
        case 'atm':
          return factor * a.atmStrike.localeCompare(b.atmStrike);
        case 'rank':
        default:
          return factor * (a.rank - b.rank);
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
          NO RADAR SIGNALS FOR SELECTED DATE
        </div>
      </div>
    );
  }

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }

    const textLike = key === 'asset' || key === 'side' || key === 'module' || key === 'time' || key === 'atm';
    setSortKey(key);
    setSortDirection(textLike ? 'asc' : 'desc');
  };

  const sortTag = (key: SortKey) => {
    if (sortKey !== key) return 'SORT';
    return sortDirection === 'asc' ? 'ASC' : 'DESC';
  };

  return (
    <section className="space-y-5">
      <SectionDivider label={`Signal Tape - ${sortedRows.length} signals`} />

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div className="overflow-x-auto">
          <div
            className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest min-w-[1040px]"
            style={{
              gridTemplateColumns: '5.5rem minmax(14rem,2.1fr) 7rem 7rem 6rem 7rem 6rem 6.5rem 7rem',
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
              { key: 'pcr' as const, label: 'PCR LIVE' },
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
                  className="grid gap-3 px-5 py-3 border-b items-center min-w-[1040px] hover:bg-white/[0.02] transition-colors"
                  style={{
                    gridTemplateColumns: '5.5rem minmax(14rem,2.1fr) 7rem 7rem 6rem 7rem 6rem 6.5rem 7rem',
                    borderColor: 'rgba(26,40,64,0.6)',
                  }}
                >
                  <div>
                    {row.chart ? (
                      <Link
                        href={row.chart}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-full border px-3 py-1 font-mono text-[10px] tracking-wider transition-colors hover:opacity-90"
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
                      className="font-semibold text-sm leading-tight truncate"
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
                      className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                      style={{ color: sideColor, background: sideBg }}
                    >
                      {sideBull ? 'BULL' : 'BEAR'}
                    </span>
                  </div>

                  <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-text)' }}>
                    {row.module}
                  </div>

                  <div className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--color-brand-muted)' }}>
                    {row.time}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-brand-border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${confidence}%`, background: confColor }} />
                    </div>
                    <span className="font-mono text-[10px] w-9 text-right" style={{ color: confColor }}>
                      {confidence.toFixed(0)}
                    </span>
                  </div>

                  <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.rvol ? `${row.rvol.toFixed(1)}x` : '-'}
                  </div>

                  <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.pcr ? row.pcr.toFixed(2) : '-'}
                  </div>

                  <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
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
