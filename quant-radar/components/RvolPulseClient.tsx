"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Star, Clock, Trophy, Target } from "lucide-react";
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

function PanelRow({ item, index, maxRms, side }: { item: RvolPulseItem; index: number; maxRms: number; side: "LONG" | "SHORT" }) {
  const isPos = item.chg >= 0;
  const barColor = side === "LONG" ? "var(--color-bull)" : "var(--color-bear)";
  const bgWidth = maxRms > 0 ? (item.rms / maxRms) * 100 : 0;
  const rvolStyle = getRvolColor(item.color);

  return (
    <div className="relative group overflow-hidden border-b last:border-0" style={{ borderColor: "var(--color-border)" }}>
      {/* Background RMS Bar */}
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
        style={{
          width: `${Math.min(bgWidth, 100)}%`,
          background: side === "LONG" ? "rgba(0,232,154,0.05)" : "rgba(255,59,107,0.05)",
          zIndex: 0
        }}
      />
      
      <div className="relative z-10 grid items-center gap-2 px-3 py-2.5 md:px-4" style={{ gridTemplateColumns: "24px 1fr 60px 50px 70px" }}>
        {/* Rank */}
        <span className="font-mono text-[10px] font-bold" style={{ color: "var(--color-muted)" }}>
          #{index + 1}
        </span>

        {/* Stock Info */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="truncate text-xs font-semibold" style={{ color: "var(--color-text2)" }}>
            {item.stock}
          </div>
          {item.signal && (
            <Star size={10} fill="var(--color-gold)" stroke="var(--color-gold)" className="flex-shrink-0" />
          )}
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
          style={{ color: isPos ? "var(--color-bull)" : "var(--color-bear)" }}
        >
          {isPos ? "+" : ""}{item.chg.toFixed(1)}%
        </span>

        {/* RMS Score */}
        <span className="text-right font-mono text-[11px] font-bold" style={{ color: barColor }}>
          {item.rms.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function RvolPanel({ data, side }: { data: RvolPulseItem[]; side: "LONG" | "SHORT" }) {
  const maxRms = useMemo(() => {
    return data.length > 0 ? Math.max(...data.map(d => d.rms)) : 0;
  }, [data]);

  return (
    <div className="flex-1 flex flex-col rounded-xl border overflow-hidden" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)", background: "rgba(10,14,23,0.95)" }}
      >
        <span
          className="font-mono text-[10px] tracking-[0.22em] font-bold"
          style={{ color: side === "LONG" ? "var(--color-bull)" : "var(--color-bear)" }}
        >
          {side} MOVERS
        </span>
        <span className="font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>
          {data.length} STOCKS
        </span>
      </div>

      <div
        className="grid items-center gap-2 border-b px-3 py-2 md:px-4"
        style={{
          gridTemplateColumns: "24px 1fr 60px 50px 70px",
          borderColor: "var(--color-border)",
          background: "var(--color-surface2)",
        }}
      >
        <span className="font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>RNK</span>
        <span className="font-mono text-[8px] tracking-[0.14em]" style={{ color: "var(--color-muted)" }}>SYMBOL</span>
        <span className="font-mono text-[8px] tracking-[0.14em] text-center" style={{ color: "var(--color-muted)" }}>RVOL</span>
        <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>CHG</span>
        <span className="font-mono text-[8px] tracking-[0.14em] text-right" style={{ color: "var(--color-muted)" }}>RMS</span>
      </div>

      <div className="flex-1 overflow-auto">
        {data.length > 0 ? (
          data.map((item, i) => (
            <PanelRow key={`${item.stock}-${item.rms}-${i}`} item={item} index={i} maxRms={maxRms} side={side} />
          ))
        ) : (
          <div className="flex items-center justify-center p-10">
            <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>NO DATA</span>
          </div>
        )}
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

  const longBoard = data?.longBoard || [];
  const shortBoard = data?.shortBoard || [];
  
  const topLong = longBoard.length > 0 ? longBoard[0] : null;
  const topShort = shortBoard.length > 0 ? shortBoard[0] : null;

  const activeSignals = [...longBoard, ...shortBoard].filter(x => x.signal).length;
  const lastUpdated = data?.lastUpdated ? data.lastUpdated.split(" ")[1] || data.lastUpdated : "--:--:--";

  return (
    <div className="flex flex-col h-full space-y-5">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="TOP LONG RMS"
          value={topLong ? topLong.stock : "-"}
          sub={topLong ? `RMS: ${topLong.rms.toFixed(2)}` : "Awaiting Data"}
          icon={Trophy}
          color="var(--color-bull)"
        />
        <StatCard
          label="TOP SHORT RMS"
          value={topShort ? topShort.stock : "-"}
          sub={topShort ? `RMS: ${topShort.rms.toFixed(2)}` : "Awaiting Data"}
          icon={Trophy}
          color="var(--color-bear)"
        />
        <StatCard
          label="ACTIVE SIGNALS"
          value={activeSignals}
          sub="Stars on Top 10 rows"
          icon={Target}
          color="var(--color-gold)"
        />
        <StatCard
          label="LAST UPDATED"
          value={lastUpdated}
          sub="Server Time"
          icon={Clock}
          color="#14b8a6"
        />
      </div>

      {/* Side-by-Side Panels */}
      <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0">
        <RvolPanel data={longBoard} side="LONG" />
        <RvolPanel data={shortBoard} side="SHORT" />
      </div>
    </div>
  );
}
