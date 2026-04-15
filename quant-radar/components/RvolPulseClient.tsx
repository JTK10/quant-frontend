"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Clock, Trophy, TrendingUp, Zap } from "lucide-react";
import type { RvolPulseData, RvolPulseItem } from "@/utils/backend";

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

function StatCard({ label, value, sub, icon: Icon, color }: any) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[9px] tracking-[0.2em] font-semibold" style={{ color: "var(--color-muted)" }}>
          {label}
        </span>
        <Icon size={14} style={{ color }} />
      </div>
      <div>
        <div className="text-lg font-bold font-mono tracking-wide" style={{ color: "var(--color-text)" }}>
          {value}
        </div>
        <div className="font-mono text-[9px] tracking-[0.14em] mt-1" style={{ color: "var(--color-muted2)" }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

function PanelRow({ item, index, maxRms }: { item: RvolPulseItem; index: number; maxRms: number }) {
  const isLong = item.dir === "LONG";
  const barColor = isLong ? "var(--color-bull)" : "var(--color-bear)";
  const bgWidth = maxRms > 0 ? (item.rms / maxRms) * 100 : 0;
  const rvolStyle = getRvolColor(item.color);

  return (
    <div className="relative group overflow-hidden border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
      {/* Background RMS Bar */}
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
        style={{
          width: `${Math.min(bgWidth, 100)}%`,
          background: isLong ? "rgba(0,232,154,0.05)" : "rgba(255,59,107,0.05)",
          zIndex: 0
        }}
      />
      
      <div className="relative z-10 grid items-center gap-2 px-3 py-2.5 md:px-4" style={{ gridTemplateColumns: "24px 1fr 52px 60px 50px 70px" }}>
        {/* Rank */}
        <span className="font-mono text-[10px] font-bold" style={{ color: "var(--color-muted)" }}>
          #{index + 1}
        </span>

        {/* Stock Info */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="truncate text-xs font-semibold" style={{ color: "var(--color-text2)" }}>
            {item.stock}
          </div>
        </div>

        {/* Direction Badge */}
        <div className="text-center">
          <span
            className="inline-flex justify-center items-center rounded px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] font-bold"
            style={{
              color: isLong ? "var(--color-bull)" : "var(--color-bear)",
              backgroundColor: isLong ? "rgba(0,232,154,0.1)" : "rgba(255,59,107,0.1)",
              border: `1px solid ${isLong ? "rgba(0,232,154,0.25)" : "rgba(255,59,107,0.25)"}`,
            }}
          >
            {item.dir}
          </span>
        </div>

        {/* RVOL Badge */}
        <div className="text-center">
          <span
            className="inline-flex justify-center items-center rounded border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.08em] font-semibold"
            style={{
              color: rvolStyle.text,
              backgroundColor: rvolStyle.bg,
              borderColor: rvolStyle.border,
            }}
          >
            {item.rvol.toFixed(1)}x
          </span>
        </div>

        {/* Change % */}
        <span
          className="text-right font-mono text-[10px] font-semibold"
          style={{ color: isLong ? "var(--color-bull)" : "var(--color-bear)" }}
        >
          {item.chg >= 0 ? "+" : ""}{item.chg.toFixed(1)}%
        </span>

        {/* RMS Score */}
        <span className="text-right font-mono text-[11px] font-bold" style={{ color: barColor }}>
          {item.rms.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default function RvolPulseClient() {
  const [data, setData] = useState<RvolPulseData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rvol-pulse");
      if (!res.ok) throw new Error("Failed to fetch RVOL Pulse data");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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

  const maxRms = useMemo(() => {
    return board.length > 0 ? Math.max(...board.map(d => d.rms)) : 0;
  }, [board]);

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

  const topStock = board.length > 0 ? board[0] : null;
  const longCount = board.filter(x => x.dir === "LONG").length;
  const shortCount = board.filter(x => x.dir === "SHORT").length;
  const lastUpdated = data?.lastUpdated || "--:--";

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="TOP CUMULATIVE RMS"
          value={topStock ? topStock.stock : "-"}
          sub={topStock ? `RMS: ${topStock.rms.toFixed(2)} • ${topStock.dir}` : "Awaiting Data"}
          icon={Trophy}
          color="var(--color-gold)"
        />
        <StatCard
          label="LONG MOVERS"
          value={longCount}
          sub={`of ${board.length} in Top 25`}
          icon={TrendingUp}
          color="var(--color-bull)"
        />
        <StatCard
          label="SHORT MOVERS"
          value={shortCount}
          sub={`of ${board.length} in Top 25`}
          icon={Zap}
          color="var(--color-bear)"
        />
        <StatCard
          label="LAST UPDATED"
          value={lastUpdated}
          sub="Cumulative since 09:15"
          icon={Clock}
          color="#14b8a6"
        />
      </div>

      {/* Unified Top 25 Board */}
      <div className="flex-1 flex flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
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
          <span className="font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
            TOP {board.length} STOCKS
          </span>
        </div>

        <div
          className="grid items-center gap-2 border-b px-3 py-2 md:px-4"
          style={{
            gridTemplateColumns: "24px 1fr 52px 60px 50px 70px",
            borderColor: "var(--color-border)",
            background: "var(--color-surface2)",
          }}
        >
          <span className="font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>RNK</span>
          <span className="font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>SYMBOL</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-center" style={{ color: "var(--color-muted)" }}>DIR</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-center" style={{ color: "var(--color-muted)" }}>RVOL</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>CHG</span>
          <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>RMS</span>
        </div>

        <div className="flex-1 overflow-auto">
          {board.length > 0 ? (
            board.map((item, i) => (
              <PanelRow key={`${item.stock}-${item.rms}-${i}`} item={item} index={i} maxRms={maxRms} />
            ))
          ) : (
            <div className="flex items-center justify-center p-10">
              <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>NO DATA</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
