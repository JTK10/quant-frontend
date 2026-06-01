'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { V6Row } from '@/utils/backend';

type SortKey = 'lane' | 'name' | 'side' | 'score' | 'entry' | 'target1' | 'rr';

function fmtPrice(v: number) {
  if (!v) return '—';
  return `₹${v.toFixed(2)}`;
}

function LaneBadge({ lane }: { lane: string }) {
  const upper = (lane || '').toUpperCase();
  if (upper.includes('PREMIUM')) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{ color: 'var(--color-gold)', background: 'var(--color-goldbg)', border: '1px solid var(--color-goldborder)' }}>
        ⭐⭐ PREMIUM
      </span>
    );
  }
  if (upper.includes('MARU')) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{ color: 'var(--color-bull)', background: 'var(--color-bullbg)', border: '1px solid var(--color-bullborder)' }}>
        🎯 MARU
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded" style={{ color: '#2d8eff', background: 'rgba(45,142,255,0.1)', border: '1px solid rgba(45,142,255,0.2)' }}>
      ⚡ CONVICTION
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

function getLaneRank(lane: string): number {
  const upper = (lane || '').toUpperCase();
  if (upper.includes('PREMIUM')) return 3;
  if (upper.includes('MARU')) return 2;
  return 1;
}

function ExpandedRow({ sig }: { sig: V6Row }) {
  // VolExp: >= 1.5 strong, >= 2.5 very strong
  const volExpColor = sig.VolExp >= 2.5 ? 'var(--color-gold)' : sig.VolExp >= 1.5 ? 'var(--color-bull)' : 'var(--color-text)';
  
  // RVOL_hist: >= 1.5 good, >= 3 fire
  const rvolColor = sig.RVOL_hist >= 3 ? 'var(--color-gold)' : sig.RVOL_hist >= 1.5 ? 'var(--color-bull)' : 'var(--color-text)';
  
  // Confluence: 3/3 best
  const confColor = sig.Confluence >= 3 ? 'var(--color-gold)' : 'var(--color-text)';
  
  // CoilBars: 0-4 good, low better
  const coilColor = sig.CoilBars <= 4 ? 'var(--color-bull)' : 'var(--color-text)';
  
  // DelayBars: <= 5 good, low better
  const delayColor = sig.DelayBars <= 5 ? 'var(--color-bull)' : 'var(--color-text)';
  
  // ConvBR: >= 0.7 strong
  const brColor = sig.ConvBR >= 0.7 ? 'var(--color-bull)' : 'var(--color-text)';

  // ORL_Held color code
  const orlColor = (sig.ORL_Held || '').toUpperCase() === 'TRUE' ? 'var(--color-bull)' : 'var(--color-muted)';

  return (
    <div
      className="grid grid-cols-4 gap-4 px-6 py-4 text-xs"
      style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid var(--color-border)' }}
    >
      {/* Timing & Flow */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>TIMING & FLOW</div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>CONV TIME</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--color-text)' }}>{sig.ConvCandleTime || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>ENTRY TIME</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--color-text)' }}>{sig.EntryTime || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>DELAY BARS</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: delayColor }}>{sig.DelayBars}</span>
          </div>
        </div>
      </div>

      {/* Volume & Momentum */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>VOLUME & MOMENTUM</div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>VOL EXP</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: volExpColor }}>{sig.VolExp ? sig.VolExp.toFixed(2) : '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>RVOL HIST</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: rvolColor }}>{sig.RVOL_hist ? sig.RVOL_hist.toFixed(2) : '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>CONV BR</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: brColor }}>{sig.ConvBR ? sig.ConvBR.toFixed(2) : '—'}</span>
          </div>
        </div>
      </div>

      {/* Setup Quality */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>SETUP QUALITY</div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>CONFLUENCE</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: confColor }}>{sig.Confluence}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>COIL BARS</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: coilColor }}>{sig.CoilBars}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>BROKE</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--color-text)' }}>{sig.Broke || '—'}</span>
          </div>
        </div>
      </div>

      {/* Trade Management */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>TRADE DETAILS</div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>STOP LOSS</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--color-bear)' }}>{fmtPrice(sig.SL)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>ORL HELD</span>
            <span className="font-mono text-[10px] font-semibold" style={{ color: orlColor }}>{sig.ORL_Held || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'name', label: 'STOCK', width: '160px' },
  { key: 'side', label: 'DIR', width: '80px' },
  { key: 'lane', label: 'LANE', width: '120px' },
  { key: 'score', label: 'SCORE V3', width: '90px' },
  { key: 'entry', label: 'ENTRY', width: '90px' },
  { key: 'target1', label: 'TARGET 1', width: '90px' },
  { key: 'rr', label: 'RISK REWARD', width: '100px' },
];

export default function V6Client({ signals }: { signals: V6Row[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('lane');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'PREMIUM' | 'MARU' | 'CONVICTION'>('ALL');

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== 'ALL') {
      rows = rows.filter((r) => (r.Lane || '').toUpperCase().includes(filter));
    }

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'name': diff = a.Name.localeCompare(b.Name); break;
        case 'side': diff = a.Direction.localeCompare(b.Direction); break;
        case 'lane': diff = getLaneRank(a.Lane) - getLaneRank(b.Lane); break;
        case 'score': diff = a.ScoreV3 - b.ScoreV3; break;
        case 'entry': diff = a.Entry - b.Entry; break;
        case 'target1': diff = a.Target1 - b.Target1; break;
        case 'rr': diff = (a.RiskReward || '').localeCompare(b.RiskReward || ''); break;
        default: 
          // Default sort: Lane desc, then ScoreV3 desc
          diff = getLaneRank(a.Lane) - getLaneRank(b.Lane);
          if (diff === 0) {
            diff = a.ScoreV3 - b.ScoreV3;
          }
      }
      return sortAsc ? diff : -diff;
    });
    return rows;
  }, [signals, sortKey, sortAsc, filter]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const toggleRow = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (!signals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 absolute inset-0 bg-[var(--color-bg)]">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <TrendingUp size={24} style={{ color: 'var(--color-muted)' }} />
        </div>
        <p className="font-mono text-[10px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
          NO V6 SIGNALS
        </p>
        <p className="text-sm" style={{ color: 'var(--color-muted2)' }}>
          No premium signals for the selected date.
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
          {(['ALL', 'PREMIUM', 'MARU', 'CONVICTION'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 font-mono text-[9px] tracking-widest transition-all"
              style={{
                background: filter === f
                  ? f === 'PREMIUM' ? 'var(--color-goldbg)' : f === 'MARU' ? 'var(--color-bullbg)' : f === 'CONVICTION' ? 'rgba(45,142,255,0.1)' : 'var(--color-accentbg)'
                  : 'transparent',
                color: filter === f
                  ? f === 'PREMIUM' ? 'var(--color-gold)' : f === 'MARU' ? 'var(--color-bull)' : f === 'CONVICTION' ? '#2d8eff' : 'var(--color-accent)'
                  : 'var(--color-muted)',
                borderRight: f !== 'CONVICTION' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {f} {f !== 'ALL' && `(${signals.filter((s) => (s.Lane || '').toUpperCase().includes(f)).length})`}
            </button>
          ))}
        </div>
        <span className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
          {sorted.length} SIGNALS
        </span>
        <div className="ml-auto font-mono text-[8px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
          CLICK ROW FOR DETAILS
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center px-4 py-2 border-b gap-2"
          style={{ background: 'rgba(10, 14, 23, 0.95)', backdropFilter: 'blur(6px)', borderColor: 'var(--color-border)', minWidth: '850px' }}
        >
          <div className="w-7 shrink-0" />
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
          <div className="font-mono text-[8px] tracking-widest ml-auto" style={{ color: 'var(--color-muted)' }}>
            TV
          </div>
        </div>

        {/* Rows */}
        <div style={{ minWidth: '850px' }}>
          {sorted.map((sig, idx) => {
            const isOpen = expanded.has(sig.Name);
            const rowKey = `${sig.Name}-${sig.Direction}-${idx}`;

            return (
              <div
                key={rowKey}
                className="border-b"
                style={{
                  borderColor: 'rgba(28,45,69,0.6)',
                  background: isOpen
                    ? 'rgba(45,142,255,0.04)'
                    : idx % 2 === 0
                    ? 'transparent'
                    : 'rgba(255,255,255,0.01)',
                  borderLeft: `3px solid ${(sig.Lane || '').toUpperCase().includes('PREMIUM') ? 'var(--color-gold)' : (sig.Lane || '').toUpperCase().includes('MARU') ? 'var(--color-bull)' : '#2d8eff'}`
                }}
              >
                {/* Main row */}
                <div
                  className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-white/[0.025] transition-colors gap-2"
                  onClick={() => toggleRow(sig.Name)}
                >
                  <div className="w-7 shrink-0 flex items-center justify-center">
                    {isOpen
                      ? <ChevronDown size={12} style={{ color: 'var(--color-accent)' }} />
                      : <ChevronRight size={12} style={{ color: 'var(--color-muted)' }} />
                    }
                  </div>

                  {/* STOCK */}
                  <div style={{ width: COLUMNS[0].width, minWidth: COLUMNS[0].width }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[13px] truncate" style={{ color: 'var(--color-text2)' }}>
                        {sig.Name}
                      </span>
                    </div>
                    <div className="font-mono text-[9px] truncate" style={{ color: 'var(--color-muted)' }}>
                      {sig.Symbol}
                    </div>
                  </div>

                  {/* DIR */}
                  <div style={{ width: COLUMNS[1].width, minWidth: COLUMNS[1].width }}>
                    <SideBadge direction={sig.Direction} />
                  </div>

                  {/* LANE */}
                  <div style={{ width: COLUMNS[2].width, minWidth: COLUMNS[2].width }}>
                    <LaneBadge lane={sig.Lane} />
                  </div>

                  {/* SCORE V3 */}
                  <div style={{ width: COLUMNS[3].width, minWidth: COLUMNS[3].width }}>
                    <span className="font-mono text-[12px] tabular-nums font-semibold" style={{ color: 'var(--color-text)' }}>
                      {sig.ScoreV3 ? sig.ScoreV3.toFixed(2) : '—'}
                    </span>
                  </div>

                  {/* ENTRY */}
                  <div style={{ width: COLUMNS[4].width, minWidth: COLUMNS[4].width }}>
                    <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--color-text2)' }}>
                      {fmtPrice(sig.Entry)}
                    </span>
                  </div>

                  {/* TARGET 1 */}
                  <div style={{ width: COLUMNS[5].width, minWidth: COLUMNS[5].width }}>
                    <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--color-bull)' }}>
                      {fmtPrice(sig.Target1)}
                    </span>
                  </div>

                  {/* RISK REWARD */}
                  <div style={{ width: COLUMNS[6].width, minWidth: COLUMNS[6].width }}>
                    <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                      {sig.RiskReward || '—'}
                    </span>
                  </div>

                  {/* TV link */}
                  <div className="ml-auto">
                    {sig.Chart ? (
                      <a
                        href={sig.Chart}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-mono text-[8px] px-2 py-1 rounded transition-all hover:opacity-80"
                        style={{
                          color: 'var(--color-accent)',
                          background: 'var(--color-accentbg)',
                          border: '1px solid rgba(45,142,255,0.25)',
                        }}
                      >
                        TV <ExternalLink size={8} />
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && <ExpandedRow sig={sig} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
