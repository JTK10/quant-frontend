"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { PulseRow } from "@/utils/backend";

type SortKey = "time" | "name" | "score" | "oflow";

function shortTime(value: string): string {
  if (!value) return "-";
  if (value.includes("T")) return value.slice(11, 16);
  return value.length > 5 ? value.slice(0, 5) : value; // roughly handle HH:MM:SS text
}

function SignalList({ signals, type }: { signals: PulseRow[]; type: "BULL" | "BEAR" }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [ascending, setAscending] = useState(false);

  const sorted = [...signals].sort((a, b) => {
    const cmp = (() => {
      switch (sortKey) {
        case "time":
          return (a.Time || "").localeCompare(b.Time || "");
        case "name":
          return a.Name.localeCompare(b.Name);
        case "score":
          return a.Confidence - b.Confidence;
        case "oflow":
          return (a.PCR || 0) - (b.PCR || 0);
        default:
          return 0;
      }
    })();
    return ascending ? cmp : -cmp;
  });

  const headers: [SortKey, string][] = [
    ["time", "TIME"],
    ["name", "NAME"],
    ["score", "SCORE"],
    ["oflow", "O.FLOW"],
  ];

  const isBull = type === "BULL";
  const headerColor = isBull ? "var(--color-bull)" : "var(--color-bear)";
  const bgAccent = isBull ? "var(--color-bullbg)" : "var(--color-bearbg)";

  return (
    <div className="flex h-full flex-col border-b md:border-b-0 md:border-r last:border-r-0" style={{ borderColor: "var(--color-border)" }}>
      {/* Sub-header */}
      <div
        className="flex items-center justify-between border-b px-4 py-2"
        style={{ borderColor: "var(--color-border)", background: bgAccent }}
      >
        <div className="font-mono text-[10px] font-semibold tracking-[0.2em]" style={{ color: headerColor }}>
          {isBull ? "LONG WATCHLIST" : "SHORT WATCHLIST"}
        </div>
        <div className="font-mono text-[10px]" style={{ color: headerColor }}>
          {signals.length} LISTED
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Table Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-4 py-1.5 grid-cols-[50px_1fr_50px_60px_40px] xl:grid-cols-[60px_1fr_60px_80px_40px] min-w-[350px] xl:min-w-0"
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
                    setAscending(false);
                  }
                }}
                className={`text-left font-mono text-[9px] tracking-[0.14em] ${key === "score" ? "text-right" : ""}`}
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
          <span className="text-right font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
            TV
          </span>
        </div>

        {/* Rows */}
        {sorted.map((row, idx) => (
          <div
            key={`${row.Symbol}-${row.Time}-${idx}`}
            className="grid items-center gap-2 border-b px-4 py-2.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors grid-cols-[50px_1fr_50px_60px_40px] xl:grid-cols-[60px_1fr_60px_80px_40px] min-w-[350px] xl:min-w-0"
            style={{
              borderColor: "var(--color-border)",
            }}
          >
            <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
              {shortTime(row.Time ?? "")}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text2)" }}>
                {row.Name}
              </div>
              <div className="truncate font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
                {row.Symbol}
              </div>
            </div>
            <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-gold)" }}>
              {row.Confidence ? row.Confidence.toFixed(1) : "-"}
            </span>
            <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
              {row.PCR ? row.PCR.toFixed(2) : "-"}
            </span>
            <div className="text-right">
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

export default function WatchlistClient({ signals }: { signals: PulseRow[] }) {
  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            WATCHLIST
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
            No signals for the selected date.
          </p>
        </div>
      </div>
    );
  }

  const bulls = signals.filter((s) => s.Side === "BULL");
  const bears = signals.filter((s) => s.Side === "BEAR");

  return (
    <div className="flex h-full flex-col md:flex-row bg-[var(--color-bg)]">
      <div className="flex-1 overflow-hidden min-w-[300px]">
        <SignalList signals={bulls} type="BULL" />
      </div>
      <div className="flex-1 overflow-hidden min-w-[300px]">
        <SignalList signals={bears} type="BEAR" />
      </div>
    </div>
  );
}
