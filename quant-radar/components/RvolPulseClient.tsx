"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Clock } from "lucide-react";
import type { RvolPulseData, RvolPulseItem } from "@/utils/backend";
import { buildTradingViewUrl } from "@/utils/backend";

type SortKey = "rank" | "name" | "dir" | "rvol" | "chg" | "rms";

function getRvolColor(color: "GREEN" | "ORANGE" | "YELLOW" | "GRAY") {
  switch (color) {
    case "GREEN":
      return { text: "var(--color-bull)", bg: "var(--color-bullbg)", border: "var(--color-bullborder)" };
    case "ORANGE":
      return { text: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)" };
    case "YELLOW":
      return { text: "#eab308", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.2)" };
    case "GRAY":
    default:
      return { text: "var(--color-muted)", bg: "rgba(255,255,255,0.05)", border: "var(--color-border)" };
  }
}

function BoardTable({ board }: { board: RvolPulseItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  const filtered = board.filter((s) => filter === "ALL" || s.dir === filter);

  const maxRms = useMemo(() => {
    return board.length > 0 ? Math.max(...board.map(d => d.rms)) : 0;
  }, [board]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aIdx = board.indexOf(a);
      const bIdx = board.indexOf(b);
      const cmp = (() => {
        switch (sortKey) {
          case "name":
            return a.stock.localeCompare(b.stock);
          case "dir":
            return a.dir.localeCompare(b.dir);
          case "rvol":
            return a.rvol - b.rvol;
          case "chg":
            return a.chg - b.chg;
          case "rms":
            return a.rms - b.rms;
          case "rank":
          default:
            return aIdx - bIdx;
        }
      })();
      return ascending ? cmp : -cmp;
    });
  }, [filtered, sortKey, ascending, board]);

  if (!board.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-2xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            RVOL PULSE
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No data for the selected date.
          </p>
        </div>
      </div>
    );
  }

  const headers: [SortKey, string][] = [
    ["rank", "#"],
    ["name", "SYMBOL"],
    ["dir", "DIR"],
    ["rvol", "RVOL"],
    ["chg", "CHG%"],
    ["rms", "RMS"],
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
          className="sticky top-0 z-20 grid items-center gap-2 border-b px-3 py-2 md:px-4 grid-cols-[30px_1fr_60px_60px_60px_60px] lg:grid-cols-[40px_1fr_80px_80px_80px_80px] min-w-[460px] lg:min-w-0"
          style={{
            borderColor: "var(--color-border)",
            background: "#0a0e17",
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
                className={`font-mono text-[9px] tracking-[0.14em] ${key === "rms" || key === "chg" || key === "rvol" ? "text-right" : key === "dir" ? "text-center" : "text-left"}`}
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
                {active ? (ascending ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {sorted.map((item, idx) => {
          const originalRank = board.indexOf(item) + 1;
          const rowId = `${item.stock}-${item.rms}-${idx}`;
          const isLong = item.dir === "LONG";
          const rvolStyle = getRvolColor(item.color);
          const bgWidth = maxRms > 0 ? (item.rms / maxRms) * 100 : 0;

          return (
              <div
                key={rowId}
                className="relative overflow-hidden grid items-center gap-2 border-b px-3 py-2.5 md:px-4 grid-cols-[30px_1fr_60px_60px_60px_60px] lg:grid-cols-[40px_1fr_80px_80px_80px_80px] min-w-[460px] lg:min-w-0"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* Background RMS Bar */}
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700 ease-out pointer-events-none"
                  style={{
                    width: `${Math.min(bgWidth, 100)}%`,
                    background: isLong ? "rgba(0,232,154,0.04)" : "rgba(255,59,107,0.04)",
                    zIndex: 0,
                  }}
                />

                {/* RANK */}
                <span className="relative z-10 font-mono text-[10px] font-bold" style={{ color: "var(--color-muted)" }}>
                  #{originalRank}
                </span>

                {/* NAME — inline TradingView link */}
                <div className="relative z-10 min-w-0">
                  <a
                    href={buildTradingViewUrl(item.stock)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[13px] font-semibold hover:underline block"
                    style={{ color: "var(--color-text2)" }}
                  >
                    {item.stock}
                  </a>
                </div>

                {/* DIR */}
                <div className="relative z-10 text-center">
                  <span
                    className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em]"
                    style={{
                      color: isLong ? "var(--color-bull)" : "var(--color-bear)",
                      borderColor: isLong ? "var(--color-bullborder)" : "var(--color-bearborder)",
                      background: isLong ? "var(--color-bullbg)" : "var(--color-bearbg)",
                    }}
                  >
                    {item.dir}
                  </span>
                </div>

                {/* RVOL */}
                <div className="relative z-10 text-right">
                  <span
                    className="inline-flex justify-center rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] font-semibold"
                    style={{
                      color: rvolStyle.text,
                      backgroundColor: rvolStyle.bg,
                      borderColor: rvolStyle.border,
                    }}
                  >
                    {item.rvol.toFixed(1)}x
                  </span>
                </div>

                {/* CHG% */}
                <span
                  className="relative z-10 text-right font-mono text-[11px] font-semibold"
                  style={{ color: isLong ? "var(--color-bull)" : "var(--color-bear)" }}
                >
                  {item.chg >= 0 ? "+" : ""}{item.chg.toFixed(1)}%
                </span>

                {/* RMS */}
                <span
                  className="relative z-10 text-right font-mono text-[11px] font-bold"
                  style={{ color: "var(--color-gold)" }}
                >
                  {item.rms.toFixed(1)}
                </span>
              </div>
          );
        })}
      </div>
    </div>
  );
}

export default function RvolPulseClient({ dateStr }: { dateStr?: string }) {
  const [data, setData] = useState<RvolPulseData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const load = useCallback(async () => {
    try {
      const params = dateStr ? `?date=${dateStr}` : "";
      const res = await fetch(`/api/rvol-pulse${params}`);
      if (!res.ok) throw new Error("Failed to fetch RVOL Pulse data");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    setLoading(true);
    load();
    const intervalId = setInterval(load, 5 * 60 * 1000); // 5 mins
    return () => clearInterval(intervalId);
  }, [load]);

  // Use the unified top25Board (fallback: combine old long+short boards)
  const board = useMemo(() => {
    if (!data) return [];
    if (data.top25Board && data.top25Board.length > 0) return data.top25Board;
    // Fallback for old data that only has longBoard/shortBoard
    return [...(data.longBoard || []), ...(data.shortBoard || [])]
      .sort((a, b) => b.rms - a.rms)
      .slice(0, 25);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
          LOADING RVOL PULSE...
        </span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: "var(--color-bear)" }}>
          {error.toUpperCase()}
        </span>
      </div>
    );
  }

  const lastUpdated = data?.lastUpdated || "--:--";

  return (
    <div className="flex flex-col h-full">
      {/* Leaderboard table — full height */}
      <div className="flex-1 flex flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
        {/* Header bar with title + last updated */}
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--color-border)", background: "rgba(10,14,23,0.95)" }}
        >
          <span
            className="font-mono text-[10px] tracking-[0.22em] font-bold"
            style={{ color: "var(--color-gold)" }}
          >
            CUMULATIVE RMS LEADERBOARD
          </span>
          <div className="flex items-center gap-1.5">
            <Clock size={11} style={{ color: "#14b8a6" }} />
            <span className="font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted2)" }}>
              {lastUpdated}
            </span>
            <span className="font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
              • since 09:15
            </span>
          </div>
        </div>

        <BoardTable board={board} />
      </div>
    </div>
  );
}
