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

type MasterStockRow = StockRow & {
  Sector: string;
  SectorChgPct: string;
  SectorStrengthVal: number;
};

const BULL = "#00e89a";
const BEAR = "#ff3b6b";

export default function MasterListClient({ dateStr }: { dateStr?: string }) {
  const [masterStocks, setMasterStocks] = useState<MasterStockRow[]>([]);
  const [loading, setLoading]     = useState(false);
  const [scanTime, setScanTime]   = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchDate = dateStr || new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/sector-sentiment?date=${fetchDate}`);
      if (res.ok) {
        const json: SectorItem[] = await res.json();
        if (Array.isArray(json)) {
          if (json.length > 0 && json[0]?.CandleTime) {
            setScanTime(json[0].CandleTime);
          }
          setUpdatedAt(new Date());

          let allTopStocks: MasterStockRow[] = [];
          
          for (const item of json) {
             let stocks: StockRow[] = [];
             try {
                stocks = item.Stocks ? JSON.parse(item.Stocks) : [];
                stocks.sort((a,b) => parseFloat(b.RMS || "0") - parseFloat(a.RMS || "0"));
             } catch(e) {}
             
             if (stocks.length > 0) {
                const top2 = stocks.slice(0, 2);
                const cleanSector = (item.Sector || "").replace("NIFTY_", "").replace("_", " ");
                const sectorStrengthVal = parseFloat(item.SectorChgPct || "0");
                top2.forEach(stock => {
                   allTopStocks.push({
                      ...stock,
                      Sector: cleanSector,
                      SectorChgPct: item.SectorChgPct || "0",
                      SectorStrengthVal: sectorStrengthVal
                   });
                });
             }
          }
          
          // Optionally sort all stocks globally by Sector Strength or RMS
          allTopStocks.sort((a, b) => b.SectorStrengthVal - a.SectorStrengthVal);
          
          setMasterStocks(allTopStocks);
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

  const totalUp = masterStocks.filter(s => s.Signal === 'up').length;
  const totalDown = masterStocks.filter(s => s.Signal === 'down').length;
  const pctUp = masterStocks.length ? ((totalUp / masterStocks.length) * 100).toFixed(2) : "0.00";
  const pctDown = masterStocks.length ? ((totalDown / masterStocks.length) * 100).toFixed(2) : "0.00";

  return (
    <div className="flex flex-col h-full font-sans">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
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
              {totalUp} BULLISH
            </span>
          </div>
          <div className="w-px h-3" style={{ background: "rgba(255,255,255,0.15)" }} />
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(255,59,107,0.4)]" style={{ background: BEAR }} />
            <span className="font-mono text-[10px] font-semibold tracking-wide" style={{ color: BEAR }}>
              {totalDown} BEARISH
            </span>
          </div>
        </div>
      </div>

      {masterStocks.length === 0 && !loading && (
        <p className="text-center font-mono text-[11px] py-12" style={{ color: "var(--color-muted)" }}>
          No sector data available
        </p>
      )}

      {/* ── Drilldown Table ── */}
      {masterStocks.length > 0 && (
        <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0a0e17] p-4 flex flex-col mb-12 flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-4">
             <h3 className="text-[13px] font-semibold text-white tracking-widest uppercase">Master List: Top 2 Stocks Per Sector</h3>
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
          <div className="w-full border border-[rgba(255,255,255,0.04)] rounded-lg overflow-hidden bg-[rgba(255,255,255,0.01)] flex-1 flex flex-col min-h-0">
            <div className="grid grid-cols-12 text-[10px] text-[rgba(255,255,255,0.4)] font-mono tracking-wider p-2.5 border-b border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] shrink-0">
               <div className="col-span-3">Symbol</div>
               <div className="col-span-3">Sector</div>
               <div className="col-span-2 text-right">Pre C</div>
               <div className="text-right">%</div>
               <div className="text-right flex items-center justify-end gap-1">RVOL <span className="text-[8px]">▼</span></div>
               <div className="text-right">RMS</div>
               <div className="text-center">Signal</div>
            </div>
            <div className="flex flex-col overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              {masterStocks.map((s, idx) => {
                const sectorBull = s.SectorStrengthVal >= 0;
                const sectorColor = sectorBull ? BULL : BEAR;

                return (
                <div key={`${s.Stock}-${idx}`} className={`grid grid-cols-12 items-center px-2.5 py-3 text-[11px] font-semibold font-mono border-b border-[rgba(255,255,255,0.02)] ${idx % 2 === 0 ? '' : 'bg-[rgba(255,255,255,0.01)]'} hover:bg-[rgba(255,255,255,0.05)] transition-colors`}>
                  <div className="col-span-3 flex items-center gap-2">
                     <div className="w-4 h-4 bg-[rgba(255,255,255,0.1)] rounded flex items-center justify-center text-[8px] opacity-70 shrink-0">✦</div>
                     <a href={buildTradingViewUrl(s.Stock)} target="_blank" rel="noopener noreferrer" className="text-[rgba(255,255,255,0.9)] truncate tracking-wide hover:text-[#00e89a] hover:underline cursor-pointer">
                       {s.Stock}
                     </a>
                  </div>
                  
                  <div className="col-span-3 flex items-center gap-2 truncate pr-2">
                    <span className="text-[rgba(255,255,255,0.7)] text-[10px] truncate">{s.Sector}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0" style={{
                      color: sectorColor, 
                      backgroundColor: sectorBull ? 'rgba(0,232,154,0.1)' : 'rgba(255,59,107,0.1)'
                    }}>
                      {sectorBull ? '+' : ''}{Number(s.SectorChgPct).toFixed(2)}%
                    </span>
                  </div>

                  <div className="col-span-2 text-right text-[rgba(255,255,255,0.8)]">{s.Close}</div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full inline-block" style={{color: 'rgba(255,255,255,0.9)', backgroundColor: s.Signal === 'up' ? 'rgba(0,232,154,0.15)' : 'rgba(255,59,107,0.15)', border: `1px solid ${s.Signal === 'up' ? 'rgba(0,232,154,0.3)' : 'rgba(255,59,107,0.3)'}`}}>
                      {Number(s.ChgPct).toFixed(2)}
                    </span>
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
              )})}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-4 mt-auto border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
          {masterStocks.length} F&O stocks tracked
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
