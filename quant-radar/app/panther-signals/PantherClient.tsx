'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { PantherRow } from '@/utils/backend';

type SortKey = 'name' | 'side' | 'k_level' | 'entry' | 'surge' | 'win60s_cr' | 'spread_bps' | 'spread_vs_norm' | 'time';

function fmtPrice(v: number) {
  if (!v) return '—';
  return `₹${v.toFixed(2)}`;
}

function KLevelBadge({ k_level }: { k_level: string }) {
  const upper = (k_level || '').toUpperCase();
  if (upper.includes('K6')) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{ color: 'var(--color-gold)', background: 'var(--color-goldbg)', border: '1px solid var(--color-goldborder)' }}>
        🔥 K6
      </span>
    );
  }
  if (upper.includes('K5')) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{ color: '#00e89a', background: 'rgba(0, 232, 154, 0.1)', border: '1px solid rgba(0, 232, 154, 0.2)' }}>
        ⚡ K5
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{ color: '#2d8eff', background: 'rgba(45,142,255,0.1)', border: '1px solid rgba(45,142,255,0.2)' }}>
      {upper || 'K3'}
    </span>
  );
}

function SideBadge({ direction }: { direction: string }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string; Icon: any }> = {
    LONG: { label: 'LONG', color: 'var(--color-bull)', bg: 'var(--color-bullbg)', border: 'var(--color-bullborder)', Icon: TrendingUp },
    SHORT: { label: 'SHORT', color: 'var(--color-bear)', bg: 'var(--color-bearbg)', border: 'var(--color-bearborder)', Icon: TrendingDown },
  };
  const { label, color, bg, border, Icon } = map[direction] ?? { label: 'NEUT', color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.04)', border: 'var(--color-border)', Icon: Minus };
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      <Icon size={9} />
      {label}
    </span>
  );
}

function getKLevelRank(k: string): number {
  const upper = (k || '').toUpperCase();
  if (upper.includes('K6')) return 3;
  if (upper.includes('K5')) return 2;
  return 1;
}

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'name', label: 'STOCK', width: '150px' },
  { key: 'side', label: 'DIR', width: '80px' },
  { key: 'k_level', label: 'LEVEL', width: '90px' },
  { key: 'entry', label: 'ENTRY', width: '90px' },
  { key: 'surge', label: 'SURGE', width: '90px' },
  { key: 'win60s_cr', label: '60s MASS', width: '90px' },
  { key: 'spread_bps', label: 'SPREAD BPS', width: '90px' },
  { key: 'spread_vs_norm', label: 'SPREAD NORM', width: '100px' },
  { key: 'time', label: 'TIME', width: '90px' },
];

export default function PantherClient({ signals }: { signals: PantherRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'K6' | 'K5' | 'K3'>('ALL');

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== 'ALL') {
      rows = rows.filter((r) => (r.k_level || '').toUpperCase().includes(filter));
    }

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'name': diff = a.name.localeCompare(b.name); break;
        case 'side': diff = a.side.localeCompare(b.side); break;
        case 'k_level': diff = getKLevelRank(a.k_level) - getKLevelRank(b.k_level); break;
        case 'entry': diff = a.entry - b.entry; break;
        case 'surge': diff = a.surge - b.surge; break;
        case 'win60s_cr': diff = a.win60s_cr - b.win60s_cr; break;
        case 'spread_bps': diff = a.spread_bps - b.spread_bps; break;
        case 'spread_vs_norm': diff = a.spread_vs_norm - b.spread_vs_norm; break;
        case 'time': diff = (a.time || '').localeCompare(b.time || ''); break;
        default: 
          diff = (a.time || '').localeCompare(b.time || '');
      }
      return sortAsc ? diff : -diff;
    });
    return rows;
  }, [signals, sortKey, sortAsc, filter]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (!signals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 absolute inset-0 bg-[var(--color-bg)]">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <TrendingUp size={24} style={{ color: 'var(--color-muted)' }} />
        </div>
        <p className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
          NO PANTHER SIGNALS
        </p>
        <p className="text-sm" style={{ color: 'var(--color-muted2)' }}>
          Waiting for the live K-Engine to fire signals.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)] absolute inset-0">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          {(['ALL', 'K6', 'K5', 'K3'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 font-mono text-[9px] tracking-widest transition-all"
              style={{
                background: filter === f
                  ? f === 'K6' ? 'var(--color-goldbg)' : f === 'K5' ? 'rgba(0, 232, 154, 0.1)' : f === 'K3' ? 'rgba(45,142,255,0.1)' : 'var(--color-accentbg)'
                  : 'transparent',
                color: filter === f
                  ? f === 'K6' ? 'var(--color-gold)' : f === 'K5' ? '#00e89a' : f === 'K3' ? '#2d8eff' : 'var(--color-accent)'
                  : 'var(--color-muted)',
                borderRight: f !== 'K3' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {f} {f !== 'ALL' && `(${signals.filter((s) => (s.k_level || '').toUpperCase().includes(f)).length})`}
            </button>
          ))}
        </div>
        <span className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
          {sorted.length} SIGNALS
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div
          className="sticky top-0 z-10 flex items-center px-4 py-2 border-b gap-2"
          style={{ background: 'rgba(10, 14, 23, 0.95)', backdropFilter: 'blur(6px)', borderColor: 'var(--color-border)', minWidth: '950px' }}
        >
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => toggle(col.key)}
              className="font-mono text-[8px] tracking-widest text-left hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{ width: col.width, minWidth: col.width, color: sortKey === col.key ? 'var(--color-accent)' : 'var(--color-muted)' }}
            >
              {col.label}
              {sortKey === col.key && (
                <span style={{ color: 'var(--color-accent)', fontSize: '8px' }}>{sortAsc ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>

        <div style={{ minWidth: '950px' }}>
          {sorted.map((sig, idx) => {
            const rowKey = `${sig.name}-${sig.side}-${idx}-${sig.ts}`;
            
            const surgeColor = sig.surge >= 10 ? 'var(--color-gold)' : sig.surge >= 6 ? 'var(--color-bull)' : 'var(--color-text)';
            const massColor = sig.win60s_cr >= 15 ? 'var(--color-gold)' : sig.win60s_cr >= 5 ? '#00e89a' : 'var(--color-text)';

            return (
              <div
                key={rowKey}
                className="flex items-center px-4 py-2.5 border-b hover:bg-white/[0.025] transition-colors gap-2"
                style={{
                  borderColor: 'rgba(28,45,69,0.6)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  borderLeft: `3px solid ${(sig.k_level || '').toUpperCase().includes('K6') ? 'var(--color-gold)' : (sig.k_level || '').toUpperCase().includes('K5') ? '#00e89a' : '#2d8eff'}`
                }}
              >
                <div style={{ width: COLUMNS[0].width, minWidth: COLUMNS[0].width }}>
                  <div className="flex items-center gap-1.5">
                    {sig.Chart ? (
                      <a
                        href={sig.Chart}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[13px] truncate hover:underline"
                        style={{ color: 'var(--color-text2)' }}
                        title="Open in TradingView"
                      >
                        {sig.name}
                      </a>
                    ) : (
                      <span className="font-semibold text-[13px] truncate" style={{ color: 'var(--color-text2)' }}>
                        {sig.name}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[9px] truncate" style={{ color: 'var(--color-muted)' }}>
                    {sig.instrument_key?.split('|').pop() || sig.instrument_key}
                  </div>
                </div>

                <div style={{ width: COLUMNS[1].width, minWidth: COLUMNS[1].width }}>
                  <SideBadge direction={sig.side} />
                </div>

                <div style={{ width: COLUMNS[2].width, minWidth: COLUMNS[2].width }}>
                  <KLevelBadge k_level={sig.k_level} />
                </div>

                <div style={{ width: COLUMNS[3].width, minWidth: COLUMNS[3].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text2)' }}>
                    {fmtPrice(sig.entry)}
                  </span>
                </div>

                <div style={{ width: COLUMNS[4].width, minWidth: COLUMNS[4].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: surgeColor }}>
                    {sig.surge ? sig.surge.toFixed(1) + 'x' : '—'}
                  </span>
                </div>

                <div style={{ width: COLUMNS[5].width, minWidth: COLUMNS[5].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: massColor }}>
                    {sig.win60s_cr ? '₹' + sig.win60s_cr.toFixed(2) + 'Cr' : '—'}
                  </span>
                </div>

                <div style={{ width: COLUMNS[6].width, minWidth: COLUMNS[6].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {sig.spread_bps !== undefined && sig.spread_bps !== null ? sig.spread_bps.toFixed(2) : '—'}
                  </span>
                </div>

                <div style={{ width: COLUMNS[7].width, minWidth: COLUMNS[7].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {sig.spread_vs_norm !== undefined && sig.spread_vs_norm !== null ? sig.spread_vs_norm.toFixed(2) + 'x' : '—'}
                  </span>
                </div>

                <div style={{ width: COLUMNS[8].width, minWidth: COLUMNS[8].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {sig.time || '—'}
                  </span>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
