"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SniperRow } from "@/utils/backend";

type SortKey = "time" | "name" | "sector" | "side" | "rvol" | "secPress" | "rsScore" | "composite";

function shortTime(value: string): string {
  if (!value) return "—";
  if (value.includes("T")) return value.slice(11, 16);
  return value.length > 5 ? value.slice(0, 5) : value;
}

function SideBadge({ direction }: { direction: string }) {
  const map: Record<string, { label: string; color: string; bg: string; border: string; Icon: any }> = {
    LONG: { label: "BULL", color: "var(--color-bull)", bg: "var(--color-bullbg)", border: "var(--color-bullborder)", Icon: TrendingUp },
    SHORT: { label: "BEAR", color: "var(--color-bear)", bg: "var(--color-bearbg)", border: "var(--color-bearborder)", Icon: TrendingDown },
  };
  const { label, color, bg, border, Icon } = map[direction] ?? { label: "NEUT", color: "var(--color-muted)", bg: "rgba(255,255,255,0.04)", border: "var(--color-border)", Icon: Minus };
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

function ExpandedRow({ sig }: { sig: SniperRow }) {
  return (
    <div
      className="grid grid-cols-4 gap-4 px-6 py-4 text-xs"
      style={{ background: "rgba(0,0,0,0.25)", borderTop: "1px solid var(--color-border)" }}
    >
      {/* Trade levels */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: "var(--color-muted)" }}>TRADE LEVELS</div>
        <div className="space-y-1.5">
          {[
            { l: "ENTRY PRICE", v: `₹${sig.EntryPrice?.toFixed(2) ?? '—'}`, c: "var(--color-text2)" },
            { l: "EMA 9 (REF)", v: `₹${sig.EMA9?.toFixed(2) ?? '—'}`, c: "var(--color-text)" },
            { l: "MAX MOVE", v: `${sig.MaxMovePct > 0 ? "+" : ""}${sig.MaxMovePct?.toFixed(2) ?? '—'}%`, c: sig.MaxMovePct > 0 ? "var(--color-bull)" : "var(--color-bear)" },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Trigger & Early Movers */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: "var(--color-muted)" }}>TRIGGER & MOVERS</div>
        <div className="space-y-1.5">
          {[
            { l: "TRIGGER MODE", v: sig.TriggerMode || "—", c: "var(--color-text)" },
            { l: "CONVICTION", v: `${sig.Conviction}/5`, c: "var(--color-gold)" },
            { l: "EARLY ABS PCT", v: sig.EarlyAbsPct ? `${sig.EarlyAbsPct.toFixed(2)}%` : "—", c: "var(--color-text2)" },
            { l: "EARLY RVOL", v: sig.EarlyRVOL ? `${sig.EarlyRVOL.toFixed(2)}x` : "—", c: "var(--color-text2)" },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold text-right max-w-[120px] truncate" title={v} style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* First Candle Metrics */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: "var(--color-muted)" }}>FIRST CANDLE (B0)</div>
        <div className="space-y-1.5">
          {[
            { l: "B0 RANGE", v: sig.B0_Range_Pct !== undefined && sig.B0_Range_Pct !== null ? `${sig.B0_Range_Pct.toFixed(2)}%` : "—", c: "var(--color-text)" },
            { l: "B0 CLOSE STR", v: sig.B0_CloseStr !== undefined && sig.B0_CloseStr !== null ? sig.B0_CloseStr.toFixed(2) : "—", c: "var(--color-text)" },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Context Metrics */}
      <div>
        <div className="font-mono text-[8px] tracking-widest mb-2.5" style={{ color: "var(--color-muted)" }}>CONTEXT</div>
        <div className="space-y-1.5">
          {[
            { l: "PD RANGE", v: sig.PDRange_Pct !== undefined && sig.PDRange_Pct !== null ? `${sig.PDRange_Pct.toFixed(2)}%` : "—", c: "var(--color-text)" },
            { l: "OPEN VS REF", v: sig.Open_vs_Ref !== undefined && sig.Open_vs_Ref !== null ? `${sig.Open_vs_Ref > 0 ? "+" : ""}${sig.Open_vs_Ref.toFixed(2)}%` : "—", c: "var(--color-text)" },
          ].map(({ l, v, c }) => (
            <div key={l} className="flex justify-between items-center">
              <span className="font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>{l}</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: c }}>{v}</span>
            </div>
          ))}
        </div>
        {sig.IsTopMover && (
          <div className="mt-3 inline-flex items-center gap-1 font-mono text-[8px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0, 232, 154, 0.1)", color: "rgba(0, 232, 154, 0.9)", border: "1px solid rgba(0, 232, 154, 0.3)" }}>
            ★ TOP MOVER
          </div>
        )}
      </div>
    </div>
  );
}

const COLUMNS: { key: SortKey; label: string; width: string }[] = [
  { key: "time", label: "TIME", width: "70px" },
  { key: "name", label: "STOCK", width: "160px" },
  { key: "side", label: "SIDE", width: "70px" },
  { key: "rvol", label: "RVOL", width: "80px" },
  { key: "secPress", label: "SEC PRESS", width: "100px" },
  { key: "rsScore", label: "RS SCORE", width: "100px" },
  { key: "composite", label: "COMPOSITE", width: "110px" },
];

export default function SniperClient({ signals }: { signals: SniperRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [bestOnly, setBestOnly] = useState(false);

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== "ALL") rows = rows.filter((r) => r.Direction === filter);
    if (bestOnly) rows = rows.filter((r) => r.IsBestInSector);

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "time": diff = (a.SignalTime || "").localeCompare(b.SignalTime || ""); break;
        case "name": diff = (a.Name || "").localeCompare(b.Name || ""); break;
        case "sector": diff = (a.Sector || "").localeCompare(b.Sector || ""); break;
        case "side": diff = (a.Direction || "").localeCompare(b.Direction || ""); break;
        case "rvol": diff = (a.RVOL || 0) - (b.RVOL || 0); break;
        case "secPress": diff = (a.SectorPressure || 0) - (b.SectorPressure || 0); break;
        case "rsScore": diff = (a.RSScore || 0) - (b.RSScore || 0); break;
        case "composite": diff = (a.CompositeScore || 0) - (b.CompositeScore || 0); break;
        default: diff = (a.CompositeScore || 0) - (b.CompositeScore || 0);
      }
      return sortAsc ? diff : -diff;
    });
    return rows;
  }, [signals, sortKey, sortAsc, filter, bestOnly]);

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!signals.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 absolute inset-0 bg-[var(--color-bg)]">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <TrendingUp size={24} style={{ color: "var(--color-muted)" }} />
        </div>
        <p className="font-mono text-[10px] tracking-widest" style={{ color: "var(--color-muted)" }}>
          NO SNIPER SIGNALS
        </p>
        <p className="text-sm" style={{ color: "var(--color-muted2)" }}>
          No crossover signals for the selected date.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)] absolute inset-0">
      {/* Toolbar */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 border-b shrink-0 flex-wrap"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border)" }}>
          {(["ALL", "LONG", "SHORT"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1 font-mono text-[9px] tracking-widest transition-all"
              style={{
                background: filter === f
                  ? f === "LONG" ? "var(--color-bullbg)" : f === "SHORT" ? "var(--color-bearbg)" : "var(--color-accentbg)"
                  : "transparent",
                color: filter === f
                  ? f === "LONG" ? "var(--color-bull)" : f === "SHORT" ? "var(--color-bear)" : "var(--color-accent)"
                  : "var(--color-muted)",
                borderRight: f !== "SHORT" ? "1px solid var(--color-border)" : "none",
              }}
            >
              {f} {f !== "ALL" && `(${signals.filter((s) => s.Direction === f).length})`}
            </button>
          ))}
        </div>
        
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0 ml-2">
          <input 
            type="checkbox" 
            checked={bestOnly}
            onChange={(e) => setBestOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded-sm border-gray-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span className="font-mono text-[9px] tracking-widest" style={{ color: bestOnly ? "var(--color-accent)" : "var(--color-muted)" }}>
            BEST IN SECTOR
          </span>
        </label>

        <span className="font-mono text-[9px] tracking-widest hidden sm:block" style={{ color: "var(--color-muted)" }}>
          {sorted.length} SIGNALS
        </span>
        <div className="ml-auto font-mono text-[8px] tracking-widest hidden md:block" style={{ color: "var(--color-muted)" }}>
          CLICK ROW FOR DETAILS
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center px-4 py-2 border-b"
          style={{ background: "rgba(10, 14, 23, 0.95)", backdropFilter: "blur(6px)", borderColor: "var(--color-border)", minWidth: "900px" }}
        >
          <div className="w-7 shrink-0" />
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => toggle(col.key)}
              className="font-mono text-[8px] tracking-widest text-left hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{ width: col.width, minWidth: col.width, color: sortKey === col.key ? "var(--color-accent)" : "var(--color-muted)" }}
            >
              {col.label}
              {sortKey === col.key && (
                <span style={{ color: "var(--color-accent)", fontSize: "8px" }}>{sortAsc ? "↑" : "↓"}</span>
              )}
            </button>
          ))}
          <div className="font-mono text-[8px] tracking-widest ml-auto" style={{ color: "var(--color-muted)" }}>
            TV
          </div>
        </div>

        {/* Rows */}
        <div style={{ minWidth: "900px" }}>
          {sorted.map((sig, idx) => {
            const rowId = `${sig.Symbol}-${sig.SignalTime}-${idx}`;
            const isOpen = expanded.has(rowId);
            
            return (
              <div
                key={rowId}
                className="border-b"
                style={{
                  borderColor: "rgba(28,45,69,0.6)",
                  background: isOpen
                    ? "rgba(45,142,255,0.04)"
                    : idx % 2 === 0
                    ? "transparent"
                    : "rgba(255,255,255,0.01)",
                  borderLeft: `2px solid ${sig.RVOL_Color === "GREEN" ? "var(--color-bull)" : sig.RVOL_Color === "ORANGE" ? "var(--color-gold)" : sig.RVOL_Color === "YELLOW" ? "#facc15" : "transparent"}`
                }}
              >
                {/* Main row */}
                <div
                  className="flex items-center px-4 py-2.5 cursor-pointer hover:bg-white/[0.025] transition-colors"
                  onClick={() => toggleRow(rowId)}
                >
                  <div className="w-7 shrink-0 flex items-center justify-center">
                    {isOpen
                      ? <ChevronDown size={12} style={{ color: "var(--color-accent)" }} />
                      : <ChevronRight size={12} style={{ color: "var(--color-muted)" }} />
                    }
                  </div>

                  {/* TIME */}
                  <div style={{ width: "70px", minWidth: "70px" }}>
                    <span className="font-mono text-[11px] tabular-nums" style={{ color: "var(--color-muted2)" }}>
                      {shortTime(sig.SignalTime)}
                    </span>
                  </div>

                  {/* STOCK & SECTOR */}
                  <div style={{ width: "160px", minWidth: "160px" }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[13px] truncate" style={{ color: "var(--color-accent)" }}>
                        {sig.Name}
                      </span>
                      {sig.IsBestInSector && (
                        <span style={{ fontSize: "10px" }} title="Best in Sector">⭐</span>
                      )}
                    </div>
                    <div className="font-mono text-[9px] truncate tracking-[0.05em] mt-0.5" style={{ color: "var(--color-muted)" }}>
                      {sig.Sector}
                    </div>
                  </div>

                  {/* SIDE */}
                  <div style={{ width: "70px", minWidth: "70px" }}>
                    <SideBadge direction={sig.Direction} />
                  </div>

                  {/* RVOL */}
                  <div style={{ width: "80px", minWidth: "80px" }}>
                    <span
                      className="font-mono text-[11px] tabular-nums font-semibold"
                      style={{ color: sig.RVOL >= 1.5 ? "var(--color-gold)" : "var(--color-text)" }}
                    >
                      {sig.RVOL ? `${sig.RVOL.toFixed(2)}x` : "—"}
                    </span>
                  </div>

                  {/* SEC PRESS */}
                  <div style={{ width: "100px", minWidth: "100px" }}>
                    <span
                      className="font-mono text-[11px] tabular-nums"
                      style={{ color: sig.SectorPressure > 0 ? "var(--color-bull)" : sig.SectorPressure < 0 ? "var(--color-bear)" : "var(--color-text)" }}
                    >
                      {sig.SectorPressure !== undefined && sig.SectorPressure !== null ? `${sig.SectorPressure > 0 ? "+" : ""}${sig.SectorPressure.toFixed(2)}` : "—"}
                    </span>
                  </div>

                  {/* RS SCORE */}
                  <div style={{ width: "100px", minWidth: "100px" }}>
                    <span
                      className="font-mono text-[11px] tabular-nums"
                      style={{ color: sig.RSScore > 0 ? "var(--color-bull)" : sig.RSScore < 0 ? "var(--color-bear)" : "var(--color-text)" }}
                    >
                      {sig.RSScore !== undefined && sig.RSScore !== null ? `${sig.RSScore > 0 ? "+" : ""}${sig.RSScore.toFixed(2)}` : "—"}
                    </span>
                  </div>

                  {/* COMPOSITE */}
                  <div style={{ width: "110px", minWidth: "110px" }}>
                    <span className="font-mono text-[12px] font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                      {sig.CompositeScore !== undefined && sig.CompositeScore !== null ? sig.CompositeScore.toFixed(2) : "—"}
                    </span>
                  </div>

                  {/* TV link */}
                  <div className="ml-auto pr-2">
                    {sig.Chart ? (
                      <a
                        href={sig.Chart}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-mono text-[8px] px-2 py-1 rounded transition-all hover:opacity-80"
                        style={{
                          color: "var(--color-accent)",
                          background: "var(--color-accentbg)",
                          border: "1px solid rgba(45,142,255,0.25)",
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
