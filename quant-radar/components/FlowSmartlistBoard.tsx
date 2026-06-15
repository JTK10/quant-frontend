"use client";

import type { FlowSmartlistCategory } from "@/utils/backend";
import { buildTradingViewUrl } from "@/utils/backend";

export default function FlowSmartlistBoard({ data }: { data: Record<string, FlowSmartlistCategory> }) {
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
                {categoryData.rows.map((row: any, idx) => {
                  let symbol = row.trading_symbol || row.Symbol || row.Name || row.SK;
                  if (!symbol && row.instrument_key) {
                    symbol = row.instrument_key.split('|').pop();
                  }
                  if (!symbol) symbol = `row-${idx}`;

                  const oiChg = row.metric_chg_pct ?? row.OI_Chg_Pct ?? row.OIChgPct ?? 0;
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
                      
                      <div className="flex gap-3 text-[11px] font-mono">
                        {oiChg !== 0 && (
                          <span className={oiChg > 0 ? "text-green-400" : "text-red-400"}>
                            {oiChg > 0 ? "+" : ""}{Number(oiChg).toFixed(1)}% OI
                          </span>
                        )}
                        {priceChg !== 0 && (
                          <span className={priceChg > 0 ? "text-green-400" : "text-red-400"}>
                            {priceChg > 0 ? "+" : ""}{Number(priceChg).toFixed(1)}% P
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
