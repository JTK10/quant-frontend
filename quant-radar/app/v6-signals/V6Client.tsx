'use client';

import { useState, useMemo } from 'react';
import { ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { V6Row } from '@/utils/backend';

type SortKey = 'name' | 'side' | 'lane' | 'pdlbreak' | 'pdhbreak' | 'entry' | 'target1' | 'convtime' | 'entrytime' | 'delaybars' | 'volexp' | 'rvol' | 'convbr' | 'confluence' | 'coilbars';

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

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'name', label: 'STOCK', width: '130px' },
  { key: 'side', label: 'DIR', width: '70px' },
  { key: 'lane', label: 'LANE', width: '110px' },
  { key: 'pdlbreak', label: 'PDL BREAK', width: '85px' },
  { key: 'pdhbreak', label: 'PDH BREAK', width: '85px' },
  { key: 'entry', label: 'ENTRY', width: '80px' },
  { key: 'target1', label: 'TARGET 1', width: '80px' },
  { key: 'convtime', label: 'CONV TIME', width: '80px' },
  { key: 'entrytime', label: 'ENTRY TIME', width: '85px' },
  { key: 'delaybars', label: 'DELAY BARS', width: '85px' },
  { key: 'volexp', label: 'VOL EXP', width: '75px' },
  { key: 'rvol', label: 'RVOL HIST', width: '85px' },
  { key: 'convbr', label: 'CONV BAR', width: '70px' },
  { key: 'confluence', label: 'CONFLU', width: '85px' },
  { key: 'coilbars', label: 'COIL BARS', width: '80px' },
];

export default function V6Client({ signals }: { signals: V6Row[] }) {
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
        case 'pdlbreak': diff = (a.PDL_Break || '').localeCompare(b.PDL_Break || ''); break;
        case 'pdhbreak': diff = (a.PDH_Break || '').localeCompare(b.PDH_Break || ''); break;
        case 'entry': diff = a.Entry - b.Entry; break;
        case 'target1': diff = a.Target1 - b.Target1; break;
        case 'convtime': diff = (a.ConvCandleTime || '').localeCompare(b.ConvCandleTime || ''); break;
        case 'entrytime': diff = (a.EntryTime || '').localeCompare(b.EntryTime || ''); break;
        case 'delaybars': diff = (a.DelayBars || 0) - (b.DelayBars || 0); break;
        case 'volexp': diff = (a.VolExp || 0) - (b.VolExp || 0); break;
        case 'rvol': diff = (a.RVOL_hist || 0) - (b.RVOL_hist || 0); break;
        case 'convbr': diff = (a.ConvBR || 0) - (b.ConvBR || 0); break;
        case 'confluence': diff = (a.Confluence || 0) - (b.Confluence || 0); break;
        case 'coilbars': diff = (a.CoilBars || 0) - (b.CoilBars || 0); break;
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
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center px-4 py-2 border-b gap-2"
          style={{ background: 'rgba(10, 14, 23, 0.95)', backdropFilter: 'blur(6px)', borderColor: 'var(--color-border)', minWidth: '1200px' }}
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

        {/* Rows */}
        <div style={{ minWidth: '1200px' }}>
          {sorted.map((sig, idx) => {
            const rowKey = `${sig.Name}-${sig.Direction}-${idx}`;
            
            // Color logic for specific cells
            const volExpColor = sig.VolExp >= 2.5 ? 'var(--color-gold)' : sig.VolExp >= 1.5 ? 'var(--color-bull)' : 'var(--color-text)';
            const rvolColor = sig.RVOL_hist >= 3 ? 'var(--color-gold)' : sig.RVOL_hist >= 1.5 ? 'var(--color-bull)' : 'var(--color-text)';
            const confColor = sig.Confluence >= 3 ? 'var(--color-gold)' : 'var(--color-text)';
            const coilColor = sig.CoilBars <= 4 ? 'var(--color-bull)' : 'var(--color-text)';
            const delayColor = sig.DelayBars <= 5 ? 'var(--color-bull)' : 'var(--color-text)';
            const brColor = sig.ConvBR >= 0.7 ? 'var(--color-bull)' : 'var(--color-text)';

            return (
              <div
                key={rowKey}
                className="flex items-center px-4 py-2.5 border-b hover:bg-white/[0.025] transition-colors gap-2"
                style={{
                  borderColor: 'rgba(28,45,69,0.6)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  borderLeft: `3px solid ${(sig.Lane || '').toUpperCase().includes('PREMIUM') ? 'var(--color-gold)' : (sig.Lane || '').toUpperCase().includes('MARU') ? 'var(--color-bull)' : '#2d8eff'}`
                }}
              >
                {/* STOCK (Clickable TV Link) */}
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
                        {sig.Name}
                      </a>
                    ) : (
                      <span className="font-semibold text-[13px] truncate" style={{ color: 'var(--color-text2)' }}>
                        {sig.Name}
                      </span>
                    )}
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

                {/* PDL BREAK */}
                <div style={{ width: COLUMNS[3].width, minWidth: COLUMNS[3].width }}>
                  <span className="font-mono text-[11px] font-semibold" style={{ color: (sig.PDL_Break || '').toUpperCase() === 'TRUE' ? 'var(--color-bull)' : 'var(--color-muted)' }}>
                    {sig.PDL_Break || '—'}
                  </span>
                </div>

                {/* PDH BREAK */}
                <div style={{ width: COLUMNS[4].width, minWidth: COLUMNS[4].width }}>
                  <span className="font-mono text-[11px] font-semibold" style={{ color: (sig.PDH_Break || '').toUpperCase() === 'TRUE' ? 'var(--color-bull)' : 'var(--color-muted)' }}>
                    {sig.PDH_Break || '—'}
                  </span>
                </div>

                {/* ENTRY */}
                <div style={{ width: COLUMNS[5].width, minWidth: COLUMNS[5].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text2)' }}>
                    {fmtPrice(sig.Entry)}
                  </span>
                </div>

                {/* TARGET 1 */}
                <div style={{ width: COLUMNS[6].width, minWidth: COLUMNS[6].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-bull)' }}>
                    {fmtPrice(sig.Target1)}
                  </span>
                </div>

                {/* CONV TIME */}
                <div style={{ width: COLUMNS[7].width, minWidth: COLUMNS[7].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {sig.ConvCandleTime || '—'}
                  </span>
                </div>

                {/* ENTRY TIME */}
                <div style={{ width: COLUMNS[8].width, minWidth: COLUMNS[8].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {sig.EntryTime || '—'}
                  </span>
                </div>

                {/* DELAY BARS */}
                <div style={{ width: COLUMNS[9].width, minWidth: COLUMNS[9].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: delayColor }}>
                    {sig.DelayBars !== undefined && sig.DelayBars !== null ? sig.DelayBars : '—'}
                  </span>
                </div>

                {/* VOL EXP */}
                <div style={{ width: COLUMNS[10].width, minWidth: COLUMNS[10].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: volExpColor }}>
                    {sig.VolExp ? sig.VolExp.toFixed(2) : '—'}
                  </span>
                </div>

                {/* RVOL HIST */}
                <div style={{ width: COLUMNS[11].width, minWidth: COLUMNS[11].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: rvolColor }}>
                    {sig.RVOL_hist ? sig.RVOL_hist.toFixed(2) : '—'}
                  </span>
                </div>

                {/* CONV BR */}
                <div style={{ width: COLUMNS[12].width, minWidth: COLUMNS[12].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: brColor }}>
                    {sig.ConvBR ? sig.ConvBR.toFixed(2) : '—'}
                  </span>
                </div>

                {/* CONFLUENCE */}
                <div style={{ width: COLUMNS[13].width, minWidth: COLUMNS[13].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: confColor }}>
                    {sig.Confluence !== undefined && sig.Confluence !== null ? sig.Confluence : '—'}
                  </span>
                </div>

                {/* COIL BARS */}
                <div style={{ width: COLUMNS[14].width, minWidth: COLUMNS[14].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: coilColor }}>
                    {sig.CoilBars !== undefined && sig.CoilBars !== null ? sig.CoilBars : '—'}
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
