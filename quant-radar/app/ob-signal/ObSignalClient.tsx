"use client";

import { ExternalLink } from "lucide-react";
import { useState, useMemo } from "react";
import type { ObSignalRow } from "@/utils/backend";

type SortKey = "time" | "name" | "side" | "score" | "entry" | "brk" | "pen" | "gap" | "rms" | "sector";

function shortTime(value: string): string {
  if (!value) return "-";
  if (value.includes("T")) return value.slice(11, 16);
  return value.length > 5 ? value.slice(0, 5) : value;
}

function scoreStars(score: number): string {
  if (score >= 7) return "⭐⭐⭐";
  if (score >= 5) return "⭐⭐";
  if (score >= 4) return "⭐";
  return "";
}

export default function ObSignalClient({ signals }: { signals: ObSignalRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const sorted = useMemo(() => {
    let rows = [...signals];
    if (filter !== "ALL") rows = rows.filter((r) => r.Side === filter);

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "time": diff = a.SignalTime.localeCompare(b.SignalTime); break;
        case "name": diff = a.Name.localeCompare(b.Name); break;
        case "side": diff = a.Side.localeCompare(b.Side); break;
        case "score": diff = a.Score - b.Score; break;
        case "entry": diff = a.Entry - b.Entry; break;
        case "brk": diff = a.PDL_Brk_Pct - b.PDL_Brk_Pct; break;
        case "pen": diff = a.OB_Pen_Pct - b.OB_Pen_Pct; break;
        case "gap": diff = a.Gap_Pct - b.Gap_Pct; break;
        case "rms": diff = a.RMS - b.RMS; break;
        case "sector": diff = a.Sector_RMS_Rank - b.Sector_RMS_Rank; break;
        default: diff = a.Score - b.Score;
      }
      return ascending ? diff : -diff;
    });
    return rows;
  }, [signals, sortKey, ascending, filter]);

  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            PRECISION RADAR
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No precision signals for the selected date.
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            Precision signals generate during 09:25 – 10:00 AM IST
          </p>
        </div>
      </div>
    );
  }

  const headers: [SortKey, string][] = [
    ["time", "TIME"],
    ["name", "NAME"],
    ["side", "SIDE"],
    ["entry", "ENTRY"],
    ["rms", "SCORE"],
    ["brk", "BRK%"],
    ["pen", "ZONE PEN%"],
    ["gap", "GAP%"],
    ["sector", "SECTOR"],
    ["score", "RATING"],
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {(["ALL", "BULL", "BEAR"] as const).map((v) => {
          const active = filter === v;
          const c =
            v === "BULL" ? "var(--color-bull)" : v === "BEAR" ? "var(--color-bear)" : "var(--color-accent)";
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

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[55px_1fr_55px_70px_55px_62px_62px_62px_minmax(90px,1fr)_75px_36px] min-w-[800px]"
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
                  else { setSortKey(key); setAscending(false); }
                }}
                className="text-left font-mono text-[9px] tracking-[0.14em]"
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
          <span className="font-mono text-[9px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>
            TV
          </span>
        </div>

        {/* Rows */}
        {sorted.map((sig, idx) => {
          const rowId = `${sig.Symbol || sig.Name}-${sig.FiredAt}-${idx}`;
          const isBull = sig.Side === "BULL";
          const refLabel = isBull ? "PDH" : "PDL";
          const refPrice = isBull ? sig.PDH : sig.PDL;

          return (
            <div
              key={rowId}
              className="grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[55px_1fr_55px_70px_55px_62px_62px_62px_minmax(90px,1fr)_75px_36px] min-w-[800px]"
              style={{ borderColor: "var(--color-border)" }}
            >
              {/* TIME */}
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {shortTime(sig.SignalTime || sig.FiredAt)}
              </span>

              {/* NAME */}
              <div className="min-w-0">
                <a
                  href={sig.Chart}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[13px] font-semibold hover:underline block"
                  style={{ color: "var(--color-text2)" }}
                >
                  {sig.Name}
                </a>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="truncate font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
                    {sig.Symbol}
                  </span>
                  <span className="font-mono text-[8px] tracking-[0.1em]" style={{ color: "var(--color-muted)" }}>
                    {refLabel} ₹{refPrice.toFixed(0)} · ZONE {sig.OB_Date}
                  </span>
                </div>
              </div>

              {/* SIDE */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em]"
                style={{
                  color: isBull ? "var(--color-bull)" : "var(--color-bear)",
                  borderColor: isBull ? "var(--color-bullborder)" : "var(--color-bearborder)",
                  background: isBull ? "var(--color-bullbg)" : "var(--color-bearbg)",
                }}
              >
                {isBull ? "BUY" : "SELL"}
              </span>

              {/* ENTRY */}
              <span className="font-mono text-[11px] tabular-nums font-semibold" style={{ color: "var(--color-text2)" }}>
                ₹{sig.Entry.toFixed(2)}
              </span>

              {/* BRK% */}
              <span
                className="text-right font-mono text-[11px] tabular-nums"
                style={{ color: sig.PDL_Brk_Pct >= 1.5 ? (isBull ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)" }}
              >
                {sig.PDL_Brk_Pct.toFixed(2)}%
              </span>

              {/* RMS */}
              <span
                className="text-right font-mono text-[11px] tabular-nums font-semibold"
                style={{ color: sig.RMS >= 3 ? "var(--color-gold)" : sig.RMS >= 1 ? "var(--color-text2)" : "var(--color-muted)" }}
              >
                {sig.RMS > 0 ? sig.RMS.toFixed(1) : "-"}
              </span>

              {/* OB PEN% */}
              <span
                className="text-right font-mono text-[11px] tabular-nums font-semibold"
                style={{ color: sig.OB_Pen_Pct >= 7 ? "var(--color-gold)" : "var(--color-text)" }}
              >
                {sig.OB_Pen_Pct.toFixed(2)}%
              </span>

              {/* GAP% */}
              <span
                className="text-right font-mono text-[11px] tabular-nums"
                style={{
                  color: sig.Gap_Pct > 0 ? "var(--color-bull)" : sig.Gap_Pct < 0 ? "var(--color-bear)" : "var(--color-muted)",
                }}
              >
                {sig.Gap_Pct >= 0 ? "+" : ""}{sig.Gap_Pct.toFixed(2)}%
              </span>

              {/* SECTOR + RANK */}
              <div className="min-w-0">
                {sig.Sector ? (
                  <>
                    <span className="truncate font-mono text-[10px] block" style={{ color: "var(--color-text2)" }}>
                      {sig.Sector}
                    </span>
                    <span
                      className="font-mono text-[8px] tracking-[0.1em]"
                      style={{ color: sig.Sector_RMS_Rank <= 3 ? "var(--color-gold)" : "var(--color-muted)" }}
                    >
                      #{sig.Sector_RMS_Rank}/{sig.Sector_Size} RMS
                    </span>
                  </>
                ) : (
                  <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>-</span>
                )}
              </div>

              {/* SCORE */}
              <div className="flex items-center justify-end gap-1.5">
                <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color: "var(--color-gold)" }}>
                  {sig.Score.toFixed(1)}
                </span>
                <span className="text-[9px]">{scoreStars(sig.Score)}</span>
              </div>

              {/* TV */}
              <div className="text-right">
                <a
                  href={sig.Chart}
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
