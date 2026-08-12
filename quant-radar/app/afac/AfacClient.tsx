"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

const ACCENT = "#fce205";

export default function AfacClient({ signals, latestTime }: { signals: any[]; latestTime: string | null }) {
  const [sortKey, setSortKey] = useState<string>("imb");
  const [ascending, setAscending] = useState(true);
  const [scope, setScope] = useState<"LATEST" | "ALL">("LATEST");
  const [sideFilter, setSideFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  // vol_ahead <= 0.02 keeps only names with almost NOTHING traded ahead of
  // price in the break direction -- little overhead supply between price and
  // open air. It is the same condition SERVAL's TIER gate uses (vol_ahead <=
  // 0.072), just tighter.
  const [aheadFilter, setAheadFilter] = useState(false);

  const cycleTimes = useMemo(
    () => Array.from(new Set(signals.map((s) => s.time))).sort(),
    [signals]
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const activeTime = selectedTime ?? latestTime;

  const filtered = useMemo(() => {
    let f = scope === "LATEST" ? signals.filter((s) => s.time === activeTime) : signals;
    if (sideFilter !== "ALL") f = f.filter((s) => s.side === sideFilter);
    if (aheadFilter) f = f.filter((s) => typeof s.ahead === "number" && s.ahead <= 0.02);

    return [...f].sort((a, b) => {
      const cmp = (() => {
        switch (sortKey) {
          case "imb": // rank
            return (a.imb || 0) - (b.imb || 0);
          case "time":
            return (a.time || "").localeCompare(b.time || "");
          case "name":
            return (a.name || "").localeCompare(b.name || "");
          case "sector":
            return (a.sector || "").localeCompare(b.sector || "");
          case "score":
            return (a.score || 0) - (b.score || 0);
          case "scoreDelta":
            return (a.scoreDelta || 0) - (b.scoreDelta || 0);
          case "dyn":
            return (a.dyn || 0) - (b.dyn || 0);
          case "dpoc":
            return (a.dpoc || 0) - (b.dpoc || 0);
          case "ahead":
            return (a.ahead || 0) - (b.ahead || 0);
          case "chg":
            return (a.chg || 0) - (b.chg || 0);
          case "entry":
            return (a.entry || 0) - (b.entry || 0);
          default:
            return 0;
        }
      })();
      return ascending ? cmp : -cmp;
    });
  }, [signals, scope, activeTime, sortKey, ascending, sideFilter, aheadFilter]);

  const headers: [string, string][] = [
    ["imb", "RANK"],
    ["time", "TIME"],
    ["name", "STOCK"],
    ["sector", "SECTOR"],
    ["score", "AFAC.3"],
    ["scoreDelta", "Δ CYCLE"],
    ["dyn", "DYN"],
    ["dpoc", "DPOC%"],
    ["ahead", "AHEAD"],
    ["chg", "CHG%"],
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
            AFAC
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No signals for the selected date.
          </p>
          <p className="mt-1 font-mono text-[11px]" style={{ color: "var(--color-muted)" }}>
            Scanner runs 09:15-15:30 IST on trading days, snapshots every 5 min from ~09:45.
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
                color: active ? ACCENT : "var(--color-muted)",
                borderColor: active ? `${ACCENT}55` : "var(--color-border)",
                background: active ? `${ACCENT}12` : "transparent",
                boxShadow: active ? `0 0 10px ${ACCENT}20` : "none",
              }}
            >
              {v === "LATEST" ? "LATEST CYCLE" : "ALL DAY"}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px" style={{ background: "var(--color-border)" }} />

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
                color: active ? c : "var(--color-muted)",
                borderColor: active ? `${c}55` : "var(--color-border)",
                background: active ? `${c}12` : "transparent",
              }}
            >
              {v}
            </button>
          );
        })}

        <span className="mx-1 h-4 w-px" style={{ background: "var(--color-border)" }} />

        <button
          type="button"
          onClick={() => setAheadFilter((v) => !v)}
          title="Keep only vol_ahead <= 0.02 -- almost no traded volume ahead of price in the break direction"
          className="rounded-lg border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em] transition-all duration-300"
          style={{
            color: aheadFilter ? "#22d3ee" : "var(--color-muted)",
            borderColor: aheadFilter ? "#22d3ee55" : "var(--color-border)",
            background: aheadFilter ? "#22d3ee12" : "transparent",
          }}
        >
          AHEAD &le; 0.02
        </button>

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
      <div className="flex-1 overflow-auto custom-scrollbar-afac">
        <div
          className="sticky top-0 z-10 grid items-center border-b px-3 py-2.5 md:px-4 grid-cols-[40px_56px_minmax(150px,1.3fr)_84px_58px_62px_50px_60px_60px_58px_68px] gap-3 min-w-[1080px]"
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
                    setAscending(key === "imb");
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

        {filtered.map((signal, idx) => {
          const rowId = `${signal.name}-${signal.time}-${idx}`;
          const rank = signal.imb || idx + 1;
          const time = (signal.time || "--:--").substring(0, 5);
          const long = signal.side === "LONG";
          const score = typeof signal.score === "number" ? signal.score.toFixed(0) : "--";
          const delta = typeof signal.scoreDelta === "number" ? signal.scoreDelta : null;
          const dyn = typeof signal.dyn === "number" ? signal.dyn.toFixed(2) : "--";
          const dpoc = typeof signal.dpoc === "number" ? signal.dpoc.toFixed(2) : "--";
          const ahead = typeof signal.ahead === "number" ? signal.ahead.toFixed(3) : "--";
          const chg = typeof signal.chg === "number" ? signal.chg.toFixed(2) : "--";
          const price = typeof signal.entry === "number" && signal.entry > 0 ? signal.entry.toFixed(2) : "--";
          const isTop3 = rank <= 3;

          return (
            <div
              key={rowId}
              className="grid items-center border-b px-3 py-3 md:px-4 grid-cols-[40px_56px_minmax(150px,1.3fr)_84px_58px_62px_50px_60px_60px_58px_68px] gap-3 min-w-[1080px] hover:bg-[#ffffff04] transition-colors"
              style={{
                borderColor: "var(--color-border)",
                background: isTop3 ? `${ACCENT}0d` : "transparent",
              }}
            >
              <span
                className="font-mono text-[11px] font-bold"
                style={{ color: isTop3 ? ACCENT : "var(--color-muted2)" }}
              >
                #{rank}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {time}
              </span>
              <div className="min-w-0 flex items-center gap-1.5">
                <span
                  className="shrink-0 font-mono text-[10px] font-bold"
                  style={{ color: long ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {long ? "▲" : "▼"}
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
              </div>
              {(() => {
                const tags = (signal.sector || "").split(" / ").filter(Boolean);
                return (
                  <div className="min-w-0 flex items-center gap-1" title={signal.sector || ""}>
                    <span className="truncate font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
                      {tags[0] || "—"}
                    </span>
                    {tags.length > 1 && (
                      <span
                        className="shrink-0 rounded px-1 font-mono text-[9px]"
                        style={{ color: ACCENT, background: `${ACCENT}18` }}
                      >
                        +{tags.length - 1}
                      </span>
                    )}
                  </div>
                );
              })()}
              <span className="text-right font-mono text-[11px] font-bold" style={{ color: ACCENT }}>
                {score}
              </span>
              <span
                className="text-right font-mono text-[11px] font-semibold"
                style={{ color: delta === null ? "var(--color-muted2)" : delta > 0 ? "var(--color-bull)" : "var(--color-muted2)" }}
              >
                {delta === null ? "—" : delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)}
              </span>
              <span
                className="text-right font-mono text-[11px]"
                style={{ color: (signal.dyn ?? 0) >= 1.5 ? ACCENT : "var(--color-muted2)" }}
              >
                {dyn}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {dpoc}
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-muted2)" }}>
                {ahead}
              </span>
              <span
                className="text-right font-mono text-[11px]"
                style={{ color: (signal.chg || 0) > 0 ? "var(--color-bull)" : "var(--color-bear)" }}
              >
                {(signal.chg || 0) > 0 ? "+" : ""}{chg}%
              </span>
              <span className="text-right font-mono text-[11px]" style={{ color: "var(--color-text)" }}>
                {price}
              </span>
            </div>
          );
        })}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar-afac::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar-afac::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-afac::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
        .custom-scrollbar-afac::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }
      ` }} />
    </div>
  );
}
