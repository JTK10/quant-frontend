'use client';

import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { PantherRow } from '@/utils/backend';

type SectorItem = {
  Sector: string;
  Stocks?: string;
};

type SortKey = 'name' | 'side' | 'entry' | 'surge' | 'win60s_cr' | 'time' | 'sector';

function fmtPrice(v: number) {
  if (!v) return '—';
  return `₹${v.toFixed(2)}`;
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

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'name', label: 'STOCK', width: '150px' },
  { key: 'side', label: 'DIR', width: '80px' },
  { key: 'entry', label: 'ENTRY', width: '90px' },
  { key: 'surge', label: 'SURGE', width: '90px' },
  { key: 'win60s_cr', label: 'SMC', width: '90px' },
  { key: 'time', label: 'TIME', width: '90px' },
  { key: 'sector', label: 'SECTOR BIAS', width: '280px' },
];

export default function PantherClient({ signals }: { signals: PantherRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorData, setSectorData] = useState<SectorItem[]>([]);

  useEffect(() => {
    fetch('/api/sector-sentiment?date=' + new Date().toISOString().split('T')[0])
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) setSectorData(d);
      }).catch(() => {});
  }, []);

  const stockToSector = useMemo(() => {
    const map = new Map<string, SectorItem>();
    sectorData.forEach(sec => {
      try {
        const stocks = JSON.parse(sec.Stocks || '[]');
        stocks.forEach((s: any) => {
          map.set(s.Stock, sec);
        });
      } catch (e) {}
    });
    return map;
  }, [sectorData]);

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== 'ALL') {
      rows = rows.filter((r) => (r.side || '').toUpperCase() === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.instrument_key?.toLowerCase().includes(q));
    }

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'name': diff = a.name.localeCompare(b.name); break;
        case 'side': diff = a.side.localeCompare(b.side); break;
        case 'entry': diff = a.entry - b.entry; break;
        case 'surge': diff = a.surge - b.surge; break;
        case 'win60s_cr': diff = a.win60s_cr - b.win60s_cr; break;
        case 'time': diff = (a.time || '').localeCompare(b.time || ''); break;
        case 'sector': 
          const sA = stockToSector.get(a.name)?.Sector || '';
          const sB = stockToSector.get(b.name)?.Sector || '';
          diff = sA.localeCompare(sB);
          break;
        default: 
          diff = (a.time || '').localeCompare(b.time || '');
      }
      return sortAsc ? diff : -diff;
    });
    return rows;
  }, [signals, sortKey, sortAsc, filter, searchQuery]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const totalLong = signals.filter((s) => s.side === 'LONG').length;
  const totalShort = signals.filter((s) => s.side === 'SHORT').length;
  const pctLong = signals.length ? ((totalLong / signals.length) * 100).toFixed(2) : "0.00";
  const pctShort = signals.length ? ((totalShort / signals.length) * 100).toFixed(2) : "0.00";

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
        className="flex flex-col gap-4 px-4 py-3 border-b shrink-0"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
              {(['ALL', 'LONG', 'SHORT'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-4 py-1.5 font-mono text-[10px] tracking-widest transition-all"
                  style={{
                    background: filter === f
                      ? f === 'LONG' ? 'var(--color-bullbg)' : f === 'SHORT' ? 'var(--color-bearbg)' : 'var(--color-accentbg)'
                      : 'transparent',
                    color: filter === f
                      ? f === 'LONG' ? 'var(--color-bull)' : f === 'SHORT' ? 'var(--color-bear)' : 'var(--color-accent)'
                      : 'var(--color-muted)',
                    borderRight: f !== 'SHORT' ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  {f} {f !== 'ALL' && `(${signals.filter((s) => (s.side || '').toUpperCase() === f).length})`}
                </button>
              ))}
            </div>
            <span className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
              {sorted.length} MATCHES
            </span>
          </div>

          <div className="w-48 h-8 bg-[rgba(255,255,255,0.04)] rounded-md border border-[rgba(255,255,255,0.06)] flex items-center px-3">
            <input
              type="text"
              placeholder="Search stocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-[11px] font-mono text-white w-full placeholder:text-[rgba(255,255,255,0.3)]"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <div
          className="sticky top-0 z-10 flex items-center px-4 py-2.5 border-b gap-2"
          style={{ background: 'rgba(10, 14, 23, 0.82)', backdropFilter: 'blur(12px) saturate(140%)', WebkitBackdropFilter: 'blur(12px) saturate(140%)', borderColor: 'var(--color-border)', minWidth: '950px' }}
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
                className="group flex items-center px-4 py-2.5 border-b hover:bg-white/[0.04] hover:shadow-[inset_0_0_24px_-12px_rgba(45,142,255,0.5)] transition-all gap-2"
                style={{
                  borderColor: 'rgba(28,45,69,0.6)',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  borderLeft: `3px solid ${sig.side === 'LONG' ? 'var(--color-bull)' : sig.side === 'SHORT' ? 'var(--color-bear)' : 'transparent'}`
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
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text2)' }}>
                    {fmtPrice(sig.entry)}
                  </span>
                </div>

                <div style={{ width: COLUMNS[3].width, minWidth: COLUMNS[3].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: surgeColor }}>
                    {sig.surge ? sig.surge.toFixed(1) + 'x' : '—'}
                  </span>
                </div>

                <div style={{ width: COLUMNS[4].width, minWidth: COLUMNS[4].width }}>
                  <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: massColor }}>
                    {sig.win60s_cr ? sig.win60s_cr.toFixed(2) : '—'}
                  </span>
                </div>

                <div style={{ width: COLUMNS[5].width, minWidth: COLUMNS[5].width }}>
                  <span className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--color-text)' }}>
                    {sig.time || '—'}
                  </span>
                </div>

                <div className="flex-1 flex items-center min-w-[280px]">
                  {(() => {
                    const sec = stockToSector.get(sig.name);
                    if (!sec) return <span className="text-[10px] text-[rgba(255,255,255,0.2)] font-mono">NO SECTOR DATA</span>;
                    
                    let secStocks: any[] = [];
                    try { secStocks = JSON.parse(sec.Stocks || '[]'); } catch(e) {}
                    const sUp = secStocks.filter(s => s.Signal === 'up').length;
                    const sDn = secStocks.filter(s => s.Signal === 'down').length;
                    const pUp = secStocks.length ? ((sUp / secStocks.length) * 100).toFixed(2) : "0.00";
                    const pDn = secStocks.length ? ((sDn / secStocks.length) * 100).toFixed(2) : "0.00";
                    const cleanSector = (sec.Sector || "").replace("NIFTY_", "").replace("_", " ");

                    return (
                      <div className="w-full pr-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <h3 className="text-[10px] font-semibold text-[rgba(255,255,255,0.9)] tracking-widest uppercase">{cleanSector}</h3>
                          <span className="bg-[#ff1e56] text-white text-[8px] font-bold px-1 py-[1px] rounded tracking-wide">LIVE</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full overflow-hidden mb-1.5 bg-[rgba(255,255,255,0.05)] flex shadow-inner">
                           <div style={{ width: `${pUp}%`, backgroundColor: '#00e89a', boxShadow: `0 0 10px #00e89a` }}></div>
                           <div style={{ width: `${pDn}%`, backgroundColor: '#ff3b6b', boxShadow: `0 0 10px #ff3b6b` }}></div>
                        </div>
                        <div className="flex justify-between items-center text-[9px] font-mono text-[rgba(255,255,255,0.5)]">
                           <div className="flex items-center gap-1.5">
                             <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: '#00e89a', boxShadow: `0 0 4px #00e89a`}}></div>
                             <span>{sUp} stocks ({pUp}% Up)</span>
                           </div>
                           <div className="flex items-center gap-1.5">
                             <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: '#ff3b6b', boxShadow: `0 0 4px #ff3b6b`}}></div>
                             <span>{sDn} stocks ({pDn}% Down)</span>
                           </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
