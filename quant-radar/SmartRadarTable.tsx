'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, TrendingUp, TrendingDown, Minus } from 'lucide-react';

type Signal = {
  Name: string; Symbol: string; Side: 'BULL' | 'BEAR' | 'NEUTRAL';
  Module: string; Entry: number; SL: number; Target1: number; Target2: number;
  RR: string; Confidence: number; RVOL: number; PCR: number; PCR_Signal: string;
  BodyPct: number; DayMovePct: number; RSScore: number; CallWall: string; PutWall: string;
  ATMStrike: string; MaxPain: string; PEOISurge: number; StrikeRec: string; Notes: string;
  SectorTheme: boolean; Direction: string; LevelPrice: number; PDH: number; PDL: number;
  BreakTime: string; RetestTime: string; EntryTime: string; SLPct: number; T1MovePct: number;
  ATMIV: number; HasOptions: boolean; FiredAt: string; SignalRank: number; Chart: string;
  aligator?: string;
};

type SortKey = 'rank' | 'name' | 'side' | 'module' | 'entry' | 'conf' | 'rvol' | 'pcr' | 'rr' | 'move' | 'time' | 'aligator';

function fmtPrice(v: number) {
  if (!v) return '—';
  return `₹${v.toFixed(2)}`;
}

function fmtPct(v: number, sign = false) {
  if (!v) return '—';
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function confColor(c: number) {
  if (c >= 4.5) return 'var(--color-bull)';
  if (c >= 3.5) return 'var(--color-gold)';
  return 'var(--color-muted2)';
}

function confBg(c: number) {
  if (c >= 4.5) return 'var(--color-bullbg)';
  if (c >= 3.5) return 'var(--color-goldbg)';
  return 'rgba(255,255,255,0.04)';
}

function ConfBar({ value, max = 5 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = confColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, animation: 'bar-fill 0.6s ease both' }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums w-5 text-right" style={{ color }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

function SideBadge({ side }: { side: Signal['Side'] }) {
  const map = {
    BULL: { label: 'BULL', color: 'var(--color-bull)', bg: 'var(--color-bullbg)', border: 'var(--color-bullborder)', Icon: TrendingUp },
    BEAR: { label: 'BEAR', color: 'var(--color-bear)', bg: 'var(--color-bearbg)', border: 'var(--color-bearborder)', Icon: TrendingDown },
    NEUTRAL: { label: 'NEUT', color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.04)', border: 'var(--color-border)', Icon: Minus },
  };
  const { label, color, bg, border, Icon } = map[side] ?? map.NEUTRAL;
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

function ModuleBadge({ module }: { module: string }) {
  const colorMap: Record<string, string> = {
    'MOD-A': 'var(--color-purple)',
    'MOD-B': 'var(--color-accent)',
    'MOD-C': 'var(--color-gold)',
    'MOD-D': 'var(--color-bear)',
  };
  const color = colorMap[module] ?? 'var(--color-muted2)';
  return (
    <span
      className="font-mono text-[8px] tracking-widest px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
    >
      {module}
    </span>
  );
}

function ExpandedRow({ sig }: { sig: Signal }) {
  const slDist = sig.Entry && sig.SL ? Math.abs(sig.Entry - sig.SL) : 0;
  const t1Dist = sig.Entry && sig.Target1 ? Math.abs(sig.Target1 - sig.Entry) : 0;

  return (
    <div
      className="grid grid-cols-4 gap-4 px-6 py-4 text-xs"
      style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid var(--color-border)' }}
    >
      {/* Trade levels */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>TRADE LEVELS</div>
        <div className="space-y-1.5">
          {[
            { l: 'ENTRY', v: fmtPrice(sig.Entry), c: 'var(--color-text2)' },
            { l: 'STOP LOSS', v: `${fmtPrice(sig.SL)} (−${sig.SLPct?.toFixed(2) ?? slDist.toFixed(2)}%)`, c: 'var(--color-bear)' },
            { l: 'TARGET 1', v: `${fmtPrice(sig.Target1)} (+${sig.T1MovePct?.toFixed(2) ?? t1Dist.toFixed(2)}%)`, c: 'var(--color-bull)' },
            { l: 'TARGET 2', v: fmtPrice(sig.Target2), c: 'rgba(0,232,154,0.6)' },
            { l: 'RISK:REWARD', v: sig.RR || '—', c: 'var(--color-text)' },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Options data */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>OPTIONS CHAIN</div>
        <div className="space-y-1.5">
          {[
            { l: 'PCR', v: sig.PCR ? sig.PCR.toFixed(3) : '—', c: sig.PCR < 0.65 ? 'var(--color-bull)' : sig.PCR > 1.2 ? 'var(--color-bear)' : 'var(--color-text)' },
            { l: 'PCR SIGNAL', v: sig.PCR_Signal || '—', c: 'var(--color-text)' },
            { l: 'ATM STRIKE', v: sig.ATMStrike || '—', c: 'var(--color-text2)' },
            { l: 'ATM IV', v: sig.ATMIV ? `${(sig.ATMIV * 100).toFixed(1)}%` : '—', c: 'var(--color-text)' },
            { l: 'MAX PAIN', v: sig.MaxPain || '—', c: 'var(--color-text)' },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* OI / Walls */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>OI & WALLS</div>
        <div className="space-y-1.5">
          {[
            { l: 'CALL WALL', v: sig.CallWall || '—', c: 'var(--color-bear)' },
            { l: 'PUT WALL', v: sig.PutWall || '—', c: 'var(--color-bull)' },
            { l: 'PE OI SURGE', v: sig.PEOISurge ? `${sig.PEOISurge.toFixed(1)}%` : '—', c: 'var(--color-text)' },
            { l: 'STRIKE REC', v: sig.StrikeRec || '—', c: 'var(--color-gold)' },
            { l: 'RS SCORE', v: sig.RSScore ? sig.RSScore.toFixed(1) : '—', c: 'var(--color-text)' },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timing */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: 'var(--color-muted)' }}>TIMING & LEVELS</div>
        <div className="space-y-1.5">
          {[
            { l: 'BREAK TIME', v: sig.BreakTime || '—', c: 'var(--color-text)' },
            { l: 'RETEST TIME', v: sig.RetestTime || '—', c: 'var(--color-text)' },
            { l: 'ENTRY TIME', v: sig.EntryTime || sig.FiredAt || '—', c: 'var(--color-text2)' },
            { l: 'PDH', v: fmtPrice(sig.PDH), c: 'var(--color-bull)' },
            { l: 'PDL', v: fmtPrice(sig.PDL), c: 'var(--color-bear)' },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
        {sig.Notes && (
          <div className="mt-3 p-2 rounded text-[10px] italic" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--color-muted2)' }}>
            {sig.Notes}
          </div>
        )}
        {sig.SectorTheme && (
          <div className="mt-2 inline-flex items-center gap-1 font-mono text-[8px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-purplebg)', color: 'var(--color-purple)', border: '1px solid rgba(155,111,255,0.25)' }}>
            ★ SECTOR THEME
          </div>
        )}
      </div>
    </div>
  );
}

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: 'time', label: 'TIME', width: '70px' },
  { key: 'aligator', label: 'ACTION', width: '70px' },
  { key: 'name', label: 'STOCK', width: '140px' },
  { key: 'side', label: 'SIDE', width: '60px' },
  { key: 'module', label: 'MOD', width: '68px' },
  { key: 'entry', label: 'ENTRY', width: '78px' },
  { key: 'rr', label: 'SL / T1 / T2', width: '180px' },
  { key: 'conf', label: 'SCORE', width: '110px' },
  { key: 'rvol', label: 'RVOL', width: '58px' },
  { key: 'pcr', label: 'PCR', width: '60px' },
  { key: 'move', label: 'MOVE%', width: '68px' },
];

export default function SmartRadarTable({ signals }: { signals: Signal[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'BULL' | 'BEAR'>('ALL');
  const [aligatorFilter, setAligatorFilter] = useState<'ALL' | 'TAKE' | 'SKIP'>('ALL');

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== 'ALL') rows = rows.filter((r) => r.Side === filter);
    if (aligatorFilter !== 'ALL') rows = rows.filter((r) => r.aligator === aligatorFilter);

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case 'name': diff = a.Name.localeCompare(b.Name); break;
        case 'side': diff = a.Side.localeCompare(b.Side); break;
        case 'module': diff = a.Module.localeCompare(b.Module); break;
        case 'entry': diff = a.Entry - b.Entry; break;
        case 'conf': diff = a.Confidence - b.Confidence; break;
        case 'rvol': diff = a.RVOL - b.RVOL; break;
        case 'pcr': diff = a.PCR - b.PCR; break;
        case 'rr': diff = a.RR.localeCompare(b.RR); break;
        case 'move': diff = a.DayMovePct - b.DayMovePct; break;
        case 'time': diff = (a.FiredAt || a.EntryTime).localeCompare(b.FiredAt || b.EntryTime); break;
        case 'aligator': diff = (a.aligator || '').localeCompare(b.aligator || ''); break;
        default: diff = b.SignalRank - a.SignalRank;
      }
      return sortAsc ? diff : -diff;
    });
    return rows;
  }, [signals, sortKey, sortAsc, filter, aligatorFilter]);

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
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <TrendingUp size={24} style={{ color: 'var(--color-muted)' }} />
        </div>
        <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>
          NO SIGNALS FOR SELECTED DATE
        </p>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Signals generate during market hours (9:45 AM – 2:00 PM IST)
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
          {(['ALL', 'BULL', 'BEAR'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 font-mono text-[9px] tracking-widest transition-all"
              style={{
                background: filter === f
                  ? f === 'BULL' ? 'var(--color-bullbg)' : f === 'BEAR' ? 'var(--color-bearbg)' : 'var(--color-accentbg)'
                  : 'transparent',
                color: filter === f
                  ? f === 'BULL' ? 'var(--color-bull)' : f === 'BEAR' ? 'var(--color-bear)' : 'var(--color-accent)'
                  : 'var(--color-muted)',
                borderRight: f !== 'BEAR' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {f} {f !== 'ALL' && `(${signals.filter((s) => s.Side === f).length})`}
            </button>
          ))}
        </div>

        {/* ALIGATOR Filter */}
        <div className="flex rounded-lg overflow-hidden ml-2" style={{ border: '1px solid var(--color-border)' }}>
          {(['ALL', 'TAKE', 'SKIP'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setAligatorFilter(f)}
              className="px-3 py-1 font-mono text-[9px] tracking-widest transition-all"
              style={{
                background: aligatorFilter === f
                  ? f === 'TAKE' ? 'rgba(0,232,154,0.1)' : f === 'SKIP' ? 'rgba(255,255,255,0.05)' : 'var(--color-accentbg)'
                  : 'transparent',
                color: aligatorFilter === f
                  ? f === 'TAKE' ? 'rgba(0,232,154,1)' : f === 'SKIP' ? 'var(--color-muted)' : 'var(--color-accent)'
                  : 'var(--color-muted)',
                borderRight: f !== 'SKIP' ? '1px solid var(--color-border)' : 'none',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        <span className="font-mono text-[9px] tracking-widest ml-3" style={{ color: 'var(--color-muted)' }}>
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
          className="sticky top-0 z-10 flex items-center px-4 py-2 border-b"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', minWidth: '1030px' }}
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
        <div style={{ minWidth: '1030px' }}>
          {sorted.map((sig, idx) => {
            const isOpen = expanded.has(sig.Name);
            const rowKey = `${sig.Name}-${sig.FiredAt}-${idx}`;
            const timeStr = sig.FiredAt || sig.EntryTime || '—';
            const timeShort = timeStr.length > 5 ? timeStr.slice(11, 16) || timeStr.slice(0, 5) : timeStr;

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
                }}
              >
                {/* Main row */}
                <div
                  className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-white/[0.025] transition-colors"
                  onClick={() => toggleRow(sig.Name)}
                >
                  <div className="w-7 shrink-0 flex items-center justify-center">
                    {isOpen
                      ? <ChevronDown size={12} style={{ color: 'var(--color-accent)' }} />
                      : <ChevronRight size={12} style={{ color: 'var(--color-muted)' }} />
                    }
                  </div>

                  {/* TIME */}
                  <div style={{ width: '70px', minWidth: '70px' }}>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--color-muted2)' }}>
                      {timeShort}
                    </span>
                  </div>

                  {/* ACTION (ALIGATOR) */}
                  <div style={{ width: '70px', minWidth: '70px' }}>
                    {sig.aligator ? (
                      <span className="font-mono text-[10px] font-semibold" style={{ color: sig.aligator === 'TAKE' ? 'rgba(0,232,154,1)' : 'var(--color-muted2)' }}>
                        {sig.aligator}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px]" style={{ color: 'var(--color-muted)' }}>—</span>
                    )}
                  </div>

                  {/* STOCK */}
                  <div style={{ width: '140px', minWidth: '140px' }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[12px] truncate" style={{ color: 'var(--color-text2)' }}>
                        {sig.Name}
                      </span>
                      {sig.SectorTheme && (
                        <span style={{ color: 'var(--color-purple)', fontSize: '8px' }}>★</span>
                      )}
                    </div>
                    <div className="font-mono text-[9px] truncate" style={{ color: 'var(--color-muted)' }}>
                      {sig.Symbol}
                    </div>
                  </div>

                  {/* SIDE */}
                  <div style={{ width: '60px', minWidth: '60px' }}>
                    <SideBadge side={sig.Side} />
                  </div>

                  {/* MODULE */}
                  <div style={{ width: '68px', minWidth: '68px' }}>
                    <ModuleBadge module={sig.Module} />
                  </div>

                  {/* ENTRY */}
                  <div style={{ width: '78px', minWidth: '78px' }}>
                    <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: 'var(--color-text2)' }}>
                      {fmtPrice(sig.Entry)}
                    </span>
                  </div>

                  {/* SL / T1 / T2 */}
                  <div style={{ width: '180px', minWidth: '180px' }} className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--color-bear)' }}>
                      {fmtPrice(sig.SL)}
                    </span>
                    <span style={{ color: 'var(--color-border)', fontSize: '10px' }}>|</span>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--color-bull)' }}>
                      {fmtPrice(sig.Target1)}
                    </span>
                    <span style={{ color: 'var(--color-border)', fontSize: '10px' }}>|</span>
                    <span className="font-mono text-[10px] tabular-nums" style={{ color: 'rgba(0,232,154,0.6)' }}>
                      {fmtPrice(sig.Target2)}
                    </span>
                  </div>

                  {/* CONF */}
                  <div style={{ width: '110px', minWidth: '110px' }}>
                    <ConfBar value={sig.Confidence} />
                  </div>

                  {/* RVOL */}
                  <div style={{ width: '58px', minWidth: '58px' }}>
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: sig.RVOL >= 2 ? 'var(--color-gold)' : 'var(--color-text)' }}
                    >
                      {sig.RVOL ? `${sig.RVOL.toFixed(1)}x` : '—'}
                    </span>
                  </div>

                  {/* PCR */}
                  <div style={{ width: '60px', minWidth: '60px' }}>
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{
                        color: sig.PCR < 0.65 ? 'var(--color-bull)' : sig.PCR > 1.2 ? 'var(--color-bear)' : 'var(--color-text)',
                      }}
                    >
                      {sig.PCR ? sig.PCR.toFixed(2) : '—'}
                    </span>
                  </div>

                  {/* MOVE */}
                  <div style={{ width: '68px', minWidth: '68px' }}>
                    <span
                      className="font-mono text-[10px] tabular-nums"
                      style={{ color: sig.DayMovePct > 0 ? 'var(--color-bull)' : sig.DayMovePct < 0 ? 'var(--color-bear)' : 'var(--color-muted)' }}
                    >
                      {fmtPct(sig.DayMovePct, true)}
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
