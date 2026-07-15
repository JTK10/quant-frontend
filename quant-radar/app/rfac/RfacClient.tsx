"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

export default function RfacClient({ signals, latestTime }: { signals: any[]; latestTime: string | null }) {
  const [sortKey, setSortKey] = useState<string>("imb");
  const [ascending, setAscending] = useState(true);
  const [scope, setScope] = useState<"LATEST" | "ALL">("LATEST");

  const cycleTimes = useMemo(
    () => Array.from(new Set(signals.map((s) => s.time))).sort(),
    [signals]
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const activeTime = selectedTime ?? latestTime;

  const filtered = useMemo(() => {
    let f = scope === "LATEST" ? signals.filter((s) => s.time === activeTime) : signals;

    return [...f].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "imb": // rank
            return (a.imb || 0) - (b.imb || 0);
          case "time":
            return (a.time || "").localeCompare(b.time || "");
          case "name":
            return (a.name || "").localeCompare(b.name || "");
          case "mass_cr": // rvol now
            return (a.mass_cr || 0) - (b.mass_cr || 0);
          case "surge": // growth_pct
            return (a.surge || 0) - (b.surge || 0);
          case "delta": // velocity
            return (a.delta || 0) - (b.delta || 0);
          case "entry":
            return (a.entry || 0) - (b.entry || 0);
          default:
            return 0;
        }
      })();
      return ascending ? cmp : -cmp;
    });
  }, [signals, scope, activeTime, sortKey, ascending]);

  const headers: [string, string][] = [
    ["imb", "RANK"],
    ["time", "TIME"],
    ["name", "STOCK"],
    ["mass_cr", "RVOL NOW"],
    ["delta", "VELOCITY"],
    ["surge", "GROWTH%"],
    ["entry", "PRICE"],
  ];

  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            RFAC
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No signals for the selected date.
          </p>
          <p className="mt-1 font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
            Scanner runs 09:15-15:30 IST on trading days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5 md:px-4"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {(["LATEST", "ALL"] as const).map((v) => {
          const active = scope === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
              style={{
                color: active ? "#10b981" : "var(--color-muted)",
                borderColor: active ? "#10b98155" : "var(--color-border)",
                background: active ? "#10b98112" : "transparent",
                boxShadow: active ? "0 0 10px #10b98120" : "none",
              }}
            >
              {v === "LATEST" ? "LATEST CYCLE" : "ALL DAY"}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px" style={{ background: "var(--color-border)" }} />

        <select
          value={activeTime ?? ""}
          onChange={(e) => setSelectedTime(e.target.value || null)}
          disabled={scope !== "LATEST"}
          className="rounded-lg border px-2 py-1 font-mono text-[10px] tracking-[0.1em] bg-transparent disabled:opacity-40"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text2)" }}
        >
          {cycleTimes.map((t) => (
            <option key={t} value={t} style={{ background: "#0A0A0B" }}>
              {String(t).substring(0, 5)}
            </option>
          ))}
        </select>

        <span className="ml-auto font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          {filtered.length} ROWS
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <div
          className="sticky top-0 z-10 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[48px_66px_1fr_78px_78px_72px_80px] min-w-[720px]"
          style={{
            borderColor: "var(--color-border)",
            background: "rgba(10, 14, 23, 0.95)",
            backdropFilter: "blur(6px)",
          }}
        >
          {headers.map(([key, label], idx) => {
            const active = sortKey === key;
            const isRightAligned = idx >= 3;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (sortKey === key) setAscending((c) => !c);
                  else {
                    setSortKey(key);
                    setAscending(key === "imb");
                  }
                }}
                className={`font-mono text-[9px] tracking-[0.14em] ${isRightAligned ? "text-right" : "text-left"}`}
                style={{ color: active ? "#10b981" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>

        {filtered.map((signal, idx) => {
          const rowId = `${signal.name}-${signal.time}-${idx}`;
          const rank = signal.imb || idx + 1;
          const time = (signal.time || "--:--").substring(0, 5);
          const rvol = typeof signal.mass_cr === "number" ? signal.mass_cr.toFixed(2) : "--";
          const velocity = typeof signal.delta === "number" ? signal.delta.toFixed(2) : "--";
          const growth = typeof signal.surge === "number" ? signal.surge.toFixed(1) : "--";
          const price = typeof signal.entry === "number" && signal.entry > 0 ? signal.entry.toFixed(2) : "--";
          const isTop3 = rank <= 3;

          return (
            <div
              key={rowId}
              className="grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[48px_66px_1fr_78px_78px_72px_80px] min-w-[720px] hover:bg-[#ffffff04] transition-colors"
              style={{
                borderColor: "var(--color-border)",
                background: isTop3 ? "rgba(16,185,129,0.05)" : "transparent",
              }}
            >
              <span
                className="font-mono text-[11px] font-bold"
                style={{ color: isTop3 ? "#10b981" : "var(--color-muted2)" }}
              >
                #{rank}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {time}
              </span>
              <a
                href={buildTradingViewUrl(signal.name, signal.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-[13px] font-semibold hover:underline"
                style={{ color: "var(--color-text2)" }}
              >
                {signal.name}
              </a>
              <span className="text-right font-mono text-[11px] font-semibold" style={{ color: "var(--color-text)" }}>
                {rvol}x
              </span>
              <span
                className="text-right font-mono text-[11px] font-semibold"
                style={{ color: (signal.delta || 0) > 0 ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {(signal.delta || 0) > 0 ? "+" : ""}{velocity}x
              </span>
              <span
                className="text-right font-mono text-[11px]"
                style={{ color: (signal.surge || 0) > 0 ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {(signal.surge || 0) > 0 ? "+" : ""}{growth}%
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {price}
              </span>
            </div>
          );
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      ` }} />
    </div>
  );
}
