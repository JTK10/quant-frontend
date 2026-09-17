"use client";

import { useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type JaguarRow = {
  sym: string;
  time: string;
  spot: number;
  ce_cr: number;
  pe_cr: number;
  diff_cr: number;
  capitulation: boolean;
  side: string;
};

const fmt = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

type SortField = 'time' | 'ce_cr' | 'pe_cr' | 'opp_flow';
type SortDir = 'asc' | 'desc';

function JaguarBoard({
  title,
  rows,
  tint,
}: {
  title: string;
  rows: JaguarRow[];
  tint: string;
}) {
  const [sortField, setSortField] = useState<SortField>('time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterCap, setFilterCap] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'B' | 'R'>('ALL');

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="opacity-30 ml-1">↕</span>;
    return <span className="ml-1 text-white">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const processedRows = rows
    .filter(r => !filterCap || r.capitulation)
    .filter(r => {
      if (filterType === 'ALL') return true;
      if (filterType === 'B') return r.side.includes('BREAKOUT');
      if (filterType === 'R') return r.side.includes('REJECT');
      return true;
    })
    .sort((a, b) => {
      const oppA = a.side.includes("BULL") ? a.ce_cr : a.pe_cr;
      const oppB = b.side.includes("BULL") ? b.ce_cr : b.pe_cr;

      let va: any = a.time;
      let vb: any = b.time;
      
      if (sortField === 'ce_cr') { va = a.ce_cr; vb = b.ce_cr; }
      else if (sortField === 'pe_cr') { va = a.pe_cr; vb = b.pe_cr; }
      else if (sortField === 'opp_flow') { va = oppA; vb = oppB; }
      
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint }}>
            {title}
          </h2>
          <span className="text-[11px] text-white/35">
            {processedRows.length} {processedRows.length === 1 ? "signal" : "signals"}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-white/[0.05] rounded border border-white/[0.1] overflow-hidden">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-2 py-1 text-[10px] tracking-wider transition-colors ${filterType === 'ALL' ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10'}`}
            >
              ALL
            </button>
            <button
              onClick={() => setFilterType('B')}
              className={`px-2 py-1 text-[10px] tracking-wider transition-colors ${filterType === 'B' ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10'}`}
            >
              BREAKOUT
            </button>
            <button
              onClick={() => setFilterType('R')}
              className={`px-2 py-1 text-[10px] tracking-wider transition-colors ${filterType === 'R' ? 'bg-white/20 text-white' : 'text-white/50 hover:bg-white/10'}`}
            >
              REVERSAL
            </button>
          </div>
          <button
            onClick={() => setFilterCap(!filterCap)}
            className="text-[10px] tracking-wider px-2 py-1 rounded border transition-colors"
            style={{
              borderColor: filterCap ? tint : 'rgba(255,255,255,0.1)',
              color: filterCap ? tint : 'rgba(255,255,255,0.5)',
              backgroundColor: filterCap ? `${tint}11` : 'transparent'
            }}
          >
            {filterCap ? "CAPITULATION ONLY" : "ALL STATUS"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013] shadow-md shadow-black/20">
            <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th 
                className="px-3 py-2 text-left font-medium cursor-pointer hover:text-white/80 transition"
                onClick={() => toggleSort('time')}
              >
                Time <SortIcon field="time" />
              </th>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Entry</th>
              <th 
                className="px-3 py-2 text-right font-medium cursor-pointer hover:text-white/80 transition"
                onClick={() => toggleSort('pe_cr')}
              >
                PE ₹Cr <SortIcon field="pe_cr" />
              </th>
              <th 
                className="px-3 py-2 text-right font-medium cursor-pointer hover:text-white/80 transition"
                onClick={() => toggleSort('ce_cr')}
              >
                CE ₹Cr <SortIcon field="ce_cr" />
              </th>
              <th 
                className="px-3 py-2 text-right font-medium cursor-pointer hover:text-white/80 transition"
                onClick={() => toggleSort('opp_flow')}
              >
                Opp Flow <SortIcon field="opp_flow" />
              </th>
              <th className="px-3 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {processedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[12px] text-white/30">
                  No signals met the criteria.
                </td>
              </tr>
            )}
            {processedRows.map((r) => {
              const opposingFlow = r.side.includes("BULL") ? r.ce_cr : r.pe_cr;
              const typeLabel = r.side.includes("BREAKOUT") ? "(B)" : r.side.includes("REJECT") ? "(R)" : "";
              
              return (
              <tr key={`${r.sym}-${r.time}`} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
                <td className="px-3 py-1.5 font-mono text-[11px] text-white/60">{r.time}</td>
                <td className="px-3 py-1.5 font-medium flex items-center gap-1.5">
                  <a
                    href={buildTradingViewUrl(r.sym, r.sym)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70"
                    title={`Open ${r.sym} on TradingView`}
                  >
                    {r.sym}
                  </a>
                  {typeLabel && (
                    <span className="text-[11px] font-black text-white px-1.5 py-0.5 rounded-sm bg-white/10 ml-1">
                      {typeLabel}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/80">{fmt(r.spot, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmt(r.pe_cr, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmt(r.ce_cr, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70" style={{ color: opposingFlow < 0 ? tint : "var(--color-muted)" }}>
                  {fmt(opposingFlow, 2)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {r.capitulation && (
                    <span
                      className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
                      style={{ background: `${tint}22`, color: tint }}
                      title="Opposite side is trapped (Notional flow is negative)"
                    >
                      CAPITULATION
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JaguarClient({
  bulls,
  bears,
}: {
  bulls: JaguarRow[];
  bears: JaguarRow[];
}) {
  return (
    <div className="absolute inset-0 flex flex-col gap-6 p-3 md:flex-row md:p-6 overflow-hidden">
      {/* Bull Board */}
      <JaguarBoard
        title="BULLISH SIGNALS"
        rows={bulls}
        tint="var(--color-bull)"
      />

      {/* Divider */}
      <div className="hidden w-[1px] bg-white/[0.07] md:block" />

      {/* Bear Board */}
      <JaguarBoard
        title="BEARISH SIGNALS"
        rows={bears}
        tint="var(--color-bear)"
      />
    </div>
  );
}
