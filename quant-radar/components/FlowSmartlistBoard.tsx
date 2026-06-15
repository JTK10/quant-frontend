"use client";

import { useState } from "react";
import type { FlowSmartlistCategory } from "@/utils/backend";
import { buildTradingViewUrl } from "@/utils/backend";
import tokenMapData from "@/utils/tokenMap.json";

const tokenMap: Record<string, string> = tokenMapData;

export default function FlowSmartlistBoard({ data }: { data: Record<string, FlowSmartlistCategory> }) {
  const [sortConfig, setSortConfig] = useState<Record<string, { key: "oi" | "price" | null; asc: boolean }>>({});

  const handleSort = (category: string, key: "oi" | "price") => {
    setSortConfig(prev => {
      const current = prev[category];
      if (current?.key === key) {
        return { ...prev, [category]: { key, asc: !current.asc } };
      }
      return { ...prev, [category]: { key, asc: false } };
    });
  };

  const categories = Object.entries(data);

  if (!categories.length) {
    return (
      <div className="p-4 text-center">
        <p className="font-mono text-[10px] tracking-widest text-gray-500">NO SMARTLIST DATA</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {categories.map(([categoryName, categoryData]) => (
        <div 
          key={categoryName}
          className="rounded-xl border p-4 flex flex-col"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-mono text-[11px] tracking-[0.15em] font-semibold" style={{ color: "var(--color-accent)" }}>
              {categoryName.replace(/_/g, " ")}
            </h3>
            <span className="font-mono text-[10px]" style={{ color: "var(--color-muted)" }}>
              {categoryData.count} STOCKS
            </span>
          </div>

          <div className="flex-1 overflow-auto max-h-[300px]">
            {categoryData.rows.length === 0 ? (
              <div className="text-center py-4 font-mono text-[10px] text-gray-500">EMPTY</div>
            ) : (
              <div className="space-y-2">
                {/* Column Headers */}
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-[9px] font-mono tracking-wider text-gray-500">SYMBOL</span>
                  <div className="flex gap-4 text-[9px] font-mono tracking-wider text-gray-500 w-[110px] justify-end">
                    <button 
                      type="button" 
                      onClick={() => handleSort(categoryName, "oi")}
                      className={`hover:text-white transition-colors ${sortConfig[categoryName]?.key === "oi" ? "text-[var(--color-accent)] font-bold" : ""}`}
                    >
                      {categoryName.includes("IV") ? "ΔIV%" : "ΔOI%"}{sortConfig[categoryName]?.key === "oi" ? (sortConfig[categoryName].asc ? "↑" : "↓") : ""}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => handleSort(categoryName, "price")}
                      className={`hover:text-white transition-colors ${sortConfig[categoryName]?.key === "price" ? "text-[var(--color-accent)] font-bold" : ""}`}
                    >
                      ΔPRICE%{sortConfig[categoryName]?.key === "price" ? (sortConfig[categoryName].asc ? "↑" : "↓") : ""}
                    </button>
                  </div>
                </div>
                {(() => {
                  const sConf = sortConfig[categoryName];
                  let rowsToRender = [...categoryData.rows];
                  if (sConf?.key) {
                    rowsToRender.sort((a, b) => {
                      const valA = sConf.key === "oi" ? (a.metric_chg_pct ?? a.OI_Chg_Pct ?? a.OIChgPct ?? a.IV_Chg_Pct ?? a.IVChgPct ?? a.iv_chg ?? 0) : (a.price_chg_pct ?? a.Price_Chg_Pct ?? a.PriceChgPct ?? 0);
                      const valB = sConf.key === "oi" ? (b.metric_chg_pct ?? b.OI_Chg_Pct ?? b.OIChgPct ?? b.IV_Chg_Pct ?? b.IVChgPct ?? b.iv_chg ?? 0) : (b.price_chg_pct ?? b.Price_Chg_Pct ?? b.PriceChgPct ?? 0);
                      return sConf.asc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
                    });
                  }
                  return rowsToRender.map((row: any, idx) => {
                    let symbol = row.trading_symbol || row.Symbol || row.Name || row.SK;
                    if (!symbol && row.instrument_key) {
                      const token = row.instrument_key.split('|').pop() || "";
                      symbol = tokenMap[token] || token;
                    }
                    if (!symbol) symbol = `row-${idx}`;

                    const oiChg = row.metric_chg_pct ?? row.OI_Chg_Pct ?? row.OIChgPct ?? row.IV_Chg_Pct ?? row.IVChgPct ?? row.iv_chg ?? 0;
                    const priceChg = row.price_chg_pct ?? row.Price_Chg_Pct ?? row.PriceChgPct ?? 0;

                  return (
                    <div key={symbol + idx} className="flex items-center justify-between py-1 border-b last:border-0 border-white/5">
                      <a
                        href={buildTradingViewUrl(symbol)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] font-medium hover:underline min-w-[80px]"
                        style={{ color: "var(--color-text2)" }}
                      >
                        {symbol}
                      </a>
                      
                      <div className="flex gap-4 w-[110px] justify-end text-[11px] font-mono">
                        {oiChg !== 0 && (
                          <span className={oiChg > 0 ? "text-green-400 w-[45px] text-right" : "text-red-400 w-[45px] text-right"}>
                            {oiChg > 0 ? "+" : ""}{Number(oiChg).toFixed(1)}%
                          </span>
                        )}
                        {priceChg !== 0 && (
                          <span className={priceChg > 0 ? "text-green-400 w-[45px] text-right" : "text-red-400 w-[45px] text-right"}>
                            {priceChg > 0 ? "+" : ""}{Number(priceChg).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
