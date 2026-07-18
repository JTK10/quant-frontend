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
    ["time", "ENTRY TIME"],
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex flex-wrap items-center gap-2 border-b border-[#ffffff10] px-3 py-3 md:px-6"
        style={{ background: `linear-gradient(180deg, ${ACCENT}0d, transparent), #0A0A0B` }}
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
          {rows.length} SIGNALS
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-8 md:px-6">
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: "#0A0A0B" }}>
              {headers.map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => {
                    if (sortKey === key) setAscending(!ascending);
                    else {
                      setSortKey(key);
                      setAscending(key === "time" || key === "name");
                    }
                  }}
                  className="cursor-pointer select-none border-b border-[#ffffff14] px-2 py-2.5 font-mono text-[10px] tracking-[0.18em] text-[#9ca3af] hover:text-white"
                >
                  {label}
                  {sortKey === key ? (ascending ? " ↑" : " ↓") : ""}
                </th>
              ))}
              <th className="border-b border-[#ffffff14] px-2 py-2.5 font-mono text-[10px] tracking-[0.18em] text-[#9ca3af]">
                CHART
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-2 py-10 text-center font-mono text-xs text-[#6b7280]">
                  No SERVAL signals for this date. Funnel entries appear from ~10:00 IST.
                </td>
              </tr>
            )}
            {rows.map((s, i) => {
              const isTier = s.tier === true || s.cap === "SERVAL-T";
              const sideColor = s.side === "LONG" ? "#10b981" : "#ef4444";
              return (
                <tr
                  key={`${s.name}-${s.side}-${s.time}-${i}`}
                  className="transition-colors hover:bg-[#ffffff06]"
                  style={isTier ? { background: `${ACCENT}0e` } : undefined}
                >
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs text-[#d1d5db]">
                    {String(s.time || "").slice(0, 5)}
                    {isTier && (
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em]"
                        style={{ color: ACCENT, background: `${ACCENT}1a`, border: `1px solid ${ACCENT}44` }}
                      >
                        TIER
                      </span>
                    )}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs font-semibold text-white">
                    {s.name}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs" style={{ color: sideColor }}>
                    {s.side}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs text-[#d1d5db]">
                    {fmt(s.entry)}
                  </td>
                  <td
                    className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs"
                    style={{ color: (num(s.dyn_ratio) ?? 0) >= 1.5 ? ACCENT : "#9ca3af" }}
                  >
                    {fmt(s.dyn_ratio)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs text-[#d1d5db]">
                    {fmt(s.dpoc, 1)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs text-[#d1d5db]">
                    {fmt(s.vol_ahead, 3)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs text-[#d1d5db]">
                    {fmt(s.rt5, 1)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs text-[#d1d5db]">
                    {fmt(s.atr)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs" style={{ color: "#10b981" }}>
                    {isTier ? fmt(s.target) : "—"}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2 font-mono text-xs" style={{ color: "#ef4444" }}>
                    {isTier ? fmt(s.stop) : "—"}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-2 py-2">
                    <a
                      href={buildTradingViewUrl(s.name, s.name)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] tracking-[0.14em] text-[#6b7280] hover:text-white"
                    >
                      TV ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
