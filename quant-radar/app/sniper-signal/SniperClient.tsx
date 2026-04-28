"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { SniperRow } from "@/utils/backend";

type SortKey = "time" | "name" | "rvol" | "composite" | "trigger";

function shortTime(value: string): string {
  if (!value) return "-";
  if (value.includes("T")) return value.slice(11, 16);
  return value.length > 5 ? value.slice(0, 5) : value;
}

function SignalList({ signals, type }: { signals: SniperRow[]; type: "LONG" | "SHORT" }) {
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [ascending, setAscending] = useState(false);
  const [bestOnly, setBestOnly] = useState(false);

  const filtered = bestOnly ? signals.filter(s => s.IsBestInSector) : signals;

  const sorted = [...filtered].sort((a, b) => {
    const cmp = (() => {
      switch (sortKey) {
        case "time":
          return (a.SignalTime || "").localeCompare(b.SignalTime || "");
        case "name":
          return a.Name.localeCompare(b.Name);
        case "rvol":
          return (a.RVOL || 0) - (b.RVOL || 0);
        case "composite":
          return (a.CompositeScore || 0) - (b.CompositeScore || 0);
        case "trigger":
          return (a.TriggerMode || "").localeCompare(b.TriggerMode || "");
        default:
          return 0;
      }
    })();
    return ascending ? cmp : -cmp;
  });

  const headers: [SortKey, string][] = [
    ["time", "TIME"],
    ["name", "NAME"],
    ["trigger", "TRIGGER"],
    ["composite", "COMP"],
    ["rvol", "RVOL"],
  ];

  const isBull = type === "LONG";
  const headerColor = isBull ? "var(--color-bull)" : "var(--color-bear)";
  const bgAccent = isBull ? "var(--color-bullbg)" : "var(--color-bearbg)";

  return (
    <div className="flex h-full flex-col border-b md:border-b-0 md:border-r last:border-r-0" style={{ borderColor: "var(--color-border)" }}>
      {/* Sub-header */}
      <div
        className="flex items-center justify-between border-b px-4 py-2 sticky top-0 z-20"
        style={{ borderColor: "var(--color-border)", background: bgAccent }}
      >
        <div className="flex items-center gap-3">
          <div className="font-mono text-[10px] font-semibold tracking-[0.2em]" style={{ color: headerColor }}>
            {isBull ? "BULLISH CROSSOVERS" : "BEARISH CROSSOVERS"}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input 
              type="checkbox" 
              checked={bestOnly}
              onChange={(e) => setBestOnly(e.target.checked)}
              className="w-3 h-3 rounded-sm border-gray-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span className="font-mono text-[9px] tracking-[0.1em]" style={{ color: bestOnly ? headerColor : "var(--color-muted)" }}>
              BEST IN SECTOR
            </span>
          </label>
        </div>
        <div className="font-mono text-[10px]" style={{ color: headerColor }}>
          {filtered.length} LISTED
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Table Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-4 py-1.5 grid-cols-[40px_minmax(80px,1fr)_minmax(80px,1fr)_40px_40px_20px] xl:grid-cols-[60px_minmax(120px,1fr)_minmax(120px,1fr)_60px_60px_30px] min-w-[400px] xl:min-w-0"
          style={{
            borderColor: "var(--color-border)",
            background: "rgba(10, 14, 23, 0.95)",
            backdropFilter: "blur(6px)",
          }}
        >
          {headers.map(([key, label]) => {
            const active = sortKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (sortKey === key) setAscending((c) => !c);
                  else {
                    setSortKey(key);
                    setAscending(key === "name"); // default to ascending for name, desc for values
                  }
                }}
                className={`text-left font-mono text-[9px] tracking-[0.14em] ${key === "rvol" || key === "composite" ? "text-right" : ""}`}
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
          <span className="text-right font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
          </span>
        </div>

        {/* Rows */}
        {sorted.map((row, idx) => (
          <div
            key={`${row.Symbol}-${row.SignalTime}-${idx}`}
            className="grid items-center gap-2 border-b px-4 py-2.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors grid-cols-[40px_minmax(80px,1fr)_minmax(80px,1fr)_40px_40px_20px] xl:grid-cols-[60px_minmax(120px,1fr)_minmax(120px,1fr)_60px_60px_30px] min-w-[400px] xl:min-w-0"
            style={{
              borderColor: "var(--color-border)",
              borderLeft: `2px solid ${row.RVOL_Color === "GREEN" ? "var(--color-bull)" : row.RVOL_Color === "ORANGE" ? "var(--color-gold)" : row.RVOL_Color === "YELLOW" ? "#facc15" : "transparent"}`
            }}
          >
            <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
              {shortTime(row.SignalTime ?? "")}
            </span>
            <div className="min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1.5">
                <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text2)" }}>
                  {row.Name}
                </div>
                {row.IsBestInSector && (
                  <span className="shrink-0 text-[10px]" title="Best in Sector">⭐</span>
                )}
              </div>
              <div className="truncate font-mono text-[9px] tracking-[0.05em]" style={{ color: "var(--color-muted)" }}>
                {row.Symbol} <span className="opacity-50">| IN: ₹{row.EntryPrice}</span>
              </div>
            </div>

            <div className="min-w-0 flex flex-col justify-center">
              <span className="truncate font-mono text-[9px] tracking-[0.05em]" style={{ color: "var(--color-text)" }} title={row.TriggerMode}>
                {row.TriggerMode || "-"}
              </span>
            </div>
            
            <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
               {row.CompositeScore ? row.CompositeScore.toFixed(1) : "-"}
            </span>

            <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
               {row.RVOL ? row.RVOL.toFixed(1) + "x" : "-"}
            </span>

            <div className="text-right flex items-center justify-end">
              <a
                href={row.Chart}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border p-1 opacity-80 hover:opacity-100 transition-opacity"
                style={{
                  color: "var(--color-accent)",
                  borderColor: "rgba(45,142,255,0.20)",
                  background: "rgba(45,142,255,0.06)",
                }}
              >
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="p-8 text-center font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
            NO SIGNALS
          </div>
        )}
      </div>
    </div>
  );
}

export default function SniperClient({ signals }: { signals: SniperRow[] }) {
  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8 bg-[var(--color-bg)]">
        <div className="text-center">
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            SNIPER SIGNAL
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
            No crossover signals for the selected date.
          </p>
        </div>
      </div>
    );
  }

  const longs = signals.filter((s) => s.Direction === "LONG");
  const shorts = signals.filter((s) => s.Direction === "SHORT");

  return (
    <div className="flex h-full flex-col md:flex-row bg-[var(--color-bg)] absolute inset-0">
      <div className="flex-1 overflow-hidden min-w-[320px] relative">
        <SignalList signals={longs} type="LONG" />
      </div>
      <div className="flex-1 overflow-hidden min-w-[320px] relative border-t md:border-t-0 md:border-l" style={{ borderColor: "var(--color-border)" }}>
        <SignalList signals={shorts} type="SHORT" />
      </div>
    </div>
  );
}
