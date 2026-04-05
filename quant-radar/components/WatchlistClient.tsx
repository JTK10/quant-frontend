"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { PulseRow } from "@/utils/backend";

type SortKey = "time" | "name" | "side" | "score";

export default function WatchlistClient({ signals }: { signals: PulseRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const filtered = signals.filter((s) => filter === "ALL" || s.Side === filter);

  const sorted = [...filtered].sort((a, b) => {
    const cmp = (() => {
      switch (sortKey) {
        case "time":
          return (a.Time || "").localeCompare(b.Time || "");
        case "name":
          return a.Name.localeCompare(b.Name);
        case "side":
          return a.Side.localeCompare(b.Side);
        case "score":
        default:
          return a.Confidence - b.Confidence;
      }
    })();
    return ascending ? cmp : -cmp;
  });

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

  const headers: [SortKey, string][] = [
    ["time", "TIME"],
    ["name", "NAME"],
    ["side", "SIDE"],
    ["score", "SCORE"],
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Filter tabs */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2 md:px-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {(["ALL", "BULL", "BEAR"] as const).map((v) => {
          const active = filter === v;
          const c = v === "BULL" ? "var(--color-bull)" : v === "BEAR" ? "var(--color-bear)" : "var(--color-accent)";
          return (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em]"
              style={{
                color: active ? c : "var(--color-muted)",
                borderColor: active ? `${c}55` : "var(--color-border)",
                background: active ? `${c}12` : "transparent",
              }}
            >
              {v}
            </button>
          );
        })}
        <span className="ml-auto font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          {sorted.length} SIGNALS
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {/* Header row */}
        <div
          className="sticky top-0 z-10 grid items-center gap-1 border-b px-3 py-2 md:px-4"
          style={{
            gridTemplateColumns: "52px 1fr 52px 48px 36px",
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
                  else { setSortKey(key); setAscending(false); }
                }}
                className="text-left font-mono text-[9px] tracking-[0.14em]"
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}{active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
          <span className="font-mono text-[9px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>
            TV
          </span>
        </div>

        {/* Signal rows */}
        {sorted.map((row, idx) => {
          const bull = row.Side === "BULL";
          return (
            <div
              key={`${row.Symbol}-${row.Time}-${idx}`}
              className="grid items-center gap-1 border-b px-3 py-2.5 md:px-4"
              style={{
                gridTemplateColumns: "52px 1fr 52px 48px 36px",
                borderColor: "var(--color-border)",
              }}
            >
              {/* TIME */}
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {row.Time || "-"}
              </span>

              {/* NAME */}
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text2)" }}>
                  {row.Name}
                </div>
                <div className="truncate font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
                  {row.Symbol}
                </div>
              </div>

              {/* SIDE */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em]"
                style={{
                  color: bull ? "var(--color-bull)" : "var(--color-bear)",
                  borderColor: bull ? "var(--color-bullborder)" : "var(--color-bearborder)",
                  background: bull ? "var(--color-bullbg)" : "var(--color-bearbg)",
                }}
              >
                {bull ? "BUY" : "SELL"}
              </span>

              {/* SCORE */}
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-gold)" }}>
                {row.Confidence ? row.Confidence.toFixed(1) : "-"}
              </span>

              {/* TV LINK */}
              <div className="text-right">
                <a
                  href={row.Chart}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md border p-1"
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
          );
        })}
      </div>
    </div>
  );
}
