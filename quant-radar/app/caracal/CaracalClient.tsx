"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

const EVENT_STYLE: Record<string, { color: string; label: string }> = {
  ENTRY:   { color: "#f59e0b", label: "ENTRY" },
  CONFIRM: { color: "#10b981", label: "CONFIRM" },
  TIER_Q:  { color: "#fbbf24", label: "TIER-Q ★" },
  SCRATCH: { color: "#ef4444", label: "SCRATCH" },
  DEMOTE:  { color: "#9ca3af", label: "DEMOTE" },
};

const TIER_STYLE: Record<string, string> = {
  "CAR-A":  "#f59e0b",
  "CAR-B":  "#8b5cf6",
  "CAR-Qc": "#38bdf8",
  "CAR-Q":  "#fbbf24",
  "CAR-Qx": "#6b7280",
  "OOS":    "#10b981",
};

export default function CaracalClient({ signals }: { signals: any[] }) {
  const [sortKey, setSortKey] = useState<string>("time");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [tierFilter, setTierFilter] = useState<"ALL" | "A" | "Q" | "B" | "OOS">("ALL");

  const filtered = useMemo(() => {
    let f = signals;
    if (filter !== "ALL") f = f.filter((s) => s.side === filter);
    if (tierFilter !== "ALL") {
      f = f.filter((s) => {
        const cap = String(s.cap || "");
        if (tierFilter === "A") return cap === "CAR-A";
        if (tierFilter === "B") return cap === "CAR-B";
        if (tierFilter === "OOS") return cap === "OOS";
        return cap === "CAR-Q" || cap === "CAR-Qc" || cap === "CAR-Qx";
      });
    }

    return [...f].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "time":
            return (a.time || "").localeCompare(b.time || "");
          case "name":
            return (a.name || "").localeCompare(b.name || "");
          case "event":
            return (a.event || "").localeCompare(b.event || "");
          case "cap":
            return String(a.cap || "").localeCompare(String(b.cap || ""));
          case "surge":
            return (a.surge || 0) - (b.surge || 0);
          case "entry":
            return (a.entry || 0) - (b.entry || 0);
          case "roughtgt_pct":
            return (a.roughtgt_pct || 0) - (b.roughtgt_pct || 0);
          case "st_aligned":
            return Number(!!a.st_aligned) - Number(!!b.st_aligned);
          default:
            return 0;
        }
      })();
      return ascending ? cmp : -cmp;
    });
  }, [signals, filter, tierFilter, sortKey, ascending]);

  const headers: [string, string][] = [
    ["time", "TIME"],
    ["event", "EVENT"],
    ["side", "SIDE"],
    ["name", "NAME"],
    ["cap", "TIER"],
    ["surge", "RVOL"],
    ["entry", "ENTRY"],
    ["roughtgt_pct", "TGT%"],
    ["st_aligned", "TREND"],
    ["detail", "DETAIL"],
  ];

  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            CARACAL
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No signals for the selected date.
          </p>
          <p className="mt-1 font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
            The caracal waits for the prey to commit.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Filter bar ─────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {(["ALL", "LONG", "SHORT"] as const).map((v) => {
          const active = filter === v;
          const c =
            v === "LONG" ? "var(--color-bull)" : v === "SHORT" ? "var(--color-bear)" : "#f59e0b";
          return (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
              style={{
                color: active ? c : "var(--color-muted)",
                borderColor: active ? `${c}55` : "var(--color-border)",
                background: active ? `${c}12` : "transparent",
                boxShadow: active ? `0 0 10px ${c}20` : "none",
              }}
            >
              {v}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px" style={{ background: "var(--color-border)" }} />

        {(["ALL", "A", "Q", "B", "OOS"] as const).map((v) => {
          const active = tierFilter === v;
          const c = v === "A" ? "#f59e0b" : v === "Q" ? "#fbbf24" : v === "B" ? "#8b5cf6" : v === "OOS" ? "#10b981" : "#9ca3af";
          return (
            <button
              key={`tier-${v}`}
              type="button"
              onClick={() => setTierFilter(v)}
              className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
              style={{
                color: active ? c : "var(--color-muted)",
                borderColor: active ? `${c}55` : "var(--color-border)",
                background: active ? `${c}12` : "transparent",
                boxShadow: active ? `0 0 10px ${c}20` : "none",
              }}
            >
              {v === "ALL" ? "ALL TIERS" : v === "OOS" ? "OOS" : `TIER ${v}`}
            </button>
          );
        })}

        <span className="ml-auto font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          {filtered.length} EVENTS
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[52px_78px_50px_1fr_66px_52px_62px_74px_60px_1.2fr] min-w-[1040px]"
          style={{
            borderColor: "var(--color-border)",
            background: "rgba(10, 14, 23, 0.95)",
            backdropFilter: "blur(6px)",
          }}
        >
          {headers.map(([key, label], idx) => {
            const active = sortKey === key;
            const isRightAligned = idx === 5 || idx === 6 || idx === 7;
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
                className={`whitespace-nowrap font-mono text-[9px] tracking-[0.14em] ${isRightAligned ? "text-right" : "text-left"}`}
                style={{ color: active ? "#f59e0b" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {filtered.map((signal, idx) => {
          const rowId = `${signal.name}-${signal.time}-${signal.event}-${idx}`;
          const isLong = signal.side === "LONG";
          const time = (signal.time || "--:--").substring(0, 5);
          const ev = EVENT_STYLE[signal.event] || { color: "#9ca3af", label: signal.event || "--" };
          const cap = String(signal.cap || "--");
          const tierColor = TIER_STYLE[cap] || "#9ca3af";
          const rvol = typeof signal.surge === "number" && signal.surge > 0 ? signal.surge.toFixed(1) : "--";
          const entry = typeof signal.entry === "number" && signal.entry > 0 ? signal.entry.toFixed(2) : "--";
          const isTierQ = signal.event === "TIER_Q";
          const roughtgt = typeof signal.roughtgt_pct === "number" ? `${signal.roughtgt_pct.toFixed(1)}%` : "--";
          const stKnown = signal.st_trend === "UP" || signal.st_trend === "DN";
          const stColor = !stKnown ? "#6b7280" : signal.st_aligned ? "var(--color-bull)" : "#9ca3af";

          return (
            <div
              key={rowId}
              className="grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[52px_78px_50px_1fr_66px_52px_62px_74px_60px_1.2fr] min-w-[1040px] hover:bg-[#ffffff04] transition-colors"
              style={{
                borderColor: "var(--color-border)",
                background: isTierQ ? "rgba(251,191,36,0.05)" : "transparent",
              }}
            >
              {/* TIME */}
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {time}
              </span>

              {/* EVENT */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                style={{
                  color: ev.color,
                  borderColor: `${ev.color}40`,
                  background: `${ev.color}12`,
                }}
              >
                {ev.label}
              </span>

              {/* SIDE */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em]"
                style={{
                  color: isLong ? "var(--color-bull)" : "var(--color-bear)",
                  borderColor: isLong ? "var(--color-bullborder)" : "var(--color-bearborder)",
                  background: isLong ? "var(--color-bullbg)" : "var(--color-bearbg)",
                }}
              >
                {isLong ? "BUY" : "SELL"}
              </span>

              {/* NAME */}
              <a
                href={buildTradingViewUrl(signal.name, signal.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-[13px] font-semibold hover:underline"
                style={{ color: "var(--color-text2)" }}
              >
                {signal.name}
              </a>

              {/* TIER */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em]"
                style={{
                  color: tierColor,
                  borderColor: `${tierColor}40`,
                  background: `${tierColor}10`,
                }}
              >
                {cap.replace("CAR-", "")}
              </span>

              {/* RVOL */}
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
                {rvol}
              </span>

              {/* ENTRY */}
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {entry}
              </span>

              {/* TARGET% (rough measured-move target, informational) */}
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text2)" }}>
                {roughtgt}
              </span>

              {/* TREND (Supertrend alignment, informational) */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                style={{ color: stColor, borderColor: `${stColor}40`, background: `${stColor}12` }}
              >
                {stKnown ? `${signal.st_trend}${signal.st_aligned ? "*" : ""}` : "--"}
              </span>

              {/* DETAIL */}
              <span className="min-w-0 truncate font-mono text-[10px]" style={{ color: "var(--color-muted)" }} title={signal.detail || ""}>
                {signal.detail || "--"}
              </span>
            </div>
          );
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      ` }} />
    </div>
  );
}
