"use client";
import { useState, useEffect, useCallback } from "react";

type SectorItem = {
  Sector: string;
  SectorRVOL: string;
  RVOL_Color: string;
  CandleTime: string;
  TopStock: string;
  TopStockRVOL: string;
  StockCount: number;
};

const BULL = "#00e89a";
const BEAR = "#ff3b6b";

export default function SectorSentiment() {
  const [data, setData]           = useState<SectorItem[]>([]);
  const [loading, setLoading]     = useState(false);
  const [scanTime, setScanTime]   = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [animated, setAnimated]   = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const date = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/sector-sentiment?date=${date}`);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          setData(json);
          // NEW SECTOR PAYLOAD USES CandleTime
          if (json.length > 0 && json[0]?.CandleTime) {
            setScanTime(json[0].CandleTime);
          }
          setUpdatedAt(new Date());
        }
      }
    } catch { /* Error loading data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 150);
    return () => clearTimeout(t);
  }, [data]);

  // Sort by RVOL descending
  const sortedData = [...data].sort((a, b) => parseFloat(b.SectorRVOL || "0") - parseFloat(a.SectorRVOL || "0"));
  const totalBull = data.filter(d => (d.RVOL_Color || "").toUpperCase() === "GREEN").length;
  const totalBear = data.filter(d => (d.RVOL_Color || "").toUpperCase() === "RED").length;
  const grandTotal = data.reduce((s, d) => s + (Number(d.StockCount) || 0), 0);

  const maxRvol = Math.max(...sortedData.map(d => parseFloat(d.SectorRVOL || "0")), 1);

  // Generate dynamic Y ticks around the max RVOL value
  const maxRvolRound = Math.ceil(maxRvol * 2) / 2; // e.g. 2.3 -> 2.5
  const yTicks = [maxRvolRound, maxRvolRound * 0.8, maxRvolRound * 0.6, maxRvolRound * 0.4, maxRvolRound * 0.2, 0].map(v => Number(v.toFixed(1)));

  return (
    <div className="flex flex-col h-full font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-10">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
              {scanTime ? `${scanTime} IST` : "AWAITING DATA"}
            </span>
            {loading && <span className="font-mono text-[9px]" style={{ color: "var(--color-muted)", opacity: 0.5 }}>updating…</span>}
          </div>
        </div>

        <div className="flex items-center gap-4 border border-[rgba(255,255,255,0.05)] bg-[#0a0e17] px-3 py-1.5 rounded shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(0,232,154,0.4)]" style={{ background: BULL }} />
            <span className="font-mono text-[10px] font-semibold tracking-wide" style={{ color: BULL }}>
              {totalBull} BULLISH
            </span>
          </div>
          <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.15)" }} />
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(255,59,107,0.4)]" style={{ background: BEAR }} />
            <span className="font-mono text-[10px] font-semibold tracking-wide" style={{ color: BEAR }}>
              {totalBear} BEARISH
            </span>
          </div>
        </div>
      </div>

      {data.length === 0 && !loading && (
        <p className="text-center font-mono text-[11px] py-12" style={{ color: "var(--color-muted)" }}>
          No sector data available
        </p>
      )}

      {/* ── Chart Area ── */}
      {data.length > 0 && (
        <div className="flex-1 min-h-[400px] flex w-full relative mb-16">
          
          {/* Y Axis Labels */}
          <div className="flex flex-col justify-between h-[300px] text-right pr-4 shrink-0 w-[45px]">
            {yTicks.map(val => (
              <span key={val} className="text-[10px] font-mono translate-y-[5px] font-semibold" style={{ color: "var(--color-muted)" }}>
                {val === 0 ? "0" : val.toFixed(1) + "x"}
              </span>
            ))}
          </div>

          {/* Chart Core */}
          <div className="flex-1 relative h-[300px] border-l border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            
            {/* Horizontal Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
              {yTicks.map((val, i) => (
                <div 
                  key={val} 
                  className={`w-full border-t h-0 ${i === 5 ? 'border-transparent' : 'border-[rgba(255,255,255,0.03)]'}`} 
                />
              ))}
            </div>

            {/* Bars Container */}
            <div className="absolute inset-0 flex items-end justify-around px-2 z-10 bottom-[1px]">
              {sortedData.map(item => {
                const isBull = (item.RVOL_Color || "").toUpperCase() === "GREEN";
                const color = isBull ? BULL : BEAR;
                const rvolVal = parseFloat(item.SectorRVOL || "0");
                const heightPct = maxRvolRound > 0 ? (rvolVal / maxRvolRound) * 100 : 0;
                const cleanSector = (item.Sector || "").replace("NIFTY_", "").replace("_", " ");

                return (
                  <div key={item.Sector} className="flex flex-col items-center h-full group relative w-full px-[2%] max-w-[60px]">
                    
                    {/* Bar */}
                    <div className="flex-1 flex items-end justify-center w-full relative">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#141a27] border border-[rgba(255,255,255,0.1)] text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 font-mono tracking-wider font-semibold pointer-events-none" style={{ color }}>
                        {rvolVal.toFixed(2)}x {isBull ? 'VOL' : 'VOL'}
                      </div>
                      
                      <div 
                        className="w-full max-w-[22px] rounded-t transition-all duration-[900ms] ease-out hover:brightness-125 cursor-pointer" 
                        style={{ 
                          height: animated ? `${Math.min(100, heightPct)}%` : '0%', 
                          backgroundColor: color,
                          boxShadow: `inset 0 0 10px rgba(0,0,0,0.1), 0 0 8px ${color}33`,
                          opacity: 0.95
                        }} 
                      />
                    </div>

                    {/* X Axis Rotated Label */}
                    <div className="absolute top-[100%] left-1/2 w-0 h-[100px] pt-4">
                      <span 
                        className="absolute left-0 top-3 origin-top-left text-[9px] font-mono whitespace-nowrap tracking-widest transition-colors group-hover:text-[rgba(255,255,255,0.9)]"
                        style={{ 
                          transform: "rotate(90deg) translateX(0) translateY(-50%)", 
                          color: "var(--color-muted)" 
                        }}
                      >
                        {cleanSector}
                      </span>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-4 mt-auto border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
          {grandTotal} F&O stocks tracked
        </span>
        {updatedAt && (
          <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
            updated {updatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

