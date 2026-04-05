"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { PulseData, PulseRow, PulseWatchlistItem } from "@/utils/backend";

function formatPrice(value: number): string {
  return value ? `₹${value.toFixed(2)}` : "-";
}

/* ── Watchlist Section ──────────────────────────────────────────────────── */

function WatchlistSection({ items }: { items: PulseWatchlistItem[] }) {
  if (!items.length) {
    return (
      <div
        className="rounded-2xl border px-5 py-6 text-center"
        style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.02)" }}
      >
        <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          WATCHLIST
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
          Watchlist will populate once live signals arrive.
        </p>
      </div>
    );
  }

  const longs = items.filter((i) => i.Direction === "LONG");
  const shorts = items.filter((i) => i.Direction === "SHORT");

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
          PCR WATCHLIST
        </div>
        <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: "var(--color-accent)" }}>
          {items.length} SYMBOLS
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const isLong = item.Direction === "LONG";
          return (
            <div
              key={`${item.Symbol}-${item.StoredAt}`}
              className="flex items-center justify-between rounded-xl border px-3 py-2"
              style={{
                borderColor: isLong ? "var(--color-bullborder)" : "var(--color-bearborder)",
                background: isLong ? "var(--color-bullbg)" : "var(--color-bearbg)",
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-xs font-semibold"
                  style={{ color: isLong ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {item.Symbol}
                </span>
                <span
                  className="rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em]"
                  style={{
                    color: isLong ? "var(--color-bull)" : "var(--color-bear)",
                    borderColor: isLong ? "var(--color-bullborder)" : "var(--color-bearborder)",
                  }}
                >
                  {item.Direction}
                </span>
              </div>
              <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
                {item.StoredAt || "-"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-4 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-bull)" }}>
          {longs.length} LONG
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-bear)" }}>
          {shorts.length} SHORT
        </span>
      </div>
    </div>
  );
}

/* ── Pulse List View ────────────────────────────────────────────────────── */

function PulseListHeader() {
  const cell = "font-mono text-[9px] tracking-[0.14em]";
  const muted = { color: "var(--color-muted)" };

  return (
    <div
      className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2"
      style={{
        gridTemplateColumns: "1fr 56px 56px 56px 56px 56px 56px 40px",
        borderColor: "var(--color-border)",
        background: "rgba(248,250,252,0.96)",
        backdropFilter: "blur(6px)",
      }}
    >
      <span className={cell} style={muted}>STOCK</span>
      <span className={`${cell} text-right`} style={muted}>SIDE</span>
      <span className={`${cell} text-right`} style={muted}>PRICE</span>
      <span className={`${cell} text-right`} style={muted}>CONF</span>
      <span className={`${cell} text-right`} style={muted}>RVOL</span>
      <span className={`${cell} text-right`} style={muted}>PCR</span>
      <span className={`${cell} text-right`} style={muted}>BREAK</span>
      <span className={`${cell} text-right`} style={muted}>TV</span>
    </div>
  );
}

function PulseListRow({ row }: { row: PulseRow }) {
  const bullish = row.Side === "BULL";
  const accent = bullish ? "var(--color-bull)" : "var(--color-bear)";

  return (
    <div
      className="grid items-center gap-2 border-b px-3 py-2.5 transition-colors hover:bg-slate-50"
      style={{
        gridTemplateColumns: "1fr 56px 56px 56px 56px 56px 56px 40px",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Stock name + symbol */}
      <div>
        <div className="text-sm font-semibold truncate" style={{ color: "var(--color-text2)" }}>
          {row.Name}
        </div>
        <div className="font-mono text-[10px] tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>
          {row.Symbol || row.Module} · {row.Time || "-"}
        </div>
      </div>

      {/* Side badge */}
      <div className="text-right">
        <span
          className="inline-flex rounded-full border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em]"
          style={{
            color: accent,
            borderColor: bullish ? "var(--color-bullborder)" : "var(--color-bearborder)",
            background: bullish ? "var(--color-bullbg)" : "var(--color-bearbg)",
          }}
        >
          {row.Side}
        </span>
      </div>

      {/* Price */}
      <div className="text-right font-mono text-xs" style={{ color: "var(--color-text2)" }}>
        {formatPrice(row.Price)}
      </div>

      {/* Confidence */}
      <div className="text-right font-mono text-xs" style={{ color: "var(--color-gold)" }}>
        {row.Confidence ? row.Confidence.toFixed(1) : "-"}
      </div>

      {/* RVOL */}
      <div className="text-right font-mono text-xs" style={{ color: "var(--color-text)" }}>
        {row.RVOL ? `${row.RVOL.toFixed(1)}x` : "-"}
      </div>

      {/* PCR */}
      <div
        className="text-right font-mono text-xs"
        style={{
          color: row.PCR < 0.65 ? "var(--color-bull)" : row.PCR > 1.2 ? "var(--color-bear)" : "var(--color-text)",
        }}
      >
        {row.PCR ? row.PCR.toFixed(2) : "-"}
      </div>

      {/* Break */}
      <div className="text-right font-mono text-xs" style={{ color: accent }}>
        {row.Break || "-"}
      </div>

      {/* Chart link */}
      <div className="text-right">
        <a
          href={row.Chart}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 rounded-lg border px-1.5 py-1 font-mono text-[9px] tracking-[0.16em]"
          style={{
            color: "var(--color-accent)",
            borderColor: "rgba(45, 142, 255, 0.35)",
            background: "rgba(45, 142, 255, 0.1)",
          }}
        >
          TV <ExternalLink size={9} />
        </a>
      </div>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div
      className="rounded-2xl border px-6 py-8 text-center"
      style={{ borderColor: "var(--color-border)", background: "rgba(255, 255, 255, 0.02)" }}
    >
      <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
        {title}
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
        No rows available for the selected date.
      </p>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function SignalPulseClient({ data }: { data: PulseData }) {
  const [tab, setTab] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const allRows = [...data.bulls, ...data.bears];
  const displayed = tab === "ALL" ? allRows : tab === "BULL" ? data.bulls : data.bears;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Watchlist sidebar ─────────────────────────────────── */}
      <div
        className="w-[280px] xl:w-[320px] flex-shrink-0 border-r overflow-y-auto p-4"
        style={{ borderColor: "var(--color-border)" }}
      >
        <WatchlistSection items={data.watchlist} />
      </div>

      {/* ── Right: Momentum list ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div
          className="flex items-center gap-2 border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          {(["ALL", "BULL", "BEAR"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className="rounded-xl border px-3 py-1.5 font-mono text-[10px] tracking-[0.18em]"
              style={{
                color:
                  tab === value
                    ? value === "BULL"
                      ? "var(--color-bull)"
                      : value === "BEAR"
                        ? "var(--color-bear)"
                        : "var(--color-accent)"
                    : "var(--color-muted)",
                borderColor:
                  tab === value
                    ? value === "BULL"
                      ? "var(--color-bullborder)"
                      : value === "BEAR"
                        ? "var(--color-bearborder)"
                        : "rgba(45, 142, 255, 0.35)"
                    : "var(--color-border)",
                background:
                  tab === value
                    ? value === "BULL"
                      ? "var(--color-bullbg)"
                      : value === "BEAR"
                        ? "var(--color-bearbg)"
                        : "var(--color-accentbg)"
                    : "var(--color-surface)",
              }}
            >
              {value}
            </button>
          ))}

          <span className="ml-auto font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            {displayed.length} SIGNALS
          </span>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {displayed.length > 0 ? (
            <>
              <PulseListHeader />
              {displayed.map((row, i) => (
                <PulseListRow key={`${row.Symbol}-${row.Time}-${i}`} row={row} />
              ))}
            </>
          ) : (
            <div className="p-6">
              <EmptyState title={tab === "BULL" ? "BULL MOMENTUM" : tab === "BEAR" ? "BEAR MOMENTUM" : "ALL SIGNALS"} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
