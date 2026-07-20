"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

const ACCENT = "#ec4899";

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}

export default function ServalClient({ signals }: { signals: any[] }) {
  const [sideFilter, setSideFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [tierOnly, setTierOnly] = useState(false);
  const [sortKey, setSortKey] = useState<string>("time");
  const [ascending, setAscending] = useState(true);

  const rows = useMemo(() => {
    let f = signals;
    if (sideFilter !== "ALL") f = f.filter((s) => s.side === sideFilter);
    if (tierOnly) f = f.filter((s) => s.tier === true || s.cap === "SERVAL-T");
    return [...f].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "time":
            return String(a.time || "").localeCompare(String(b.time || ""));
          case "name":
            return String(a.name || "").localeCompare(String(b.name || ""));
          default: {
            const av = num(a[sortKey]) ?? -Infinity;
            const bv = num(b[sortKey]) ?? -Infinity;
            return av - bv;
          }
        }
      })();
      return ascending ? cmp : -cmp;
    });
  }, [signals, sideFilter, tierOnly, sortKey, ascending]);

  const headers: Array<[string, string]> = [
    ["time", "TIME"],
    ["name", "STOCK"],
    ["side", "SIDE"],
    ["entry", "ENTRY"],
    ["dyn_ratio", "DYN"],
    ["dpoc", "DPOC%"],
    ["vol_ahead", "AHEAD"],
    ["rt5", "RT5%"],
    ["atr", "ATR%"],
    ["target", "TARGET"],
    ["stop", "STOP"],
  ];

  const nTier = signals.filter((s) => s.tier === true || s.cap === "SERVAL-T").length;
  const GRID = "grid-cols-[44px_60px_minmax(130px,1.2fr)_60px_78px_60px_62px_62px_60px_58px_72px_72px] gap-3 min-w-[980px]";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* info bar, same language as RFAC/AFAC */}
      <div
        className="flex flex-wrap items-center gap-4 border-b border-[#ffffff10] px-3 py-3 md:px-6 shrink-0"
        style={{ background: `linear-gradient(180deg, ${ACCENT}0d, transparent), #0A0A0B` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[10px] tracking-[0.2em] font-semibold px-2 py-1 rounded-sm border"
            style={{ color: ACCENT, background: `${ACCENT}15`, borderColor: `${ACCENT}30` }}
          >
            FUTURES UNIVERSE
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.18em]" style={{ color: ACCENT }}>
            SPLIT-POOL FUNNEL
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}80` }} />
          <span className="font-mono text-[11px] font-medium" style={{ color: ACCENT }}>
            {nTier} TIER SIGNALS TODAY
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-[#ffffff05] rounded-md border border-[#ffffff10]">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}cc` }} />
          <span className="font-mono text-[11px] text-gray-400">{signals.length} FUNNEL ENTRIES</span>
        </div>
      </div>

      {/* filter bar */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#ffffff10] px-3 py-2.5 md:px-6 shrink-0"
        style={{ background: "var(--color-surface)" }}
      >
        {(["ALL", "LONG", "SHORT"] as const).map((v) => {
          const active = sideFilter === v;
          const c = v === "LONG" ? "var(--color-bull, #10b981)" : v === "SHORT" ? "#ef4444" : "#9ca3af";
          return (
            <button
              key={v}
              type="button"
              onClick={() => setSideFilter(v)}
              className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
              style={{
                color: active ? c : "var(--color-muted, #6b7280)",
                borderColor: active ? `${c}55` : "#ffffff18",
                background: active ? `${c}12` : "transparent",
              }}
            >
              {v}
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-[#ffffff18]" />
        <button
          type="button"
          onClick={() => setTierOnly(!tierOnly)}
          className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
          style={{
            color: tierOnly ? ACCENT : "var(--color-muted, #6b7280)",
            borderColor: tierOnly ? `${ACCENT}66` : "#ffffff18",
            background: tierOnly ? `${ACCENT}14` : "transparent",
            boxShadow: tierOnly ? `0 0 10px ${ACCENT}25` : "none",
          }}
        >
          TIER ONLY ({nTier})
        </button>
        <span className="ml-auto font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
          {rows.length} ROWS
        </span>
      </div>

      {/* grid table, same pattern as RFAC/AFAC */}
      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar-serval">
        <div
          className={`sticky top-0 z-10 grid items-center border-b px-3 py-2.5 md:px-4 ${GRID}`}
          style={{
            borderColor: "var(--color-border)",
            background: "rgba(10, 14, 23, 0.95)",
            backdropFilter: "blur(6px)",
          }}
        >
          <span className="font-mono text-[9px] tracking-[0.14em] text-left" style={{ color: "var(--color-muted)" }}>
            #
          </span>
          {headers.map(([key, label], idx) => {
            const active = sortKey === key;
            const isRightAligned = idx >= 2;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (sortKey === key) setAscending((c) => !c);
                  else {
                    setSortKey(key);
                    setAscending(key === "time" || key === "name");
                  }
                }}
                className={`font-mono text-[9px] tracking-[0.14em] ${isRightAligned ? "text-right" : "text-left"}`}
                style={{ color: active ? ACCENT : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>

        {rows.length === 0 && (
          <div className="px-3 py-10 text-center font-mono text-xs" style={{ color: "var(--color-muted)" }}>
            No SERVAL signals for this date. Funnel entries appear from ~10:00 IST.
          </div>
        )}

        {rows.map((s, i) => {
          const isTier = s.tier === true || s.cap === "SERVAL-T";
          const long = s.side === "LONG";
          const sideColor = long ? "var(--color-bull, #10b981)" : "#ef4444";
          const rank = i + 1;
          const isTop3 = rank <= 3;
          return (
            <div
              key={`${s.name}-${s.side}-${s.time}-${i}`}
              className={`grid items-center border-b px-3 py-3 md:px-4 ${GRID} hover:bg-[#ffffff04] transition-colors`}
              style={{
                borderColor: "var(--color-border)",
                background: isTier ? `${ACCENT}0e` : isTop3 ? `${ACCENT}06` : "transparent",
              }}
            >
              <span className="font-mono text-[11px] font-bold" style={{ color: isTop3 ? ACCENT : "var(--color-muted2)" }}>
                #{rank}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {String(s.time || "").slice(0, 5)}
              </span>
              <div className="min-w-0 flex items-center gap-1.5">
                <a
                  href={buildTradingViewUrl(s.name, s.name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-[13px] font-semibold hover:underline"
                  style={{ color: "var(--color-text2)" }}
                >
                  {s.name}
                </a>
                {isTier && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                    style={{ color: ACCENT, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}44` }}
                  >
                    TIER
                  </span>
                )}
              </div>
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: sideColor }}>
                {long ? "▲" : "▼"}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {fmt(s.entry)}
              </span>
              <span
                className="text-right font-mono text-[11px] font-semibold"
                style={{ color: (num(s.dyn_ratio) ?? 0) >= 1.5 ? ACCENT : "var(--color-muted2)" }}
              >
                {fmt(s.dyn_ratio)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {fmt(s.dpoc, 1)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {fmt(s.vol_ahead, 3)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {fmt(s.rt5, 1)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {fmt(s.atr)}
              </span>
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "#10b981" }}>
                {isTier ? fmt(s.target) : "—"}
              </span>
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "#ef4444" }}>
                {isTier ? fmt(s.stop) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar-serval::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar-serval::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-serval::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar-serval::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      ` }} />
    </div>
  );
}
