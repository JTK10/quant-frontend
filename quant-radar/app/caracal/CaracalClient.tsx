"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";
import sectorMapData from "@/utils/sectorMap.json";

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
 * Sector membership -- the SAME source Sector Scope (/sector, AFAC.2) uses.
 *
 * afac2_score.py tags every leaderboard row with `secs`, and that map is built
 * on the VM (serval_live_scanner.py `afac_sectors`, vm_sim_afac2.py `sectors`)
 * straight out of master_mapping.csv:
 *
 *     sectors[str(r["Options  Name"]).strip()] = [SECTOR 1, SECTOR 2, SECTOR 3]
 *
 * utils/sectorMap.json is that exact dict, generated from the same CSV, so the
 * labels here are identical to the ones on the Sector Scope bar chart/cards.
 * It is NOT fetched from afac2 at runtime for two reasons: afac2 is the single
 * heaviest publisher (~2MB/day -- see memory panther-payload-bottleneck; it is
 * what kept /sector at 7s) and its rows only cover stocks that GATED that day,
 * so a caracal name that afac2 never scored would silently lose its sector.
 *
 * JOIN KEY: caracal3 publishes `name = r.Underlying` (the futures-master
 * underlying, i.e. the OPTIONS symbol -- "RELIANCE"), which is exactly the
 * "Options  Name" column keyed above. Shakeout/OOS instead publishes the long
 * MASTER name ("RELIANCE INDUSTRIES LTD") off futures_instrument_keys, so OOS
 * rows would NOT join here -- another reason the sector filter never touches
 * them (see NOTE on the filters below).
 */
const SECTOR_MAP: Record<string, string[]> = sectorMapData as Record<string, string[]>;

// same de-prefixing Sector Scope / AFAC use for display
const sectorLabel = (s: string) => s.replace(/^NIFTY_/, "").replace(/_/g, " ");

const sectorsOf = (s: any): string[] =>
  SECTOR_MAP[String(s?.name ?? "").trim().toUpperCase()] ?? [];

/**
 * Entry-time buckets, exactly as specified: the FIRST is 20 minutes, the rest
 * are 15. Inclusive start, exclusive end. An entry outside 09:55-11:30 matches
 * no bucket -- it is visible under "ALL" and nowhere else.
 */
const TIME_BUCKETS: Array<{ key: string; from: number; to: number }> = [
  { key: "09:55-10:15", from: 9 * 60 + 55, to: 10 * 60 + 15 },
  { key: "10:15-10:30", from: 10 * 60 + 15, to: 10 * 60 + 30 },
  { key: "10:30-10:45", from: 10 * 60 + 30, to: 10 * 60 + 45 },
  { key: "10:45-11:00", from: 10 * 60 + 45, to: 11 * 60 + 0 },
  { key: "11:00-11:15", from: 11 * 60 + 0, to: 11 * 60 + 15 },
  { key: "11:15-11:30", from: 11 * 60 + 15, to: 11 * 60 + 30 },
];

// "10:05:00" / "10:05" -> minutes past midnight
function minsOfDay(t: any): number | null {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(v) ? v : null;
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
  const [timeBucket, setTimeBucket] = useState<string>("ALL");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<string>("time");
  const [ascending, setAscending] = useState(true);


  /**
   * A CARACAL v3 row. NOTE -- this is the scope guard for BOTH new filters
   * (entry-time bucket, sector). Legacy CARACAL v2 rows and, critically, OOS
   * shakeout rows (source "shakeout", cap "OOS") are never v3, so they always
   * pass both filters untouched: nothing added here can hide or alter an OOS
   * row. The pre-existing side/source filters are unchanged.
   */
  const isV3 = (s: any) => s.source === "caracal3" || s.cap === "CAR-V3";

  // v3 ENTRY rows only -- inclusive start, exclusive end; non-v3 always passes
  const passesTime = (s: any) => {
    if (timeBucket === "ALL" || !isV3(s)) return true;
    const b = TIME_BUCKETS.find((x) => x.key === timeBucket);
    if (!b) return true;
    const m = minsOfDay(s.time);
    return m !== null && m >= b.from && m < b.to;
  };

  // v3 rows only; a name with several SECTOR 1/2/3 tags matches on ANY of them
  const passesSector = (s: any) => {
    if (sectorFilter === "ALL" || !isV3(s)) return true;
    return sectorsOf(s).includes(sectorFilter);
  };

  // ---- ENTRIES ----
  // Deduped + side/source filtered, but BEFORE the two new filters, so each of
  // them can be counted against what the other one leaves.
  const baseRows = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const s of signals.filter((x: any) => x.event !== "FLAG")) {
      if (s.cap === "OOS") { byKey.set(`OOS|${s.name}|${s.time}`, s); continue; }
      const k = `${s.name}|${s.side}`;
      const prev = byKey.get(k);
      if (!prev || (s.ts ?? 0) > (prev.ts ?? 0)) byKey.set(k, s);
    }
    let f = Array.from(byKey.values());
    if (sideFilter !== "ALL") f = f.filter((s) => s.side === sideFilter);
    if (sourceFilter === "CARACAL") f = f.filter((s) => s.cap !== "OOS");
    if (sourceFilter === "OOS") f = f.filter((s) => s.cap === "OOS");
    return f;
  }, [signals, sideFilter, sourceFilter]);

  // per-bucket counts, composed with the sector filter (v3 entries only)
  const bucketCounts = useMemo(() => {
    const v3 = baseRows.filter((s) => isV3(s) && passesSector(s));
    const counts: Record<string, number> = { ALL: v3.length };
    for (const b of TIME_BUCKETS) {
      counts[b.key] = v3.filter((s) => {
        const m = minsOfDay(s.time);
        return m !== null && m >= b.from && m < b.to;
      }).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, sectorFilter]);

  // sector options, composed with the time-bucket filter (v3 rows only).
  // Watchlist flags are included so a sector that only has pending names is
  // still selectable; the count shown is v3 ENTRIES in that sector.
  const sectorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of baseRows) {
      if (!isV3(s) || !passesTime(s)) continue;
      for (const sec of sectorsOf(s)) counts.set(sec, (counts.get(sec) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, timeBucket]);

  const rows = useMemo(() => {
    const f = baseRows.filter((s) => passesTime(s) && passesSector(s));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, timeBucket, sectorFilter, sortKey, ascending]);

  const headers: Array<[string, string]> = [
    ["time", "TIME"],
    ["name", "STOCK"],
    ["side", "SIDE"],
    ["entry", "ENTRY"],
    ["dpoc", "DPOC%"],
    ["vol_ahead", "AHEAD"],
    ["pullback_hm", "PB"],
  ];

  const nEntry = rows.filter((s) => s.cap !== "OOS").length;
  const nOos = signals.filter((s) => s.cap === "OOS").length;
  const GRID = "grid-cols-[44px_60px_minmax(150px,1.4fr)_70px_90px_70px_70px_70px] gap-3 min-w-[820px]";

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
        <span className="ml-auto font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
          {rows.length} ROWS
        </span>
      </div>

      {/* v3-only filter bar: entry-time bucket + sector.
          Both scope themselves to CARACAL v3 rows -- V2 and OOS shakeout rows
          are never hidden by either, which is why the bar says so. */}
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#ffffff10] px-3 py-2.5 md:px-6 shrink-0"
        style={{ background: "var(--color-surface)" }}
      >
        <span
          className="rounded-sm border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em]"
          style={{ color: ACCENT, background: `${ACCENT}12`, borderColor: `${ACCENT}30` }}
          title="These two filters apply to CARACAL v3 rows only — V2 and OOS shakeout rows always stay visible."
        >
          V3 ONLY
        </span>
        <span className="font-mono text-[9px] tracking-[0.18em] text-[#6b7280]">ENTRY</span>
        {(["ALL", ...TIME_BUCKETS.map((b) => b.key)] as string[]).map((v) => {
          const active = timeBucket === v;
          const n = bucketCounts[v] ?? 0;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setTimeBucket(v)}
              className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] transition-all duration-300"
              style={{
                color: active ? ACCENT : "var(--color-muted, #6b7280)",
                borderColor: active ? `${ACCENT}55` : "#ffffff18",
                background: active ? `${ACCENT}12` : "transparent",
              }}
            >
              {v}
              <span style={{ opacity: 0.65 }}> {n}</span>
            </button>
          );
        })}
        <span className="mx-1 h-4 w-px bg-[#ffffff18]" />
        <span className="font-mono text-[9px] tracking-[0.18em] text-[#6b7280]">SECTOR</span>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-lg border px-2 py-1 font-mono text-[10px] tracking-[0.12em] outline-none transition-all duration-300"
          style={{
            color: sectorFilter === "ALL" ? "var(--color-muted, #6b7280)" : ACCENT,
            borderColor: sectorFilter === "ALL" ? "#ffffff18" : `${ACCENT}55`,
            background: sectorFilter === "ALL" ? "transparent" : `${ACCENT}12`,
          }}
        >
          <option value="ALL" style={{ background: "#0A0A0B", color: "#e5e7eb" }}>
            ALL SECTORS
          </option>
          {sectorOptions.map(([sec, n]) => (
            <option key={sec} value={sec} style={{ background: "#0A0A0B", color: "#e5e7eb" }}>
              {sectorLabel(sec)} ({n})
            </option>
          ))}
        </select>
        {(timeBucket !== "ALL" || sectorFilter !== "ALL") && (
          <button
            type="button"
            onClick={() => {
              setTimeBucket("ALL");
              setSectorFilter("ALL");
            }}
            className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
            style={{ color: "var(--color-muted, #6b7280)", borderColor: "#ffffff18" }}
          >
            CLEAR
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto custom-scrollbar-caracal">
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
