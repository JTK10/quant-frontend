"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { RadarSignal } from "@/utils/backend";
import { buildTradingViewUrl } from "@/utils/backend";

type SortKey = "time" | "name" | "break" | "side" | "score" | "rank" | "oflow";

function shortTime(value: string): string {
  if (!value) return "-";
  if (value.includes("T")) return value.slice(11, 16);
  return value.length > 5 ? value.slice(0, 5) : value;
}

function breakLabel(bt: string): "DIRECT" | "RETEST" | "-" {
  if (!bt || bt === "INSIDE") return "-";
  return bt.toUpperCase().includes("RETEST") ? "RETEST" : "DIRECT";
}

export default function SmartRadarTable({ signals }: { signals: RadarSignal[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const filtered = signals.filter((s) => filter === "ALL" || s.Side === filter);

  const sorted = [...filtered].sort((a, b) => {
    const cmp = (() => {
      switch (sortKey) {
        case "time":
          return (a.FiredAt || a.EntryTime).localeCompare(b.FiredAt || b.EntryTime);
        case "name":
          return a.Name.localeCompare(b.Name);
        case "break":
          return (a.BreakType || "").localeCompare(b.BreakType || "");
        case "side":
          return a.Side.localeCompare(b.Side);
        case "score":
          return a.Confidence - b.Confidence;
        case "oflow":
          return (a.PCR || 0) - (b.PCR || 0);
        case "rank":
        default:
          return a.SignalRank - b.SignalRank;
      }
    })();
    return ascending ? cmp : -cmp;
  });

  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            SMART RADAR
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No signals for the selected date.
          </p>
        </div>
      </div>
    );
  }

  const headers: [SortKey, string][] = [
    ["time", "TIME"],
    ["name", "NAME"],
    ["break", "TYPE"],
    ["side", "SIDE"],
    ["score", "SCORE"],
    ["oflow", "O.FLOW"],
  ];

  return (
    <div className="flex h-full flex-col">
      {/* ── Filter bar ─────────────────────────────────────────────── */}
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

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[60px_1fr_75px_60px_60px_60px_40px] lg:grid-cols-[80px_1fr_100px_80px_80px_80px_50px] min-w-[600px] lg:min-w-0"
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
        {sorted.map((signal, idx) => {
          const rowId = `${signal.Symbol || signal.Name}-${signal.FiredAt}-${idx}`;
          const isBull = signal.Side === "BULL";
          const bt = breakLabel(signal.BreakType);

          return (
              <div
                key={rowId}
                className="grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[60px_1fr_75px_60px_60px_60px_40px] lg:grid-cols-[80px_1fr_100px_80px_80px_80px_50px] min-w-[600px] lg:min-w-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* TIME */}
                <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                  {shortTime(signal.FiredAt || signal.EntryTime)}
                </span>

                {/* NAME + symbol — inline TradingView link */}
                <div className="min-w-0">
                  <a
                    href={signal.Chart || buildTradingViewUrl(signal.Symbol, signal.Name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[13px] font-semibold hover:underline block"
                    style={{ color: "var(--color-text2)" }}
                  >
                    {signal.Name}
                  </a>
                  <div
                    className="truncate font-mono text-[9px] tracking-[0.14em]"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {signal.Symbol}
                  </div>
                </div>

                {/* BREAK TYPE */}
                {bt !== "-" ? (
                  <span
                    className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em]"
                    style={{
                      color: bt === "RETEST" ? "var(--color-purple)" : "var(--color-gold)",
                      borderColor: bt === "RETEST" ? "rgba(168,85,247,0.25)" : "rgba(245,158,11,0.25)",
                      background: bt === "RETEST" ? "rgba(168,85,247,0.08)" : "rgba(245,158,11,0.08)",
                    }}
                  >
                    {bt}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-center" style={{ color: "var(--color-muted)" }}>
                    -
                  </span>
                )}

                {/* SIDE */}
                <span
                  className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em]"
                  style={{
                    color: isBull ? "var(--color-bull)" : "var(--color-bear)",
                    borderColor: isBull ? "var(--color-bullborder)" : "var(--color-bearborder)",
                    background: isBull ? "var(--color-bullbg)" : "var(--color-bearbg)",
                  }}
                >
                  {signal.Side === "BULL" ? "BUY" : "SELL"}
                </span>

                {/* SCORE */}
                <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-gold)" }}>
                  {signal.Confidence.toFixed(1)}
                </span>

                {/* O.FLOW */}
                <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
                  {signal.PCR ? signal.PCR.toFixed(2) : "-"}
                </span>

                {/* TV LINK */}
                <div className="text-right">
                  <a
                    href={signal.Chart}
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

