'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RadarStock } from '../types/radar';
import {
  formatModuleLabel,
  parseSignalTime,
  resolveSignalSide,
  toBoolean,
  toNumber,
  toText,
} from '../utils/scanner';

type SortKey = 'rank' | 'asset' | 'module' | 'side' | 'time' | 'entry' | 'target' | 'rr' | 'conf' | 'pcr';
type SortDirection = 'asc' | 'desc';

interface ScannerRow {
  stock: RadarStock;
  rank: number;
  asset: string;
  module: string;
  side: string;
  time: string;
  entry: number;
  target: number;
  rr: string;
  rrValue: number;
  confidence: number;
  pcr: number;
  sector: string;
  breakType: string;
  theme: boolean;
  chart: string;
}

function parseRiskReward(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return 0;

  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator === 0) return 0;
  return denominator / numerator;
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
        const rr = toText(stock.RiskReward, '-');
        const rankValue = toNumber(stock.SignalRank ?? stock.SmartRank);

        return {
          stock,
          rank: rankValue || data.length - index,
          asset,
          module: formatModuleLabel(stock.Module),
          side: resolveSignalSide(stock),
          time: toText(stock.Time ?? stock.Fired_At, '-'),
          entry: toNumber(stock.Entry ?? stock['Current Price'] ?? stock.Price),
          target: toNumber(stock.Target1 ?? stock.Target),
          rr,
          rrValue: parseRiskReward(rr),
          confidence: toNumber(stock.Confidence ?? stock.Signal_Generated_Score),
          pcr: toNumber(stock.PCR),
          sector: toText(stock.Sector, 'OTHER'),
          breakType: toText(stock.Break ?? stock.BreakType, 'INSIDE'),
          theme: toBoolean(stock.Sector_Theme),
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
        case 'module':
          return factor * a.module.localeCompare(b.module);
        case 'side':
          return factor * a.side.localeCompare(b.side);
        case 'time':
          return factor * (parseSignalTime(a.time) - parseSignalTime(b.time));
        case 'entry':
          return factor * (a.entry - b.entry);
        case 'target':
          return factor * (a.target - b.target);
        case 'rr':
          return factor * (a.rrValue - b.rrValue);
        case 'conf':
          return factor * (a.confidence - b.confidence);
        case 'pcr':
          return factor * (a.pcr - b.pcr);
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

    const textLike = key === 'asset' || key === 'module' || key === 'side';
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
            className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest min-w-[1024px]"
            style={{
              gridTemplateColumns: '3rem minmax(15rem,2.4fr) 6rem 5.5rem 5rem 6.5rem 6.5rem 5rem 8rem 5rem 4.5rem',
              borderColor: 'var(--color-brand-border)',
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--color-brand-muted)',
            }}
          >
            {[
              { key: 'rank' as const, label: '#' },
              { key: 'asset' as const, label: 'ASSET' },
              { key: 'module' as const, label: 'MODULE' },
              { key: 'side' as const, label: 'SIDE' },
              { key: 'time' as const, label: 'TIME' },
              { key: 'entry' as const, label: 'ENTRY' },
              { key: 'target' as const, label: 'TARGET' },
              { key: 'rr' as const, label: 'R:R' },
              { key: 'conf' as const, label: 'CONF' },
              { key: 'pcr' as const, label: 'PCR' },
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
            <span>CHART</span>
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
                  key={`${row.asset}-${row.time}-${index}`}
                  className="grid gap-3 px-5 py-3 border-b items-center min-w-[1024px] hover:bg-white/[0.02] transition-colors"
                  style={{
                    gridTemplateColumns: '3rem minmax(15rem,2.4fr) 6rem 5.5rem 5rem 6.5rem 6.5rem 5rem 8rem 5rem 4.5rem',
                    borderColor: 'rgba(26,40,64,0.6)',
                  }}
                >
                  <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                    #{index + 1}
                  </div>

                  <div className="min-w-0">
                    <div
                      className="font-semibold text-sm leading-tight truncate"
                      style={{ color: 'var(--color-brand-text)' }}
                      title={row.asset}
                    >
                      {row.asset}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span
                        className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: 'var(--color-brand-accentbg)', color: 'var(--color-brand-accent)' }}
                      >
                        {row.breakType}
                      </span>
                      <span className="font-mono text-[9px]" style={{ color: 'var(--color-brand-muted)' }}>
                        {row.sector}
                      </span>
                      {row.theme && (
                        <span
                          className="font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(214,153,26,0.14)', color: 'var(--color-brand-gold)' }}
                        >
                          THEME
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-text)' }}>
                    {row.module}
                  </div>

                  <div>
                    <span
                      className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                      style={{ color: sideColor, background: sideBg }}
                    >
                      {sideBull ? 'BULL' : 'BEAR'}
                    </span>
                  </div>

                  <div className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--color-brand-muted)' }}>
                    {row.time}
                  </div>

                  <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.entry ? `INR ${row.entry.toFixed(2)}` : '-'}
                  </div>

                  <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.target ? `INR ${row.target.toFixed(2)}` : '-'}
                  </div>

                  <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                    {row.rr}
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
                    {row.pcr ? row.pcr.toFixed(2) : '-'}
                  </div>

                  <div>
                    {row.chart ? (
                      <Link
                        href={row.chart}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[10px] tracking-wider transition-colors hover:opacity-90"
                        style={{ color: 'var(--color-brand-accent)' }}
                      >
                        CHART
                      </Link>
                    ) : (
                      <span className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                        -
                      </span>
                    )}
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
