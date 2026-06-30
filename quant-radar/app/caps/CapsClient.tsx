"use client";

import React, { useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/utils/formatters"; // Assume these exist, or inline

export default function CapsClient({ signals }: { signals: any[] }) {
  const [filter, setFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");

  const filtered = useMemo(() => {
    let f = signals;
    if (filter !== "ALL") {
      f = f.filter(s => s.side === filter);
    }
    // Sort by time descending
    return f.sort((a, b) => {
      const ta = a.time || a.entry_time || "";
      const tb = b.time || b.entry_time || "";
      return tb.localeCompare(ta);
    });
  }, [signals, filter]);

  return (
    <div className="h-full flex flex-col">
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {["ALL", "LONG", "SHORT"].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab as any)}
            className={`px-4 py-1.5 rounded-full text-[11px] font-mono font-bold tracking-wider transition-all duration-300 border ${
              filter === tab
                ? tab === "LONG"
                  ? "bg-[#10b98115] text-[#10b981] border-[#10b98150] shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  : tab === "SHORT"
                  ? "bg-[#ef444415] text-[#ef4444] border-[#ef444450] shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                  : "bg-[#8b5cf615] text-[#8b5cf6] border-[#8b5cf650] shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                : "bg-transparent text-gray-500 border-[#ffffff10] hover:border-gray-600 hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto rounded-xl border border-[#ffffff10] bg-[#ffffff02] backdrop-blur-md shadow-2xl relative custom-scrollbar">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="sticky top-0 z-20 bg-[#0A0A0B]/90 backdrop-blur-lg shadow-md border-b border-[#ffffff10]">
            <tr>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase">Time</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase">Signal</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase">Symbol</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase">Cap Tier</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase text-right">Mass (Cr)</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase text-right">Delta (Cr)</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase text-right">Imb</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase text-right">Surge %</th>
              <th className="px-4 py-3 font-mono text-[10px] text-gray-400 tracking-widest font-semibold uppercase text-right">Entry</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ffffff08]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-500">
                    <div className="w-12 h-12 rounded-full bg-[#ffffff05] flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 12H4" />
                      </svg>
                    </div>
                    <span className="font-mono text-xs tracking-widest">NO SIGNALS FOUND</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s, idx) => {
                const isLong = s.side === "LONG";
                const sideColor = isLong ? "text-[#10b981]" : "text-[#ef4444]";
                const sideBg = isLong ? "bg-[#10b98110] border-[#10b98130]" : "bg-[#ef444410] border-[#ef444430]";
                const time = s.time || s.entry_time || "--:--";
                const mass = typeof s.mass_cr === "number" ? s.mass_cr.toFixed(1) : (s.mass_cr || "--");
                const delta = typeof s.delta === "number" ? s.delta.toFixed(1) : (s.delta || "--");
                const imb = typeof s.imb === "number" ? s.imb.toFixed(2) : (s.imb || "--");
                const surge = typeof s.surge === "number" ? s.surge.toFixed(2) : (s.surge || "--");
                
                return (
                  <tr 
                    key={idx} 
                    className="group hover:bg-[#ffffff06] transition-colors duration-200"
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-300 group-hover:text-white transition-colors">{time}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded border font-mono text-[9px] font-bold tracking-widest ${sideColor} ${sideBg}`}>
                        {s.side}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white tracking-wide text-sm">{s.name || s.tkr}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-[#8b5cf615] text-[#8b5cf6] border border-[#8b5cf630] font-mono text-[9px] font-semibold tracking-wider uppercase">
                        {s.cap || "LARGE"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-sm font-semibold text-white">
                        {mass}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm ${typeof s.delta === 'number' && s.delta > 0 ? "text-[#10b981]" : typeof s.delta === 'number' && s.delta < 0 ? "text-[#ef4444]" : "text-gray-300"}`}>
                        {typeof s.delta === 'number' && s.delta > 0 ? "+" : ""}{delta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-sm text-gray-300">
                        {imb}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-sm text-gray-300 group-hover:text-white transition-colors">
                        {surge}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-mono text-sm text-gray-400">
                        {s.entry}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}} />
    </div>
  );
}
