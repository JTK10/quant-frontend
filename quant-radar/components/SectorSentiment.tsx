"use client";
import { useState, useEffect, useCallback } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type SectorItem = {
  Sector: string;
  SectorRVOL: string;
  RVOL_Color: string;
  CandleTime: string;
  TopStock: string;
  TopStockRVOL?: string;
  StockCount?: number;
  BullCount?: number;
  BearCount?: number;
  SectorChgPct?: string;
  Stocks?: string;
};

type StockRow = {
  Stock: string;
  Close: string;
  ChgPct: string;
  RVOL: string;
  RMS?: string;
  Signal: "up" | "down";
};

const BULL = "#00e89a";
const BEAR = "#ff3b6b";

export default function SectorSentiment({ dateStr }: { dateStr?: string }) {
  const [data, setData]           = useState<SectorItem[]>([]);
  const [loading, setLoading]     = useState(false);
  const [scanTime, setScanTime]   = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [animated, setAnimated]   = useState<boolean>(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchDate = dateStr || new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/sector-sentiment?date=${fetchDate}`);
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
  }, [dateStr]);

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

  // Decide bullish vs bearish sector via underlying price change (falling back to simple bull > bear count if needed)
  const isSectorBullish = (d: SectorItem) => {
    if (d.SectorChgPct) return parseFloat(d.SectorChgPct) >= 0;
    return (d.BullCount || 0) >= (d.BearCount || 0);
  };

  const bullishSectors = data.filter(d => isSectorBullish(d));
  const bearishSectors = data.filter(d => !isSectorBullish(d));

  // Bullish: Highest RVOL on the left (index 0)
  bullishSectors.sort((a, b) => parseFloat(b.SectorRVOL || "0") - parseFloat(a.SectorRVOL || "0"));
  
  // Bearish: Lowest RVOL on the left, Highest RVOL on the far right
  bearishSectors.sort((a, b) => parseFloat(a.SectorRVOL || "0") - parseFloat(b.SectorRVOL || "0"));

  const sortedData = [...bullishSectors, ...bearishSectors];
  
  const totalBull = bullishSectors.length;
  const totalBear = bearishSectors.length;
  const grandTotal = data.reduce((s, d) => s + (Number(d.StockCount) || 0), 0);

  const maxRvol = Math.max(...data.map(d => parseFloat(d.SectorRVOL || "0")), 1);

  // Generate dynamic Y ticks around the max RVOL value 
  // We want ticks for: +maxY, +maxY/2, 0, -maxY/2, -maxY
  const maxY = Math.ceil(maxRvol * 2) / 2; // e.g. 2.3 -> 2.5
  const yTicks = [maxY, maxY / 2, 0, -(maxY / 2), -maxY];

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
        <div className="flex-1 min-h-[400px] flex w-full relative mb-24 mt-4">
          
          {/* Y Axis Labels */}
          <div className="flex flex-col justify-between h-[300px] text-right pr-4 shrink-0 w-[45px]">
            {yTicks.map((val, i) => (
              <span key={`ytick-${i}`} className="text-[10px] font-mono translate-y-[5px] font-semibold" style={{ color: "var(--color-muted)" }}>
                {val > 0 ? `+${val.toFixed(1)}x` : val < 0 ? `${val.toFixed(1)}x` : '0'}
              </span>
            ))}
          </div>

          {/* Chart Core */}
          <div className="flex-1 relative h-[300px] border-l border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            
            {/* Horizontal Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
              {yTicks.map((val, i) => (
                <div 
                  key={`grid-${i}`} 
                  className={`w-full border-t h-0 ${val === 0 ? 'border-[rgba(255,255,255,0.2)]' : 'border-[rgba(255,255,255,0.03)]'}`} 
                />
              ))}
            </div>

            {/* Bars Container */}
            <div className="absolute inset-0 flex items-end px-2 z-10 w-full justify-around h-full">
              {sortedData.map(item => {
                const isBull = isSectorBullish(item);
                const color = isBull ? BULL : BEAR;
                const rvolVal = parseFloat(item.SectorRVOL || "0");
                const heightPct = maxY > 0 ? (rvolVal / maxY) * 50 : 0; // max is 50%
                const cleanSector = (item.Sector || "").replace("NIFTY_", "").replace("_", " ");

                return (
                  <div key={item.Sector} className="relative w-full px-[2%] max-w-[60px] h-full group">
                    
                    {/* Bar */}
                    <div 
                        onClick={() => {
                          document.getElementById(`sector-card-${item.Sector}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="absolute w-full max-w-[22px] transition-all duration-[900ms] ease-out hover:brightness-125 cursor-pointer left-1/2 -translate-x-1/2" 
                        style={{ 
                          height: animated ? `${Math.min(50, heightPct)}%` : '0%', 
                          backgroundColor: color,
                          boxShadow: `inset 0 0 10px rgba(0,0,0,0.1), 0 0 8px ${color}33`,
                          opacity: 0.95,
                          ...(isBull ? { bottom: '50%', borderRadius: '4px 4px 0 0' } : { top: '50%', borderRadius: '0 0 4px 4px' })
                        }} 
                    >
                      {/* Tooltip on hover */}
                      <div className={`absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#141a27] border border-[rgba(255,255,255,0.1)] text-[9px] px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 font-mono tracking-wider font-semibold pointer-events-none ${isBull ? '-top-8' : '-bottom-8'}`} style={{ color }}>
                        {rvolVal.toFixed(2)}x VOL
                      </div>
                    </div>

                    {/* X Axis Rotated Label */}
                    <div className="absolute bottom-[-100px] left-1/2 w-0 h-[100px] pt-4">
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

      {/* ── Drilldown Tables ── */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-8 mb-12">
          {sortedData.map(item => {
            let stocks: StockRow[] = [];
            try {
               stocks = item.Stocks ? JSON.parse(item.Stocks) : [];
               stocks.sort((a,b) => parseFloat(b.RVOL) - parseFloat(a.RVOL));
            } catch(e) {}
            
            if (stocks.length === 0) return null;
            
            const cleanSector = (item.Sector || "").replace("NIFTY_", "").replace("_", " ");
            const totalUp = stocks.filter(s => s.Signal === 'up').length;
            const totalDown = stocks.filter(s => s.Signal === 'down').length;
            const pctUp = stocks.length ? ((totalUp / stocks.length) * 100).toFixed(2) : "0.00";
            const pctDown = stocks.length ? ((totalDown / stocks.length) * 100).toFixed(2) : "0.00";
            
            return (
              <div 
                key={item.Sector} 
                id={`sector-card-${item.Sector}`}
                className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0a0e17] p-4 flex flex-col"
              >
                <div className="flex items-center gap-2 mb-4">
                   <h3 className="text-[13px] font-semibold text-white tracking-widest uppercase">{cleanSector}</h3>
                   <span className="bg-[#ff1e56] text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide shadow-[0_0_8px_rgba(255,30,86,0.5)]">LIVE</span>
                   <div className="ml-auto w-32 h-7 bg-[rgba(255,255,255,0.04)] rounded-md border border-[rgba(255,255,255,0.06)] flex items-center px-2">
                     <span className="text-[10px] text-[rgba(255,255,255,0.3)] font-mono">Q ...</span>
                   </div>
                </div>
                
                {/* Progress Bar Header */}
                <div className="w-full h-1.5 rounded-full overflow-hidden mb-2 bg-[rgba(255,255,255,0.05)] flex shadow-inner">
                   <div style={{ width: `${pctUp}%`, backgroundColor: BULL, boxShadow: `0 0 10px ${BULL}` }}></div>
                   <div style={{ width: `${pctDown}%`, backgroundColor: BEAR, boxShadow: `0 0 10px ${BEAR}` }}></div>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono text-[rgba(255,255,255,0.5)] mb-4">
                   <div className="flex items-center gap-1.5">
                     <div className="w-2 h-2 rounded-full" style={{backgroundColor: BULL, boxShadow: `0 0 6px ${BULL}`}}></div>
                     <span>{totalUp} stocks ({pctUp}% Up)</span>
                   </div>
                   <div className="flex items-center gap-1.5">
                     <div className="w-2 h-2 rounded-full" style={{backgroundColor: BEAR, boxShadow: `0 0 6px ${BEAR}`}}></div>
                     <span>{totalDown} stocks ({pctDown}% Down)</span>
                   </div>
                </div>
                
                {/* Table */}
                <div className="w-full border border-[rgba(255,255,255,0.04)] rounded-lg overflow-hidden bg-[rgba(255,255,255,0.01)]">
                  <div className="grid grid-cols-7 text-[10px] text-[rgba(255,255,255,0.4)] font-mono tracking-wider p-2.5 border-b border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)]">
                     <div className="col-span-2">Symbol</div>
                     <div className="text-right">Pre C</div>
                     <div className="text-right">%</div>
                     <div className="text-right flex items-center justify-end gap-1">RVOL <span className="text-[8px]">▼</span></div>
                     <div className="text-right">RMS</div>
                     <div className="text-center">Signal</div>
                  </div>
                  <div className="flex flex-col max-h-[350px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                    {stocks.map((s, idx) => (
                      <div key={s.Stock} className={`grid grid-cols-7 items-center px-2.5 py-3 text-[11px] font-semibold font-mono border-b border-[rgba(255,255,255,0.02)] ${idx % 2 === 0 ? '' : 'bg-[rgba(255,255,255,0.01)]'} hover:bg-[rgba(255,255,255,0.05)] transition-colors`}>
                        <div className="col-span-2 flex items-center gap-2">
                           <div className="w-4 h-4 bg-[rgba(255,255,255,0.1)] rounded flex items-center justify-center text-[8px] opacity-70">✦</div>
                           <a href={buildTradingViewUrl(s.Stock)} target="_blank" rel="noopener noreferrer" className="text-[rgba(255,255,255,0.9)] truncate tracking-wide hover:text-[#00e89a] hover:underline cursor-pointer">
                             {s.Stock}
                           </a>
                        </div>
                        <div className="text-right text-[rgba(255,255,255,0.8)]">{s.Close}</div>
                        <div className="text-right px-2 py-0.5 rounded-full inline-block ml-auto w-fit" style={{color: 'rgba(255,255,255,0.9)', backgroundColor: s.Signal === 'up' ? 'rgba(0,232,154,0.15)' : 'rgba(255,59,107,0.15)', border: `1px solid ${s.Signal === 'up' ? 'rgba(0,232,154,0.3)' : 'rgba(255,59,107,0.3)'}`}}>
                           {Number(s.ChgPct).toFixed(2)}
                        </div>
                        <div className="text-right font-bold text-[12px]" style={{color: Number(s.RVOL) >= 2.0 ? '#ffb020' : (Number(s.RVOL) >= 1.5 ? 'var(--color-gold)' : 'rgba(255,255,255,0.8)')}}>
                           {Number(s.RVOL).toFixed(2)}
                        </div>
                        <div className="text-right font-bold text-[11px]" style={{color: Number(s.RMS || 0) >= 3.0 ? '#ffb020' : (Number(s.RMS || 0) >= 1.0 ? 'var(--color-gold)' : 'rgba(255,255,255,0.5)')}}>
                           {s.RMS ? Number(s.RMS).toFixed(1) : '–'}
                        </div>
                        <div className="text-center flex justify-center">
                           {s.Signal === 'up' ? (
                             <span className="text-[16px] leading-[0]" style={{color: BULL}}>⬆</span>
                           ) : (
                             <span className="text-[16px] leading-[0]" style={{color: BEAR}}>⬇</span>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
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

