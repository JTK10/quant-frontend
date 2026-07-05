"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";


export default function CapsClient({ signals }: { signals: any[] }) {
  const [sortKey, setSortKey] = useState<string>("time");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [tierFilter, setTierFilter] = useState<"ALL" | "LARGE" | "MID" | "SMALL">("ALL");

  const filtered = useMemo(() => {
    let f = signals;
    if (filter !== "ALL") {
      f = f.filter(s => s.side === filter);
    }
    if (tierFilter !== "ALL") {
      f = f.filter(s => (s.cap || "LARGE").toUpperCase() === tierFilter);
    }
    
    return f.sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "time":
            return (a.time || a.entry_time || "").localeCompare(b.time || b.entry_time || "");
          case "name":
            return (a.name || a.tkr || "").localeCompare(b.name || b.tkr || "");
          case "mass":
            return (a.mass_cr || 0) - (b.mass_cr || 0);
          case "delta":
            return (a.delta || 0) - (b.delta || 0);
          case "imb":
            return (a.imb || 0) - (b.imb || 0);
          case "surge":
            return (a.surge || 0) - (b.surge || 0);
          default:
            return 0;
        }
      })();
      return ascending ? cmp : -cmp;
    });
  }, [signals, filter, tierFilter, sortKey, ascending]);

  const headers: [string, string][] = [
    ["time", "TIME"],
    ["side", "SIDE"],
    ["name", "NAME"],
    ["cap", "TIER"],
    ["mass", "MASS"],
    ["delta", "DELTA"],
    ["imb", "IMB"],
    ["surge", "SURGE"],
    ["entry", "ENTRY"],
  ];

  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            CAPS ENGINE
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No signals for the selected date.
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
            v === "LONG" ? "var(--color-bull)" : v === "SHORT" ? "var(--color-bear)" : "var(--color-purple)";
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
                boxShadow: active ? `0 0 10px ${c}20` : "none"
              }}
            >
              {v}
            </button>
          );
        })}

        <div className="flex rounded-lg overflow-hidden ml-2" style={{ border: '1px solid var(--color-border)' }}>
          {(["ALL", "LARGE", "MID", "SMALL"] as const).map((t) => {
            const active = tierFilter === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTierFilter(t)}
                className="px-3 py-1 font-mono text-[10px] tracking-[0.18em] transition-all"
                style={{
                  background: active ? "rgba(168,85,247,0.15)" : "transparent",
                  color: active ? "var(--color-purple)" : "var(--color-muted)",
                  borderRight: t !== "SMALL" ? "1px solid var(--color-border)" : "none",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        <span className="ml-auto font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          {filtered.length} SIGNALS
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {/* Header */}
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[60px_50px_1fr_60px_60px_60px_50px_50px_50px] lg:grid-cols-[70px_60px_1fr_70px_70px_70px_60px_60px_60px] min-w-[700px] lg:min-w-0"
          style={{
            borderColor: "var(--color-border)",
            background: "rgba(10, 14, 23, 0.95)",
            backdropFilter: "blur(6px)",
          }}
        >
          {headers.map(([key, label], idx) => {
            const active = sortKey === key;
            const isRightAligned = idx >= 4;
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
                className={`font-mono text-[9px] tracking-[0.14em] ${isRightAligned ? 'text-right' : 'text-left'}`}
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {filtered.map((signal, idx) => {
          const rowId = `${signal.tkr || signal.name}-${signal.entry_time || signal.time}-${idx}`;
          const isLong = signal.side === "LONG" || signal.side === "BUY";
          const time = signal.time || signal.entry_time || "--:--";
          const mass = typeof signal.mass_cr === "number" ? signal.mass_cr.toFixed(1) : (signal.mass_cr || "--");
          const delta = typeof signal.delta === "number" ? signal.delta.toFixed(1) : (signal.delta || "--");
          const imb = typeof signal.imb === "number" ? signal.imb.toFixed(2) : (signal.imb || "--");
          const surge = typeof signal.surge === "number" ? signal.surge.toFixed(2) : (signal.surge || "--");
          const name = signal.name || signal.tkr;
          
          return (
            <div
              key={rowId}
              className="grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[60px_50px_1fr_60px_60px_60px_50px_50px_50px] lg:grid-cols-[70px_60px_1fr_70px_70px_70px_60px_60px_60px] min-w-[700px] lg:min-w-0 hover:bg-[#ffffff04] transition-colors"
              style={{ borderColor: "var(--color-border)" }}
            >
              {/* TIME */}
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {time.substring(0, 5)}
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
                href={buildTradingViewUrl(name, name)} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="min-w-0 truncate text-[13px] font-semibold hover:underline" 
                style={{ color: "var(--color-text2)" }}
              >
                {name}
              </a>

              {/* TIER */}
              <span
                className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em]"
                style={{
                  color: "var(--color-purple)",
                  borderColor: "rgba(168,85,247,0.25)",
                  background: "rgba(168,85,247,0.08)",
                }}
              >
                {signal.cap || "LARGE"}
              </span>

              {/* MASS */}
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
                {mass}
              </span>

              {/* DELTA */}
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: typeof signal.delta === 'number' && signal.delta > 0 ? "var(--color-bull)" : typeof signal.delta === 'number' && signal.delta < 0 ? "var(--color-bear)" : "var(--color-text)" }}>
                {typeof signal.delta === 'number' && signal.delta > 0 ? "+" : ""}{delta}
              </span>

              {/* IMB */}
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {imb}
              </span>

              {/* SURGE */}
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {surge}%
              </span>

              {/* ENTRY */}
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
                {signal.entry}
              </span>
            </div>
          );
        })}
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
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
      `}} />
    </div>
  );
}
