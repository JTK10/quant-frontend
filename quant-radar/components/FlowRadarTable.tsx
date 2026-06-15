"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { FlowRadarRow } from "@/utils/backend";
import { buildTradingViewUrl } from "@/utils/backend";

type SortKey = "name" | "sector" | "engines" | "oi" | "oichg" | "pricechg" | "score";

export default function FlowRadarTable({ rows }: { rows: FlowRadarRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("oichg");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  const filtered = rows.filter((r) => {
    if (filter === "ALL") return true;
    if (filter === "LONG") return r.Buildup && r.Buildup.includes("LONG");
    if (filter === "SHORT") return r.Buildup && r.Buildup.includes("SHORT");
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const cmp = (() => {
      switch (sortKey) {
        case "name":
          return a.Name.localeCompare(b.Name);
        case "sector":
          return a.Sector.localeCompare(b.Sector);
        case "engines":
          return (a.Engines || "").localeCompare(b.Engines || "");
        case "oi":
          return a.OI - b.OI;
        case "oichg":
          return Math.abs(a.OIChgPct) - Math.abs(b.OIChgPct);
        case "pricechg":
          return Math.abs(a.PriceChgPct) - Math.abs(b.PriceChgPct);
        case "score":
        default:
          return a.CompositeScore - b.CompositeScore;
      }
    })();
    return ascending ? cmp : -cmp;
  });

  if (!rows.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            FLOW RADAR
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No flow data for the selected date.
          </p>
        </div>
      </div>
    );
  }

  const headers: [SortKey | "engines", string][] = [
    ["name", "NAME"],
    ["sector", "SECTOR"],
    ["engines", "STRATEGY"],
    ["score", "SCORE"],
    ["oi", "OI"],
    ["oichg", "ΔOI%"],
    ["pricechg", "ΔPRICE%"],
  ];

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
            v === "LONG" ? "var(--color-bull)" : v === "SHORT" ? "var(--color-bear)" : "var(--color-accent)";
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
          {sorted.length} STOCKS
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[minmax(130px,1fr)_100px_80px_60px_80px_80px_80px_110px] min-w-[850px]"
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
                className={`text-left font-mono text-[9px] tracking-[0.14em] ${key === "name" || key === "sector" || key === "engines" ? "" : "text-right"}`}
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
          <span className="font-mono text-[9px] tracking-[0.14em] text-center" style={{ color: "var(--color-muted)" }}>
            BUILDUP
          </span>
        </div>

        {/* Rows */}
        {sorted.map((row, idx) => {
          const rowId = `${row.Symbol || row.Name}-${idx}`;
          const isConfirm = row.Verdict === "CONFIRM";
          const isVeto = row.Verdict === "VETO";

          return (
              <div
                key={rowId}
                className="grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[minmax(130px,1fr)_100px_80px_60px_80px_80px_80px_110px] min-w-[850px]"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* NAME + symbol */}
                <div className="min-w-0">
                  <a
                    href={buildTradingViewUrl(row.Symbol, row.Name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[13px] font-semibold hover:underline block"
                    style={{ color: "var(--color-text2)" }}
                  >
                    {row.Name}
                  </a>
                  <div
                    className="truncate font-mono text-[9px] tracking-[0.14em] mt-0.5"
                    style={{ color: isConfirm ? "var(--color-bull)" : isVeto ? "var(--color-bear)" : "var(--color-muted)" }}
                  >
                    {row.Verdict} {row.VerdictReason ? `• ${row.VerdictReason}` : ""}
                  </div>
                </div>

                {/* SECTOR */}
                <span className="font-mono text-[10px] truncate" style={{ color: "var(--color-muted2)" }}>
                  {row.Sector}
                </span>

                {/* STRATEGY */}
                <span className="font-mono text-[10px] truncate" style={{ color: "var(--color-text)" }}>
                  {(() => {
                    const engines = row.Engines || "";
                    if (engines.includes("V6") && engines.includes("SNIPER")) return "BOTH";
                    if (engines.includes("V6")) return "V69";
                    if (engines.includes("SNIPER") || engines.includes("SMART_RADAR")) return "SNIPER";
                    return engines;
                  })() || "-"}
                </span>

                {/* SCORE */}
                <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-gold)" }}>
                  {row.CompositeScore.toFixed(1)}
                </span>

                {/* OI */}
                <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                  {row.OI.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>

                {/* OI CHG PCT */}
                <span className="text-right font-mono text-[11px] font-semibold" style={{ color: row.OIChgPct > 0 ? "var(--color-bull)" : row.OIChgPct < 0 ? "var(--color-bear)" : "var(--color-text)" }}>
                  {row.OIChgPct > 0 ? "+" : ""}{row.OIChgPct.toFixed(1)}%
                </span>

                {/* PRICE CHG PCT */}
                <span className="text-right font-mono text-[11px] font-semibold" style={{ color: row.PriceChgPct > 0 ? "var(--color-bull)" : row.PriceChgPct < 0 ? "var(--color-bear)" : "var(--color-text)" }}>
                  {row.PriceChgPct > 0 ? "+" : ""}{row.PriceChgPct.toFixed(1)}%
                </span>

                {/* BUILDUP */}
                <div className="text-center">
                  <span
                    className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em]"
                    style={{
                      color: row.Buildup.includes("LONG") ? "var(--color-bull)" : row.Buildup.includes("SHORT") ? "var(--color-bear)" : "var(--color-muted)",
                      borderColor: row.Buildup.includes("LONG") ? "var(--color-bullborder)" : row.Buildup.includes("SHORT") ? "var(--color-bearborder)" : "var(--color-border)",
                      background: row.Buildup.includes("LONG") ? "var(--color-bullbg)" : row.Buildup.includes("SHORT") ? "var(--color-bearbg)" : "transparent",
                    }}
                  >
                    {row.Buildup || "-"}
                  </span>
                </div>
              </div>
          );
        })}
      </div>
    </div>
  );
}
