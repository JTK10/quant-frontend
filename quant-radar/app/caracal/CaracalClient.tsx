"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

const ACCENT = "#f59e0b";

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}

/**
 * CARACAL v3 ("skeleton").
 *
 * The engine publishes two kinds of row and this page shows BOTH, in their own
 * sections, because in v3 the watchlist is genuinely informative: it is settled
 * at 09:15 (the first candle's close breaking the prev-day body) and every
 * later entry must come from it. It is still provisional -- a watchlist name is
 * NOT tradeable until its ENTRY row appears -- so the two sections never share
 * a table.
 *
 *   FLAG  (provisional:true , cap CAR-V3) -> WATCHLIST
 *   ENTRY (provisional:false, cap CAR-V3) -> ENTRIES (>= 09:50, vol_ahead < 0.3)
 *
 * Legacy CARACAL v2 rows (cap CAR-V2 / CAR-V2-T) and OOS shakeout rows are
 * still rendered in the ENTRIES section so historical dates keep working.
 */
export default function CaracalClient({ signals }: { signals: any[] }) {
  const [sideFilter, setSideFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [sourceFilter, setSourceFilter] = useState<"ALL" | "CARACAL" | "OOS">("ALL");
  const [showWatch, setShowWatch] = useState(true);
  const [sortKey, setSortKey] = useState<string>("time");
  const [ascending, setAscending] = useState(true);

  const isWatch = (s: any) => s.event === "FLAG" && s.source === "caracal3";

  // ---- WATCHLIST (09:15 body breaks, de-duplicated per name+side) ----
  const watchRows = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const s of signals.filter(isWatch)) {
      const k = `${s.name}|${s.side}`;
      const prev = byKey.get(k);
      if (!prev || (s.ts ?? 0) > (prev.ts ?? 0)) byKey.set(k, s);
    }
    let f = Array.from(byKey.values());
    if (sideFilter !== "ALL") f = f.filter((s) => s.side === sideFilter);
    if (sourceFilter === "OOS") f = [];
    return f.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [signals, sideFilter, sourceFilter]);

  // names that already converted -- shown as CONFIRMED chips on the watchlist
  const enteredKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of signals) if (r.event === "ENTRY") s.add(`${r.name}|${r.side}`);
    return s;
  }, [signals]);

  // ---- ENTRIES ----
  const rows = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const s of signals.filter((x: any) => !isWatch(x) && x.event !== "FLAG")) {
      if (s.cap === "OOS") { byKey.set(`OOS|${s.name}|${s.time}`, s); continue; }
      const k = `${s.name}|${s.side}`;
      const prev = byKey.get(k);
      if (!prev || (s.ts ?? 0) > (prev.ts ?? 0)) byKey.set(k, s);
    }
    let f = Array.from(byKey.values());
    if (sideFilter !== "ALL") f = f.filter((s) => s.side === sideFilter);
    if (sourceFilter === "CARACAL") f = f.filter((s) => s.cap !== "OOS");
    if (sourceFilter === "OOS") f = f.filter((s) => s.cap === "OOS");
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
  }, [signals, sideFilter, sourceFilter, sortKey, ascending]);

  const headers: Array<[string, string]> = [
    ["time", "TIME"],
    ["name", "STOCK"],
    ["side", "SIDE"],
    ["entry", "ENTRY"],
    ["dpoc", "DPOC%"],
    ["vol_ahead", "AHEAD"],
    ["pullback_hm", "PB"],
  ];

  const nWatchAll = signals.filter(isWatch).length;
  const nEntry = rows.filter((s) => s.cap !== "OOS").length;
  const nOos = signals.filter((s) => s.cap === "OOS").length;
  const GRID = "grid-cols-[44px_60px_minmax(150px,1.4fr)_70px_90px_70px_70px_70px] gap-3 min-w-[820px]";
  const WGRID = "grid-cols-[44px_60px_minmax(150px,1.4fr)_70px_90px_90px] gap-3 min-w-[620px]";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* info bar, same language as SERVAL/RFAC/AFAC */}
      <div
        className="flex flex-wrap items-center gap-4 border-b border-[#ffffff10] px-3 py-3 md:px-6 shrink-0"
        style={{ background: `linear-gradient(180deg, ${ACCENT}0d, transparent), #0A0A0B` }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[10px] tracking-[0.2em] font-semibold px-2 py-1 rounded-sm border"
            style={{ color: ACCENT, background: `${ACCENT}15`, borderColor: `${ACCENT}30` }}
          >
            NSE FNO UNIVERSE
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.18em]" style={{ color: ACCENT }}>
            SKELETON
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}80` }} />
          <span className="font-mono text-[11px] font-medium" style={{ color: ACCENT }}>
            {nEntry} ENTRIES TODAY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "#60a5fa", boxShadow: "0 0 8px #60a5fa80" }} />
          <span className="font-mono text-[11px] font-medium" style={{ color: "#60a5fa" }}>
            {nWatchAll} ON WATCHLIST
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: "#10b981", boxShadow: "0 0 8px #10b98180" }} />
          <span className="font-mono text-[11px] font-medium" style={{ color: "#10b981" }}>
            {nOos} OOS SHAKEOUT
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-[#ffffff05] rounded-md border border-[#ffffff10]">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT, boxShadow: `0 0 8px ${ACCENT}cc` }} />
          <span className="font-mono text-[11px] text-gray-400">ENTRY ≥ 09:50 · AHEAD &lt; 0.3</span>
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
        {(["ALL", "CARACAL", "OOS"] as const).map((v) => {
          const active = sourceFilter === v;
          const c = v === "CARACAL" ? ACCENT : v === "OOS" ? "#10b981" : "#9ca3af";
          return (
            <button
              key={v}
              type="button"
              onClick={() => setSourceFilter(v)}
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
          onClick={() => setShowWatch(!showWatch)}
          className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
          style={{
            color: showWatch ? "#60a5fa" : "var(--color-muted, #6b7280)",
            borderColor: showWatch ? "#60a5fa66" : "#ffffff18",
            background: showWatch ? "#60a5fa14" : "transparent",
            boxShadow: showWatch ? "0 0 10px #60a5fa25" : "none",
          }}
        >
          WATCHLIST ({watchRows.length})
        </button>
        <span className="ml-auto font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
          {rows.length} ROWS
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar-caracal">
        {/* ---------------- WATCHLIST ---------------- */}
        {showWatch && (
          <>
            <div
              className="flex items-center gap-2 px-3 py-2 md:px-4 border-b"
              style={{ borderColor: "var(--color-border)", background: "#60a5fa0c" }}
            >
              <span className="font-mono text-[10px] tracking-[0.2em] font-semibold" style={{ color: "#60a5fa" }}>
                WATCHLIST · 09:15 CLOSE BROKE PREV-DAY BODY
              </span>
              <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
                provisional — not tradeable until an ENTRY row appears
              </span>
            </div>
            <div
              className={`grid items-center border-b px-3 py-2 md:px-4 ${WGRID}`}
              style={{ borderColor: "var(--color-border)", background: "rgba(10, 14, 23, 0.75)" }}
            >
              {["#", "TIME", "STOCK", "SIDE", "09:15 CLOSE", "PD BODY"].map((h, i) => (
                <span
                  key={h}
                  className={`font-mono text-[9px] tracking-[0.14em] ${i >= 3 ? "text-right" : "text-left"}`}
                  style={{ color: "var(--color-muted)" }}
                >
                  {h}
                </span>
              ))}
            </div>
            {watchRows.length === 0 && (
              <div className="px-3 py-6 text-center font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                No watchlist rows for this date. The 09:15 break publishes from ~09:20 IST.
              </div>
            )}
            {watchRows.map((s, i) => {
              const long = s.side === "LONG";
              const sideColor = long ? "var(--color-bull, #10b981)" : "#ef4444";
              const confirmed = enteredKeys.has(`${s.name}|${s.side}`);
              return (
                <div
                  key={`w-${s.name}-${s.side}-${i}`}
                  className={`grid items-center border-b px-3 py-2.5 md:px-4 ${WGRID} hover:bg-[#ffffff04] transition-colors`}
                  style={{
                    borderColor: "var(--color-border)",
                    background: confirmed ? `${ACCENT}0a` : "transparent",
                  }}
                >
                  <span className="font-mono text-[11px] font-bold" style={{ color: "var(--color-muted2)" }}>
                    #{i + 1}
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                    {String(s.time || "09:15").slice(0, 5)}
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
                    {confirmed && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                        style={{ color: ACCENT, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}44` }}
                      >
                        ENTERED
                      </span>
                    )}
                  </div>
                  <span className="text-right font-mono text-[11px] font-semibold" style={{ color: sideColor }}>
                    {long ? "▲" : "▼"}
                  </span>
                  <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                    {fmt(s.entry)}
                  </span>
                  <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                    {fmt(s.level)}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {/* ---------------- ENTRIES ---------------- */}
        <div
          className="flex items-center gap-2 px-3 py-2 md:px-4 border-b"
          style={{ borderColor: "var(--color-border)", background: `${ACCENT}0c` }}
        >
          <span className="font-mono text-[10px] tracking-[0.2em] font-semibold" style={{ color: ACCENT }}>
            ENTRIES · RESUMPTION BEYOND THE PRE-PULLBACK EXTREME
          </span>
        </div>
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
            No CARACAL v3 entries for this date. Entries appear from 09:50 IST.
          </div>
        )}

        {rows.map((s, i) => {
          const isV3 = s.cap === "CAR-V3";
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
                background: isV3 ? `${ACCENT}0e` : isTop3 ? `${ACCENT}06` : "transparent",
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
                {isV3 && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                    style={{ color: ACCENT, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}44` }}
                  >
                    V3
                  </span>
                )}
                {(s.cap === "CAR-V2" || s.cap === "CAR-V2-T") && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                    style={{ color: "#9ca3af", background: "#9ca3af1a", border: "1px solid #9ca3af44" }}
                  >
                    V2
                  </span>
                )}
                {s.cap === "OOS" && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.1em]"
                    style={{ color: "#10b981", background: "#10b9811a", border: "1px solid #10b98144" }}
                  >
                    OOS
                  </span>
                )}
              </div>
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: sideColor }}>
                {long ? "▲" : "▼"}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {fmt(s.entry)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {fmt(s.dpoc, 1)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {fmt(s.vol_ahead, 3)}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {s.pullback_hm ? String(s.pullback_hm).slice(0, 5) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar-caracal::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar-caracal::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-caracal::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar-caracal::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      ` }} />
    </div>
  );
}
