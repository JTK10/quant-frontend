"use client";
import { useState, useEffect, useCallback } from "react";

type SectorItem = {
  sector: string;
  bull_count: number;
  bear_count: number;
  total: number;
  bull_pct: number;
  bear_pct: number;
  strength: number;
  is_top_bull: boolean;
  is_top_bear: boolean;
  scan_time: string;
};

const MOCK: SectorItem[] = [
  { sector:"BANKING",   bull_count:16, bear_count:4,  total:20, bull_pct:0.800, bear_pct:0.200, strength:0.800, is_top_bull:true,  is_top_bear:false, scan_time:"11:15" },
  { sector:"AUTO",      bull_count:13, bear_count:5,  total:18, bull_pct:0.722, bear_pct:0.278, strength:0.722, is_top_bull:true,  is_top_bear:false, scan_time:"11:15" },
  { sector:"IT",        bull_count:11, bear_count:7,  total:18, bull_pct:0.611, bear_pct:0.389, strength:0.611, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
  { sector:"NBFC",      bull_count:9,  bear_count:6,  total:15, bull_pct:0.600, bear_pct:0.400, strength:0.600, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
  { sector:"ENERGY",    bull_count:8,  bear_count:6,  total:14, bull_pct:0.571, bear_pct:0.429, strength:0.571, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
  { sector:"INFRA",     bull_count:7,  bear_count:7,  total:14, bull_pct:0.500, bear_pct:0.500, strength:0.500, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
  { sector:"INSURANCE", bull_count:4,  bear_count:6,  total:10, bull_pct:0.400, bear_pct:0.600, strength:0.600, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
  { sector:"REALTY",    bull_count:4,  bear_count:8,  total:12, bull_pct:0.333, bear_pct:0.667, strength:0.667, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
  { sector:"FMCG",      bull_count:5,  bear_count:11, total:16, bull_pct:0.313, bear_pct:0.688, strength:0.688, is_top_bull:false, is_top_bear:true,  scan_time:"11:15" },
  { sector:"PHARMA",    bull_count:4,  bear_count:11, total:15, bull_pct:0.267, bear_pct:0.733, strength:0.733, is_top_bull:false, is_top_bear:true,  scan_time:"11:15" },
  { sector:"METALS",    bull_count:3,  bear_count:11, total:14, bull_pct:0.214, bear_pct:0.786, strength:0.786, is_top_bull:false, is_top_bear:false, scan_time:"11:15" },
];

const BULL = "#00e89a";
const BEAR = "#ff3b6b";

export default function SectorSentiment() {
  const [data, setData]           = useState<SectorItem[]>(MOCK);
  const [loading, setLoading]     = useState(false);
  const [isMock, setIsMock]       = useState(true);
  const [scanTime, setScanTime]   = useState<string>("11:15");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [animated, setAnimated]   = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const date = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/sector-sentiment?date=${date}`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          setData(json);
          setIsMock(false);
          if (json[0]?.scan_time) setScanTime(json[0].scan_time);
          setUpdatedAt(new Date());
        }
      }
    } catch { /* keep mock */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [data]);

  const bullSectors = [...data].filter(d => d.bull_pct >= d.bear_pct).sort((a, b) => b.bull_pct - a.bull_pct);
  const bearSectors = [...data].filter(d => d.bear_pct > d.bull_pct).sort((a, b) => b.bear_pct - a.bear_pct);
  const totalBull = bullSectors.reduce((s, d) => s + d.bull_count, 0);
  const totalBear = bearSectors.reduce((s, d) => s + d.bear_count, 0);
  const grandTotal = data.reduce((s, d) => s + d.total, 0);

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
              {scanTime} IST
            </span>
            {isMock && <span className="font-mono text-[9px] tracking-[0.14em]" style={{ color: "var(--color-muted)", opacity: 0.5 }}>DEMO</span>}
            {loading && <span className="font-mono text-[9px]" style={{ color: "var(--color-muted)", opacity: 0.5 }}>updating…</span>}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: BULL }} />
            <span className="font-mono text-[11px] font-semibold" style={{ color: BULL }}>
              {bullSectors.length} bull
            </span>
            <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
              {totalBull} stocks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: BEAR }} />
            <span className="font-mono text-[11px] font-semibold" style={{ color: BEAR }}>
              {bearSectors.length} bear
            </span>
            <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
              {totalBear} stocks
            </span>
          </div>
          <button
            onClick={load}
            className="rounded-lg border px-2 py-1 font-mono text-[9px] tracking-[0.14em]"
            style={{ color: "var(--color-muted)", borderColor: "var(--color-border)", background: "transparent" }}
          >
            refresh
          </button>
        </div>
      </div>

      {/* ── Bullish ── */}
      {bullSectors.length > 0 && (
        <section className="mb-5">
          <SectionLabel color={BULL} arrow="▲" label="BULLISH SECTORS" />
          {bullSectors.map((item) => (
            <SectorRow key={item.sector} item={item} type="BULL" animated={animated} />
          ))}
        </section>
      )}

      {/* ── Bearish ── */}
      {bearSectors.length > 0 && (
        <section className="mb-5">
          <SectionLabel color={BEAR} arrow="▼" label="BEARISH SECTORS" />
          {bearSectors.map((item) => (
            <SectorRow key={item.sector} item={item} type="BEAR" animated={animated} />
          ))}
        </section>
      )}

      {data.length === 0 && !loading && (
        <p className="text-center font-mono text-[11px] py-8" style={{ color: "var(--color-muted)" }}>
          No sector data available for today
        </p>
      )}

      {/* ── Footer ── */}
      <div
        className="flex items-center justify-between pt-3 mt-3 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
          {grandTotal} F&O stocks tracked
        </span>
        {updatedAt && (
          <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
            refreshed {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function SectionLabel({ color, arrow, label }: { color: string; arrow: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2 mt-1">
      <span className="font-mono text-[9px] tracking-[0.18em] font-semibold" style={{ color }}>
        {arrow} {label}
      </span>
      <div className="flex-1 h-px" style={{ background: color, opacity: 0.15 }} />
    </div>
  );
}

function SectorRow({ item, type, animated }: { item: SectorItem; type: string; animated: boolean }) {
  const isBull  = type === "BULL";
  const pct     = isBull ? item.bull_pct : item.bear_pct;
  const oppPct  = isBull ? item.bear_pct : item.bull_pct;
  const count   = isBull ? item.bull_count : item.bear_count;
  const isTop   = isBull ? item.is_top_bull : item.is_top_bear;
  const barFill = isBull ? BULL : BEAR;
  const barBg   = isBull ? "rgba(0,232,154,0.06)" : "rgba(255,59,107,0.06)";
  const barW    = animated ? `${(pct * 100).toFixed(1)}%` : "0%";

  return (
    <div
      className="grid items-center gap-2 py-2 border-b"
      style={{
        gridTemplateColumns: "80px 1fr 40px 48px",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Sector name */}
      <div className="flex items-center gap-1.5 min-w-0">
        {isTop && (
          <span
            className="font-mono text-[7px] font-bold px-1 py-0.5 rounded"
            style={{ background: barFill, color: "#0a0e17" }}
          >
            TOP
          </span>
        )}
        <span
          className="truncate font-mono text-[11px] font-semibold"
          style={{ color: "var(--color-text2)" }}
        >
          {item.sector}
        </span>
      </div>

      {/* Bar */}
      <div className="h-5 rounded-sm overflow-hidden relative" style={{ background: barBg }}>
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{
            width: barW,
            background: barFill,
            transition: "width 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {/* 50% tick */}
        <div
          className="absolute inset-y-0"
          style={{ left: "50%", width: "1px", background: "rgba(255,255,255,0.06)" }}
        />
        {/* Opp % label inside bar */}
        {pct > 0.55 && (
          <span
            className="absolute left-1.5 top-0 bottom-0 flex items-center font-mono text-[8px] font-semibold"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            {(oppPct * 100).toFixed(0)}% opp
          </span>
        )}
      </div>

      {/* Pct */}
      <span
        className="text-right font-mono text-[11px] font-semibold"
        style={{ color: barFill }}
      >
        {(pct * 100).toFixed(0)}%
      </span>

      {/* Count */}
      <span
        className="text-right font-mono text-[10px]"
        style={{ color: "var(--color-muted2)" }}
      >
        {count}/{item.total}
      </span>
    </div>
  );
}
