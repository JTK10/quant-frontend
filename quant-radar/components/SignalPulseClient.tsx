"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { PulseData, PulseRow, PulseWatchlistItem } from "@/utils/backend";

function formatPrice(value: number): string {
  return value ? `₹${value.toFixed(2)}` : "-";
}

/* ── Watchlist ────────────────────────────────────────────────────────── */

function WatchlistSection({ items }: { items: PulseWatchlistItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border px-4 py-5 text-center" style={{ borderColor: "var(--color-border)" }}>
        <div className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          WATCHLIST
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--color-muted2)" }}>
          Watchlist populates once live signals arrive.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[8px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          PCR WATCHLIST
        </span>
        <span className="font-mono text-[8px] tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
          {items.length}
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const isLong = item.Direction === "LONG";
          return (
            <div
              key={`${item.Symbol}-${item.StoredAt}`}
              className="flex items-center justify-between rounded-lg border px-2.5 py-1.5"
              style={{
                borderColor: isLong ? "var(--color-bullborder)" : "var(--color-bearborder)",
                background: isLong ? "var(--color-bullbg)" : "var(--color-bearbg)",
              }}
            >
              <span
                className="font-mono text-[11px] font-semibold"
                style={{ color: isLong ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {item.Symbol}
              </span>
              <span
                className="font-mono text-[8px] tracking-[0.14em]"
                style={{ color: isLong ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {item.Direction}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Pulse Row ────────────────────────────────────────────────────────── */

function PulseRow({ row }: { row: PulseRow }) {
  const bull = row.Side === "BULL";
  return (
    <div
      className="grid items-center gap-1 border-b px-3 py-2 md:px-4"
      style={{
        gridTemplateColumns: "1fr 48px 48px 48px 36px",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="min-w-0">
        <div className="truncate text-[12px] font-semibold" style={{ color: "var(--color-text2)" }}>
          {row.Name}
        </div>
        <div className="truncate font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
          {row.Symbol} · {row.Time || "-"}
        </div>
      </div>

      <span
        className="inline-flex justify-center rounded-md border px-1 py-0.5 font-mono text-[8px] tracking-[0.14em]"
        style={{
          color: bull ? "var(--color-bull)" : "var(--color-bear)",
          borderColor: bull ? "var(--color-bullborder)" : "var(--color-bearborder)",
          background: bull ? "var(--color-bullbg)" : "var(--color-bearbg)",
        }}
      >
        {bull ? "BUY" : "SELL"}
      </span>

      <span className="text-right font-mono text-[10px]" style={{ color: "var(--color-gold)" }}>
        {row.Confidence ? row.Confidence.toFixed(1) : "-"}
      </span>

      <span className="text-right font-mono text-[10px]" style={{ color: "var(--color-text)" }}>
        {row.PCR ? row.PCR.toFixed(2) : "-"}
      </span>

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
          <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────── */

export default function SignalPulseClient({ data }: { data: PulseData }) {
  const [tab, setTab] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const allRows = [...data.bulls, ...data.bears];
  const displayed = tab === "ALL" ? allRows : tab === "BULL" ? data.bulls : data.bears;

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row">
      {/* Watchlist */}
      <div
        className="w-full border-b md:w-[260px] md:flex-shrink-0 md:border-b-0 md:border-r overflow-y-auto p-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <WatchlistSection items={data.watchlist} />
      </div>

      {/* Signal list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          {(["ALL", "BULL", "BEAR"] as const).map((v) => {
            const active = tab === v;
            const c = v === "BULL" ? "var(--color-bull)" : v === "BEAR" ? "var(--color-bear)" : "var(--color-accent)";
            return (
              <button
                key={v}
                type="button"
                onClick={() => setTab(v)}
                className="rounded-lg border px-2 py-1 font-mono text-[9px] tracking-[0.18em]"
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
          <span className="ml-auto font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            {displayed.length}
          </span>
        </div>

        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-1 border-b px-3 py-1.5 md:px-4"
          style={{
            gridTemplateColumns: "1fr 48px 48px 48px 36px",
            borderColor: "var(--color-border)",
            background: "rgba(10,14,23,0.95)",
          }}
        >
          <span className="font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>NAME</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-center" style={{ color: "var(--color-muted)" }}>SIDE</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>SCORE</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>PCR</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>TV</span>
        </div>

        <div className="flex-1 overflow-auto">
          {displayed.length > 0 ? (
            displayed.map((row, i) => <PulseRow key={`${row.Symbol}-${row.Time}-${i}`} row={row} />)
          ) : (
            <div className="flex items-center justify-center p-8">
              <p className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
                No signals for this filter.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
