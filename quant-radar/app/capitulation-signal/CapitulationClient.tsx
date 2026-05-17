"use client";

import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { CapitulationRow } from "@/utils/backend";

type SortKey = "time" | "name" | "side" | "entry" | "triggers";

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

const COLUMNS: { key: SortKey; label: string; flex: string; justify: string }[] = [
  { key: "time", label: "TIME", flex: "0 0 100px", justify: "flex-start" },
  { key: "name", label: "NAME", flex: "1 1 200px", justify: "flex-start" },
  { key: "side", label: "SIDE", flex: "0 0 120px", justify: "flex-start" },
  { key: "entry", label: "ENTRY PRICE", flex: "0 0 150px", justify: "flex-end" },
  { key: "triggers", label: "EARLY TRIGGERS", flex: "1 1 300px", justify: "flex-start" },
];

export default function CapitulationClient({ signals }: { signals: CapitulationRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== "ALL") rows = rows.filter((r) => r.Direction === filter);

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "time": diff = (a.SignalTime || "").localeCompare(b.SignalTime || ""); break;
        case "name": diff = (a.Name || "").localeCompare(b.Name || ""); break;
        case "side": diff = (a.Direction || "").localeCompare(b.Direction || ""); break;
        case "entry": diff = (a.EntryPrice || 0) - (b.EntryPrice || 0); break;
        case "triggers": diff = (a.Triggers || "").localeCompare(b.Triggers || ""); break;
        default: diff = (a.SignalTime || "").localeCompare(b.SignalTime || "");
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
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <TrendingUp size={24} style={{ color: "var(--color-muted)" }} />
        </div>
        <p className="font-mono text-[10px] tracking-widest" style={{ color: "var(--color-muted)" }}>
          NO REVERSAL SIGNALS
        </p>
        <p className="text-sm" style={{ color: "var(--color-muted2)" }}>
          No early entry setups detected for the selected date.
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

        <span className="font-mono text-[10px] tracking-widest ml-auto" style={{ color: "var(--color-muted)" }}>
          {sorted.length} SIGNALS
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center px-6 py-3 border-b"
          style={{ background: "rgba(10, 14, 23, 0.95)", backdropFilter: "blur(6px)", borderColor: "var(--color-border)", minWidth: "800px" }}
        >
          {COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => toggle(col.key)}
              className="font-mono text-[9px] tracking-widest hover:opacity-80 transition-opacity flex items-center gap-1"
              style={{ flex: col.flex, justifyContent: col.justify, color: sortKey === col.key ? "var(--color-accent)" : "var(--color-muted)" }}
            >
              {col.label}
              {sortKey === col.key && (
                <span style={{ color: "var(--color-accent)", fontSize: "9px" }}>{sortAsc ? "↑" : "↓"}</span>
              )}
            </button>
          ))}
        </div>

        {/* Rows */}
        <div style={{ minWidth: "800px" }}>
          {sorted.map((sig, idx) => {
            const rowId = `${sig.Symbol}-${sig.SignalTime}-${idx}`;
            
            return (
              <div
                key={rowId}
                className="flex items-center px-6 py-3.5 border-b hover:bg-white/[0.025] transition-colors"
                style={{
                  borderColor: "rgba(28,45,69,0.6)",
                  background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                }}
              >
                {/* TIME */}
                <div style={{ flex: COLUMNS[0].flex, justifyContent: COLUMNS[0].justify }} className="flex">
                  <span className="font-mono text-[12px] tabular-nums" style={{ color: "var(--color-muted2)" }}>
                    {shortTime(sig.SignalTime)}
                  </span>
                </div>

                {/* NAME (Clickable TV Link) */}
                <div style={{ flex: COLUMNS[1].flex, justifyContent: COLUMNS[1].justify }} className="flex items-center gap-2 pr-4">
                  {sig.Chart ? (
                    <a 
                      href={sig.Chart} 
                      target="_blank" 
                      rel="noreferrer"
                      className="font-semibold text-[14px] truncate hover:underline" 
                      style={{ color: "var(--color-accent)" }}
                      title={`Open ${sig.Name} in TradingView`}
                    >
                      {sig.Name}
                    </a>
                  ) : (
                    <span className="font-semibold text-[14px] truncate" style={{ color: "var(--color-accent)" }}>
                      {sig.Name}
                    </span>
                  )}
                </div>

                {/* SIDE */}
                <div style={{ flex: COLUMNS[2].flex, justifyContent: COLUMNS[2].justify }} className="flex">
                  <SideBadge direction={sig.Direction} />
                </div>

                {/* ENTRY PRICE */}
                <div style={{ flex: COLUMNS[3].flex, justifyContent: COLUMNS[3].justify }} className="flex">
                  <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
                    {sig.EntryPrice !== undefined && sig.EntryPrice !== null ? sig.EntryPrice.toFixed(2) : "—"}
                  </span>
                </div>

                {/* TRIGGERS */}
                <div style={{ flex: COLUMNS[4].flex, justifyContent: COLUMNS[4].justify }} className="flex pl-8">
                  <span className="font-mono text-[11px] tracking-wide truncate" style={{ color: "var(--color-gold)" }}>
                    {sig.Triggers || "—"}
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
