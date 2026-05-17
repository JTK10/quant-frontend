"use client";

import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { SniperRow } from "@/utils/backend";

type SortKey = "time" | "name" | "sector" | "side" | "rvol" | "rms" | "secPress" | "rsScore" | "composite";

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
      className="inline-flex items-center gap-1 font-mono text-[10px] tracking-widest px-2 py-0.5 rounded"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      <Icon size={10} />
      {label}
    </span>
  );
}

const COLUMNS: { key: SortKey; label: string; width: string; justify: string }[] = [
  { key: "time", label: "TIME", width: "60px", justify: "flex-start" },
  { key: "name", label: "NAME", width: "minmax(180px, 1fr)", justify: "flex-start" },
  { key: "sector", label: "SECTOR", width: "150px", justify: "flex-start" },
  { key: "side", label: "SIDE", width: "80px", justify: "flex-start" },
  { key: "rvol", label: "VOL", width: "80px", justify: "flex-end" },
  { key: "rms", label: "RFAC", width: "80px", justify: "flex-end" },
  { key: "secPress", label: "MKT BIAS", width: "100px", justify: "flex-end" },
  { key: "rsScore", label: "NFAC", width: "100px", justify: "flex-end" },
  { key: "composite", label: "JFAC", width: "100px", justify: "flex-end" },
];

export default function SniperClient({ signals }: { signals: SniperRow[] }) {
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
        case "rms": diff = (a.RMS || 0) - (b.RMS || 0); break;
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
        className="flex items-center gap-4 px-6 py-3 border-b shrink-0 flex-wrap"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--color-border)" }}>
          {(["ALL", "LONG", "SHORT"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-4 py-1.5 font-mono text-[10px] tracking-widest transition-all"
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
        
        <label className="flex items-center gap-2 cursor-pointer shrink-0 ml-4">
          <input 
            type="checkbox" 
            checked={bestOnly}
            onChange={(e) => setBestOnly(e.target.checked)}
            className="w-4 h-4 rounded-sm border-gray-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span className="font-mono text-[10px] tracking-widest" style={{ color: bestOnly ? "var(--color-accent)" : "var(--color-muted)" }}>
            BEST IN SECTOR
          </span>
        </label>

        <span className="font-mono text-[10px] tracking-widest ml-auto" style={{ color: "var(--color-muted)" }}>
          {sorted.length} SIGNALS
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center px-6 py-3 border-b gap-4"
          style={{ background: "rgba(10, 14, 23, 0.95)", backdropFilter: "blur(6px)", borderColor: "var(--color-border)", minWidth: "900px", gridTemplateColumns: COLUMNS.map(c => c.width).join(" ") }}
        >
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => toggle(col.key)}
              className="font-mono text-[9px] tracking-widest hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{ justifyContent: col.justify, color: sortKey === col.key ? "var(--color-accent)" : "var(--color-muted)" }}
            >
              {col.label}
              {sortKey === col.key && (
                <span style={{ color: "var(--color-accent)", fontSize: "9px" }}>{sortAsc ? "↑" : "↓"}</span>
              )}
            </button>
          ))}
        </div>

        {/* Rows */}
        <div style={{ minWidth: "900px" }}>
          {sorted.map((sig, idx) => {
            const rowId = `${sig.Symbol}-${sig.SignalTime}-${idx}`;
            
            return (
              <div
                key={rowId}
                className="grid items-center px-6 py-3.5 border-b hover:bg-white/[0.025] transition-colors gap-4"
                style={{
                  gridTemplateColumns: COLUMNS.map(c => c.width).join(" "),
                  borderColor: "rgba(28,45,69,0.6)",
                  background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                  borderLeft: `3px solid ${sig.RVOL_Color === "GREEN" ? "var(--color-bull)" : sig.RVOL_Color === "ORANGE" ? "var(--color-gold)" : sig.RVOL_Color === "YELLOW" ? "#facc15" : "transparent"}`
                }}
              >
                {/* TIME */}
                <div style={{ justifyContent: COLUMNS[0].justify }} className="flex">
                  <span className="font-mono text-[12px] tabular-nums" style={{ color: "var(--color-muted2)" }}>
                    {shortTime(sig.SignalTime)}
                  </span>
                </div>

                {/* NAME (Clickable TV Link) */}
                <div style={{ justifyContent: COLUMNS[1].justify }} className="flex items-center gap-2 pr-4 min-w-0">
                  {sig.Chart ? (
                    <a 
                      href={sig.Chart} 
                      target="_blank" 
                      rel="noreferrer"
                      className="font-semibold text-[14px] truncate hover:underline" 
                      style={{ color: "var(--color-text2)" }}
                      title={`Open ${sig.Name} in TradingView`}
                    >
                      {sig.Name}
                    </a>
                  ) : (
                    <span className="font-semibold text-[14px] truncate" style={{ color: "var(--color-text2)" }}>
                      {sig.Name}
                    </span>
                  )}
                  {sig.IsBestInSector && (
                    <span style={{ fontSize: "12px", flexShrink: 0 }} title="Best in Sector">⭐</span>
                  )}
                </div>

                {/* SECTOR */}
                <div style={{ justifyContent: COLUMNS[2].justify }} className="flex pr-4 min-w-0">
                  <span className="font-mono text-[10px] tracking-widest truncate" style={{ color: "var(--color-muted)" }}>
                    {sig.Sector}
                  </span>
                </div>

                {/* SIDE */}
                <div style={{ justifyContent: COLUMNS[3].justify }} className="flex">
                  <SideBadge direction={sig.Direction} />
                </div>

                {/* RVOL */}
                <div style={{ justifyContent: COLUMNS[4].justify }} className="flex">
                  <span
                    className="font-mono text-[12px] tabular-nums font-semibold"
                    style={{ color: sig.RVOL >= 1.5 ? "var(--color-gold)" : "var(--color-text)" }}
                  >
                    {sig.RVOL ? `${sig.RVOL.toFixed(2)}x` : "—"}
                  </span>
                </div>

                {/* RMS */}
                <div style={{ justifyContent: COLUMNS[5].justify }} className="flex">
                  <span className="font-mono text-[12px] tabular-nums font-semibold" style={{ color: "var(--color-text)" }}>
                    {sig.RMS ? sig.RMS.toFixed(2) : "—"}
                  </span>
                </div>

                {/* SEC PRESS */}
                <div style={{ justifyContent: COLUMNS[6].justify }} className="flex">
                  <span
                    className="font-mono text-[12px] tabular-nums"
                    style={{ color: sig.SectorPressure > 0 ? "var(--color-bull)" : sig.SectorPressure < 0 ? "var(--color-bear)" : "var(--color-text)" }}
                  >
                    {sig.SectorPressure !== undefined && sig.SectorPressure !== null ? `${sig.SectorPressure > 0 ? "+" : ""}${sig.SectorPressure.toFixed(2)}` : "—"}
                  </span>
                </div>

                {/* RS SCORE */}
                <div style={{ justifyContent: COLUMNS[7].justify }} className="flex">
                  <span
                    className="font-mono text-[12px] tabular-nums"
                    style={{ color: sig.RSScore > 0 ? "var(--color-bull)" : sig.RSScore < 0 ? "var(--color-bear)" : "var(--color-text)" }}
                  >
                    {sig.RSScore !== undefined && sig.RSScore !== null ? `${sig.RSScore > 0 ? "+" : ""}${sig.RSScore.toFixed(2)}` : "—"}
                  </span>
                </div>

                {/* COMPOSITE */}
                <div style={{ justifyContent: COLUMNS[8].justify }} className="flex">
                  <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                    {sig.CompositeScore !== undefined && sig.CompositeScore !== null ? sig.CompositeScore.toFixed(2) : "—"}
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
