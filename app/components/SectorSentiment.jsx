"use client";
import { useState, useEffect, useCallback } from "react";

const MOCK = [
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


export default function SectorSentiment() {
  const [data,        setData]        = useState(MOCK);
  const [loading,     setLoading]     = useState(false);
  const [isMock,      setIsMock]      = useState(true);
  const [scanTime,    setScanTime]    = useState("11:15");
  const [updatedAt,   setUpdatedAt]   = useState(null);
  const [animated,    setAnimated]    = useState(false);

  const load = useCallback(async () => {
    try {
      const date = new Date().toISOString().split("T")[0];
      const url  = `/api/sector?date=${date}`;
      const res  = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          setData(json);
          setIsMock(false);
          if (json[0]?.scan_time) setScanTime(json[0].scan_time);
          setUpdatedAt(new Date());
        }
      }
    } catch (e) { /* keep mock */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [data]);

  const bullSectors = [...data]
    .filter(d => d.bull_pct >= d.bear_pct)
    .sort((a, b) => b.bull_pct - a.bull_pct);

  const bearSectors = [...data]
    .filter(d => d.bear_pct > d.bull_pct)
    .sort((a, b) => b.bear_pct - a.bear_pct);

  const totalBull = bullSectors.reduce((s, d) => s + d.bull_count, 0);
  const totalBear = bearSectors.reduce((s, d) => s + d.bear_count, 0);
  const grandTotal = data.reduce((s, d) => s + d.total, 0);

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "0.25rem 0 1rem" }}>

      {/* ── Header ── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        paddingBottom: "0.75rem", marginBottom: "0.75rem",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>
            Sector Sentiment
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
            <span style={{ fontFamily: "var(--font-mono)" }}>{scanTime} IST</span>
            {isMock && <span style={{ fontFamily: "var(--font-sans)", opacity: 0.5 }}>· demo</span>}
            {loading && <span style={{ opacity: 0.5 }}>· updating…</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <Pill color="#22863a" label={`${bullSectors.length} bull`} count={`${totalBull} stocks`} />
          <Pill color="#cb2431" label={`${bearSectors.length} bear`} count={`${totalBear} stocks`} />
          <button
            onClick={load}
            style={{
              fontSize: 11, padding: "3px 8px", cursor: "pointer",
              fontFamily: "var(--font-mono)",
              background: "transparent",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              color: "var(--color-text-secondary)",
            }}
          >
            refresh
          </button>
        </div>
      </div>

      {/* ── Column header row ── */}
      <ColHeader />

      {/* ── Bull Sectors ── */}
      {bullSectors.length > 0 && (
        <section style={{ marginBottom: "1.25rem" }}>
          <SectionLabel color="#22863a" arrow="▲" label="bullish" />
          {bullSectors.map((item, i) => (
            <SectorRow
              key={item.sector}
              item={item}
              type="BULL"
              animated={animated}
              rank={i}
            />
          ))}
        </section>
      )}

      {/* ── Bear Sectors ── */}
      {bearSectors.length > 0 && (
        <section>
          <SectionLabel color="#cb2431" arrow="▼" label="bearish" />
          {bearSectors.map((item, i) => (
            <SectorRow
              key={item.sector}
              item={item}
              type="BEAR"
              animated={animated}
              rank={i}
            />
          ))}
        </section>
      )}

      {data.length === 0 && !loading && (
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", textAlign: "center", margin: "2rem 0" }}>
          No sector data available for today
        </p>
      )}

      {/* ── Footer ── */}
      <div style={{
        marginTop: "1rem", paddingTop: "0.75rem",
        borderTop: "0.5px solid var(--color-border-tertiary)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, color: "var(--color-text-tertiary)",
        fontFamily: "var(--font-mono)",
      }}>
        <span>{grandTotal} F&amp;O stocks tracked</span>
        {updatedAt && (
          <span>refreshed {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
        )}
        {isMock && <span>live data via sector-sentiment route</span>}
      </div>
    </div>
  );
}

function ColHeader() {
  const cell = {
    fontSize: 10, color: "var(--color-text-tertiary)",
    fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, paddingBottom: 4 }}>
      <div style={{ ...cell, width: 90, flexShrink: 0 }}>sector</div>
      <div style={{ flex: 1 }} />
      <div style={{ ...cell, width: 38, textAlign: "right" }}>pct</div>
      <div style={{ ...cell, width: 48, textAlign: "right" }}>stocks</div>
    </div>
  );
}

function SectionLabel({ color, arrow, label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      marginBottom: 4, marginTop: 2,
    }}>
      <span style={{ fontSize: 10, color, fontFamily: "var(--font-mono)", fontWeight: 500 }}>
        {arrow} {label}
      </span>
      <div style={{ flex: 1, height: "0.5px", background: color, opacity: 0.2 }} />
    </div>
  );
}

function SectorRow({ item, type, animated, rank }) {
  const isBull     = type === "BULL";
  const pct        = isBull ? item.bull_pct : item.bear_pct;
  const oppPct     = isBull ? item.bear_pct : item.bull_pct;
  const count      = isBull ? item.bull_count : item.bear_count;
  const isTop      = isBull ? item.is_top_bull : item.is_top_bear;

  const green      = "#22863a";
  const red        = "#cb2431";
  const barFill    = isBull ? green : red;
  const barBg      = isBull ? "rgba(34,134,58,0.09)" : "rgba(203,36,49,0.09)";
  const textClr    = isBull ? green : red;
  const mutedClr   = isBull ? "rgba(34,134,58,0.5)" : "rgba(203,36,49,0.5)";

  const barW       = animated ? `${(pct * 100).toFixed(1)}%` : "0%";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 0",
      borderBottom: "0.5px solid var(--color-border-tertiary)",
    }}>
      {/* Sector name */}
      <div style={{
        width: 90, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        {isTop ? (
          <span style={{
            fontSize: 9, fontFamily: "var(--font-mono)", fontWeight: 500,
            background: barFill, color: "#fff",
            padding: "1px 4px", borderRadius: 3, flexShrink: 0,
          }}>T2</span>
        ) : (
          <span style={{ width: 20, flexShrink: 0 }} />
        )}
        <span style={{
          fontSize: 12, fontWeight: 500,
          fontFamily: "var(--font-mono)",
          color: "var(--color-text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.sector}
        </span>
      </div>

      {/* Bar track with opp-side ghost */}
      <div style={{
        flex: 1, height: 18, background: barBg,
        borderRadius: 3, overflow: "hidden", position: "relative",
      }}>
        {/* Primary bar */}
        <div style={{
          position: "absolute", top: 0, left: 0,
          height: "100%",
          width: barW,
          background: barFill,
          borderRadius: 3,
          transition: "width 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
          display: "flex", alignItems: "center",
        }} />
        {/* Neutral tick at 50% */}
        <div style={{
          position: "absolute", top: 0, left: "50%",
          width: "0.5px", height: "100%",
          background: "var(--color-border-tertiary)",
        }} />
        {/* Sector name inside bar for wide bars */}
        {pct > 0.55 && (
          <div style={{
            position: "absolute", left: 6, top: 0, bottom: 0,
            display: "flex", alignItems: "center",
            fontSize: 10, color: "#fff",
            fontFamily: "var(--font-mono)", fontWeight: 500,
            pointerEvents: "none",
          }}>
            {(oppPct * 100).toFixed(0)}% opp
          </div>
        )}
      </div>

      {/* Percentage */}
      <div style={{
        width: 38, textAlign: "right", flexShrink: 0,
        fontSize: 12, fontWeight: 500,
        fontFamily: "var(--font-mono)",
        color: textClr,
      }}>
        {(pct * 100).toFixed(0)}%
      </div>

      {/* Stock count */}
      <div style={{
        width: 48, textAlign: "right", flexShrink: 0,
        fontSize: 11, fontFamily: "var(--font-mono)",
        color: "var(--color-text-secondary)",
      }}>
        {count}/{item.total}
      </div>
    </div>
  );
}

function Pill({ color, label, count }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color, fontFamily: "var(--font-mono)" }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>
        {count}
      </span>
    </div>
  );
}
