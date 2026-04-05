"use client";

import { ExternalLink } from "lucide-react";
import { Fragment, useState } from "react";
import type { RadarSignal } from "@/utils/backend";

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
  const [expanded, setExpanded] = useState<string | null>(null);

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
          className="sticky top-0 z-10 grid items-center gap-1 border-b px-3 py-2 md:px-4"
          style={{
            gridTemplateColumns: "52px 1fr 68px 52px 48px 48px 36px",
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
          const isOpen = expanded === rowId;
          const isBull = signal.Side === "BULL";
          const bt = breakLabel(signal.BreakType);

          return (
            <Fragment key={rowId}>
              <div
                onClick={() => setExpanded((c) => (c === rowId ? null : rowId))}
                className="grid cursor-pointer items-center gap-1 border-b px-3 py-2.5 transition-colors md:px-4"
                style={{
                  gridTemplateColumns: "52px 1fr 68px 52px 48px 48px 36px",
                  borderColor: isOpen ? "transparent" : "var(--color-border)",
                  background: isOpen ? "rgba(45, 142, 255, 0.04)" : "transparent",
                }}
              >
                {/* TIME */}
                <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                  {shortTime(signal.FiredAt || signal.EntryTime)}
                </span>

                {/* NAME + symbol */}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-text2)" }}>
                    {signal.Name}
                  </div>
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
                    onClick={(e) => e.stopPropagation()}
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

              {/* ── Expanded detail ─────────────────────────────────── */}
              {isOpen && (
                <div
                  className="border-b px-3 pb-4 pt-2 md:px-4"
                  style={{ borderColor: "var(--color-border)", background: "rgba(45, 142, 255, 0.02)" }}
                >
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <DetailCell label="ENTRY" value={signal.Entry ? `₹${signal.Entry.toFixed(2)}` : "-"} color="var(--color-text2)" />
                    <DetailCell label="STOP" value={signal.SL ? `₹${signal.SL.toFixed(2)}` : "-"} color="var(--color-bear)" />
                    <DetailCell label="TARGET 1" value={signal.Target1 ? `₹${signal.Target1.toFixed(2)}` : "-"} color="var(--color-bull)" />
                    <DetailCell label="R:R" value={signal.RR || "-"} color="var(--color-text)" />
                    <DetailCell label="O.FLOW" value={signal.PCR ? signal.PCR.toFixed(2) : "-"} color="var(--color-text)" />
                    <DetailCell label="RVOL" value={signal.RVOL ? `${signal.RVOL.toFixed(1)}x` : "-"} color="var(--color-text)" />
                    <DetailCell label="SECTOR" value={signal.Sector || "-"} color="var(--color-accent)" />
                    <DetailCell
                      label="MOVE"
                      value={signal.DayMovePct ? `${signal.DayMovePct > 0 ? "+" : ""}${signal.DayMovePct.toFixed(2)}%` : "-"}
                      color={signal.DayMovePct > 0 ? "var(--color-bull)" : signal.DayMovePct < 0 ? "var(--color-bear)" : "var(--color-muted)"}
                    />
                  </div>
                  {signal.Notes && (
                    <p className="mt-2 font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
                      {signal.Notes}
                    </p>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function DetailCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--color-border)" }}>
      <div className="font-mono text-[8px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
