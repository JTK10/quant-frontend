'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RadarStock } from '../types/radar';

type SortKey = 'rankIndex' | 'asset' | 'break' | 'oi' | 'latest' | 'signal' | 'peak' | 'rank' | 'chart';
type SortDirection = 'asc' | 'desc';

interface RadarRow {
  stock: RadarStock;
  rankIndex: number;
  asset: string;
  breakType: string;
  oi: number;
  latest: number | null;
  signal: number;
  peak: number | null;
  rank: number | null;
  chart: string;
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

function pickNum(stock: RadarStock, keys: string[]): number | null {
  for (const key of keys) {
    const value = stock[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[%+,]/g, '').trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function scoreColor(v: number) {
  if (v >= 80) return 'var(--color-brand-bull)';
  if (v >= 55) return 'var(--color-brand-gold)';
  return 'var(--color-brand-bear)';
}

function fmt(value: number | null, digits = 1): string {
  return value === null ? '-' : value.toFixed(digits);
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
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
        0.0%
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
      {Math.abs(oi).toFixed(1)}%
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
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const rows = useMemo<RadarRow[]>(
    () =>
      data.map((stock, i) => ({
        stock,
        rankIndex: i + 1,
        asset: stock.Name ?? '-',
        breakType: pickText(stock, ['Break', 'BreakType']),
        oi: pickNum(stock, ['OI', 'OI %', 'OI_Change', 'pChangeInOpenInterest']) ?? 0,
        latest: pickNum(stock, ['Latest Score', 'Latest', 'Latest_Score']),
        signal: pickNum(stock, ['Signal_Generated_Score', 'Signal Generated Score']) ?? 0,
        peak: pickNum(stock, ['Peak_Score', 'Peak', 'Peak Score', 'Best_Score']),
        rank: pickNum(stock, ['SmartRank', 'Smart Rank']),
        chart: String(stock.Chart ?? ''),
      })),
    [data]
  );

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const factor = sortDirection === 'asc' ? 1 : -1;

      switch (sortKey) {
        case 'rankIndex':
          return factor * (a.rankIndex - b.rankIndex);
        case 'asset':
          return factor * a.asset.localeCompare(b.asset);
        case 'break':
          return factor * a.breakType.localeCompare(b.breakType);
        case 'oi':
          return factor * (a.oi - b.oi);
        case 'latest':
          return factor * compareNullableNumber(a.latest, b.latest);
        case 'signal':
          return factor * (a.signal - b.signal);
        case 'peak':
          return factor * compareNullableNumber(a.peak, b.peak);
        case 'rank':
          return factor * compareNullableNumber(a.rank, b.rank);
        case 'chart':
          return factor * a.chart.localeCompare(b.chart);
        default:
          return 0;
      }
    });

    return sorted.slice(0, 20);
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

    const textLike = key === 'asset' || key === 'break' || key === 'chart';
    setSortKey(key);
    setSortDirection(textLike ? 'asc' : 'desc');
  };

  const sortTag = (key: SortKey): string => {
    if (sortKey !== key) return 'SORT';
    return sortDirection === 'asc' ? 'ASC' : 'DESC';
  };

  return (
    <section className="space-y-5">
      <SectionDivider label={`Top 20 Rankings - Showing ${sortedRows.length} of ${data.length}`} />

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <div
          className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest"
          style={{
            gridTemplateColumns: '2.5rem minmax(12rem,2fr) 6.2rem 5.8rem 5.5rem 9rem 5.5rem 5.5rem 5rem',
            borderColor: 'var(--color-brand-border)',
            background: 'rgba(0,0,0,0.2)',
            color: 'var(--color-brand-muted)',
          }}
        >
          {[
            { key: 'rankIndex' as const, label: '#' },
            { key: 'asset' as const, label: 'ASSET' },
            { key: 'break' as const, label: 'BREAK' },
            { key: 'oi' as const, label: 'OI' },
            { key: 'latest' as const, label: 'LATEST' },
            { key: 'signal' as const, label: 'SIGNAL' },
            { key: 'peak' as const, label: 'PEAK' },
            { key: 'rank' as const, label: 'RANK' },
            { key: 'chart' as const, label: 'CHART' },
          ].map((col) => (
            <button
              key={col.key}
              type="button"
              onClick={() => setSort(col.key)}
              className="text-left font-mono text-[9px] tracking-widest hover:text-[var(--color-brand-text)] transition-colors"
              style={{ color: 'inherit' }}
            >
              {col.label} {sortTag(col.key)}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: '700px' }}>
          {sortedRows.map((row, i) => {
            const signalBar = Math.min(Math.max(row.signal, 0), 100);
            const signalColor = scoreColor(signalBar);

            return (
              <div
                key={`${row.asset}-${i}`}
                className="grid gap-3 px-5 py-3 border-b items-center hover:bg-white/[0.02] transition-colors"
                style={{
                  gridTemplateColumns: '2.5rem minmax(12rem,2fr) 6.2rem 5.8rem 5.5rem 9rem 5.5rem 5.5rem 5rem',
                  borderColor: 'rgba(26,40,64,0.6)',
                }}
              >
                <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                  #{i + 1}
                </div>

                <div className="min-w-0">
                  <div
                    className="font-semibold text-sm leading-tight truncate"
                    style={{ color: 'var(--color-brand-text)' }}
                    title={row.asset}
                  >
                    {row.asset}
                  </div>
                </div>

                <div>
                  {row.breakType === '-' ? (
                    <span className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                      -
                    </span>
                  ) : (
                    <span
                      className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--color-brand-accentbg)', color: 'var(--color-brand-accent)' }}
                    >
                      {row.breakType}
                    </span>
                  )}
                </div>

                <div>
                  <OiBadge oi={row.oi} />
                </div>

                <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                  {fmt(row.latest)}
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-brand-border)' }}>
                    <div className="h-full rounded-full" style={{ width: `${signalBar}%`, background: signalColor }} />
                  </div>
                  <span className="font-mono text-[10px] w-8 text-right" style={{ color: signalColor }}>
                    {signalBar.toFixed(0)}
                  </span>
                </div>

                <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                  {fmt(row.peak)}
                </div>

                <div className="font-mono text-sm tabular-nums" style={{ color: 'var(--color-brand-text)' }}>
                  {fmt(row.rank)}
                </div>

                <Link
                  href={row.stock.Chart}
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
