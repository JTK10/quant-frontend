"use client";

import { useEffect, useMemo, useState } from "react";
import { findChartSymbols, resolveChartSymbol } from "./chartSymbols";
import LiveCandleChart, { type Timeframe } from "./LiveCandleChart";
import {
  CHART_WATCHLIST_STORAGE_KEY,
  CHART_WATCHLIST_UPDATED_EVENT,
  getStoredChartWatchlist,
  readChartWatchlist,
  writeChartWatchlist,
} from "@/utils/chartWatchlist";

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "1D"];
const DEFAULT_SYMBOL = "RELIANCE";
const PANEL_DEFAULTS = ["RELIANCE", "NIFTY 50", "HDFCBANK", "INDIA VIX"];

type Layout = 1 | 2 | 4;
type ChartPanel = { symbol: string; timeframe: Timeframe };
type ChartsClientProps = { streamUrl: string; initialSymbol?: string };

const LAYOUTS: Layout[] = [1, 2, 4];
const layoutLabels: Record<Layout, string> = { 1: "Single", 2: "2 Charts", 4: "4 Charts" };

export default function ChartsClient({ streamUrl, initialSymbol }: ChartsClientProps) {
  const initial = resolveChartSymbol(initialSymbol ?? "")?.symbol ?? DEFAULT_SYMBOL;
  const [layout, setLayout] = useState<Layout>(1);
  const [activePanel, setActivePanel] = useState(0);
  const [panels, setPanels] = useState<ChartPanel[]>(() => PANEL_DEFAULTS.map((symbol, index) => ({
    symbol: index === 0 ? initial : symbol,
    timeframe: "5m",
  })));
  const [draftSymbol, setDraftSymbol] = useState(initial);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  
  // Watchlist states
  const [watchlist, setWatchlist] = useState<string[]>(PANEL_DEFAULTS);
  const [isAddingToWl, setIsAddingToWl] = useState(false);
  const [wlDraft, setWlDraft] = useState("");
  const [wlShowSuggestions, setWlShowSuggestions] = useState(false);
  const wlMatches = useMemo(() => findChartSymbols(wlDraft).slice(0, 8), [wlDraft]);

  const matches = useMemo(() => findChartSymbols(draftSymbol).slice(0, 8), [draftSymbol]);
  const selected = panels[activePanel] ?? panels[0];

  useEffect(() => {
    const stored = getStoredChartWatchlist();
    const handleUpdate = () => setWatchlist(readChartWatchlist(PANEL_DEFAULTS));
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CHART_WATCHLIST_STORAGE_KEY || event.key === null) handleUpdate();
    };
    window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleStorage);
    const initialSync = window.requestAnimationFrame(handleUpdate);
    if (stored === null) writeChartWatchlist(PANEL_DEFAULTS);
    return () => {
      window.cancelAnimationFrame(initialSync);
      window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const next = resolveChartSymbol(initialSymbol ?? "")?.symbol ?? DEFAULT_SYMBOL;
    setPanels((current) => current.map((panel, index) => index === 0 ? { ...panel, symbol: next } : panel));
    setActivePanel(0);
    setDraftSymbol(next);
  }, [initialSymbol]);

  const updatePanel = (patch: Partial<ChartPanel>) => {
    setPanels((current) => current.map((panel, index) => index === activePanel ? { ...panel, ...patch } : panel));
  };

  const chooseSymbol = (next: string) => {
    updatePanel({ symbol: next });
    setDraftSymbol(next);
    setShowSuggestions(false);
  };

  const submitSearch = () => {
    const exact = resolveChartSymbol(draftSymbol);
    if (exact) chooseSymbol(exact.symbol);
    else setShowSuggestions(true);
  };

  const addToWatchlist = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      const next = [...watchlist, symbol];
      setWatchlist(next);
      writeChartWatchlist(next);
    }
    setWlDraft("");
    setIsAddingToWl(false);
  };

  const removeFromWatchlist = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    const next = watchlist.filter((s) => s !== symbol);
    setWatchlist(next);
    writeChartWatchlist(next);
  };

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    setActivePanel((current) => Math.min(current, next - 1));
  };

  const visiblePanels = panels.slice(0, layout);
  const gridClass = layout === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2";

  return (
    <main className="h-screen w-full flex flex-col font-sans overflow-hidden bg-[#131722] text-[#D1D4DC]">
      {/* Top Toolbar */}
      <header className="h-[48px] bg-[#1E222D] border-b border-[#2A2E39] flex items-center px-4 gap-4 text-[13px] shrink-0">
        
        {/* Search Group */}
        <div className="flex items-center gap-1 border-r border-[#2A2E39] pr-4 h-full relative">
          <form onSubmit={(e) => { e.preventDefault(); submitSearch(); }} className="flex items-center">
            <input
              value={draftSymbol}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
              onChange={(e) => { setDraftSymbol(e.target.value.toUpperCase()); setShowSuggestions(true); }}
              className="bg-transparent border-none outline-none font-semibold text-[16px] w-[140px] uppercase placeholder:text-gray-600 focus:bg-[#2A2E39] px-2 py-1 rounded transition-colors"
              placeholder="SYMBOL"
              autoComplete="off"
            />
            <span className="text-[#787B86] text-[11px] ml-1">NSE</span>
          </form>

          {showSuggestions && matches.length > 0 && (
            <div className="absolute top-[40px] left-0 z-50 w-[300px] max-h-[300px] overflow-y-auto bg-[#1E222D] border border-[#2A2E39] rounded shadow-2xl py-1">
              {matches.map((match) => (
                <button
                  key={match.symbol}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseSymbol(match.symbol)}
                  className="w-full text-left px-4 py-2 hover:bg-[#2A2E39] transition-colors flex flex-col"
                >
                  <span className="font-mono text-sm font-semibold text-[#26A69A]">{match.symbol}</span>
                  <span className="text-xs text-[#787B86] truncate">{match.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeframes */}
        <div className="flex items-center gap-1 border-r border-[#2A2E39] pr-4 h-full">
          {TIMEFRAMES.map((val) => (
            <button
              key={val}
              onClick={() => updatePanel({ timeframe: val })}
              className={`px-3 py-1.5 rounded text-[13px] font-medium transition-colors ${selected.timeframe === val ? 'text-[#2962FF]' : 'text-[#D1D4DC] hover:bg-[#2A2E39]'}`}
            >
              {val}
            </button>
          ))}
        </div>

        {/* Indicators Dummy */}
        <div className="flex items-center gap-1 border-r border-[#2A2E39] pr-4 h-full">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-medium hover:bg-[#2A2E39] transition-colors">
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current"><path d="M4 19h16v-2H4v2zm0-4h16v-2H4v2zm0-4h16v-2H4v2zm0-8v2h16V3H4z"/></svg>
            Indicators
          </button>
        </div>

        {/* Layout Selector & Status */}
        <div className="flex items-center gap-1 ml-auto h-full">
           <span className="mr-4 font-mono text-[10px] tracking-wider" style={{ color: streamUrl ? "var(--color-bull)" : "var(--color-bear)" }}>
            {streamUrl ? "STREAM READY" : "NO STREAM"}
          </span>
          {LAYOUTS.map((val) => (
             <button
             key={val}
             onClick={() => chooseLayout(val)}
             className={`px-3 py-1.5 rounded text-[13px] font-medium transition-colors ${layout === val ? 'bg-[#2962FF] text-white' : 'text-[#D1D4DC] hover:bg-[#2A2E39]'}`}
           >
             {layoutLabels[val]}
           </button>
          ))}
        </div>
      </header>

      {/* Workspace */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar (Tools) */}
        <aside className="w-[52px] bg-[#131722] border-r border-[#2A2E39] flex flex-col items-center pt-2 gap-2 shrink-0">
          <div className="w-8 h-8 rounded flex items-center justify-center text-[#2962FF] cursor-pointer hover:bg-[#2A2E39] transition-colors">
             <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current"><path d="M12 2L4 10l1.4 1.4L11 5.8V22h2V5.8l5.6 5.6L20 10 12 2z"/></svg>
          </div>
          <div className="w-8 h-8 rounded flex items-center justify-center text-[#787B86] cursor-pointer hover:bg-[#2A2E39] hover:text-[#D1D4DC] transition-colors">
            <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current"><path d="M3 17h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V5H3z"/></svg>
          </div>
          <div className="w-8 h-8 rounded flex items-center justify-center text-[#787B86] cursor-pointer hover:bg-[#2A2E39] hover:text-[#D1D4DC] transition-colors">
             <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-current"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg>
          </div>
        </aside>

        {/* Main Chart Grid */}
        <main className={`flex-1 bg-[#131722] grid ${gridClass} gap-[1px] bg-[#2A2E39]`}>
          {streamUrl ? visiblePanels.map((panel, index) => (
             <article 
               key={index} 
               onClick={() => { setActivePanel(index); setDraftSymbol(panel.symbol); }} 
               className={`relative bg-[#131722] flex flex-col min-w-0 overflow-hidden ${activePanel === index ? 'ring-1 ring-[#2962FF] z-10' : ''}`}
             >
               {/* Chart Overlay Header */}
               <div className="absolute top-4 left-4 z-20 flex gap-3 text-[13px]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#D1D4DC]">{panel.symbol}</span>
                    <span className="text-[#787B86]">{panel.timeframe}</span>
                  </div>
               </div>
               
               {/* Render the actual canvas chart */}
               <div className="flex-1 w-full h-full pt-10">
                 <LiveCandleChart compact={layout > 1} symbol={panel.symbol} streamUrl={streamUrl} timeframe={panel.timeframe} />
               </div>
             </article>
          )) : (
            <div className="flex-1 flex items-center justify-center bg-[#131722] text-[#787B86]">Chart stream is not configured.</div>
          )}
        </main>

        {/* Right Panel (Watchlist) */}
        {isRightPanelOpen && (
          <aside className="w-[300px] bg-[#1E222D] border-l border-[#2A2E39] flex flex-col shrink-0">
             <div className="px-4 py-3 border-b border-[#2A2E39] font-semibold text-[14px] flex justify-between items-center relative">
               Watchlist
               <div className="flex gap-2 items-center">
                 <button
                   type="button"
                   onClick={() => {
                     setWatchlist([]);
                     writeChartWatchlist([]);
                   }}
                   disabled={watchlist.length === 0}
                   className="text-[10px] font-medium text-[#787B86] hover:text-[#EF5350] disabled:cursor-default disabled:opacity-40"
                   title="Remove every symbol from the Charts watchlist"
                 >
                   Clear all
                 </button>
                 <svg onClick={() => setIsAddingToWl(!isAddingToWl)} viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-[#787B86] cursor-pointer hover:fill-white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                 <svg onClick={() => setIsRightPanelOpen(false)} viewBox="0 0 24 24" className="w-[18px] h-[18px] fill-[#787B86] cursor-pointer hover:fill-white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
               </div>
             </div>
             
             {isAddingToWl && (
               <div className="p-2 border-b border-[#2A2E39] relative">
                  <input
                    value={wlDraft}
                    onFocus={() => setWlShowSuggestions(true)}
                    onBlur={() => window.setTimeout(() => setWlShowSuggestions(false), 120)}
                    onChange={(e) => { setWlDraft(e.target.value.toUpperCase()); setWlShowSuggestions(true); }}
                    className="bg-[#131722] border border-[#2A2E39] outline-none text-[13px] w-full uppercase placeholder:text-gray-600 focus:border-[#2962FF] px-2 py-1.5 rounded transition-colors"
                    placeholder="ADD SYMBOL"
                    autoComplete="off"
                    autoFocus
                  />
                  {wlShowSuggestions && wlMatches.length > 0 && (
                    <div className="absolute top-[40px] left-2 right-2 z-50 max-h-[300px] overflow-y-auto bg-[#131722] border border-[#2A2E39] rounded shadow-2xl py-1">
                      {wlMatches.map((match) => (
                        <button
                          key={match.symbol}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addToWatchlist(match.symbol)}
                          className="w-full text-left px-3 py-1.5 hover:bg-[#2A2E39] transition-colors flex flex-col"
                        >
                          <span className="font-mono text-sm font-semibold text-[#26A69A]">{match.symbol}</span>
                          <span className="text-[10px] text-[#787B86] truncate">{match.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
               </div>
             )}

             <div className="flex-1 overflow-y-auto">
               <div className="flex justify-between px-4 py-2 text-[11px] text-[#787B86] border-b border-[#2A2E39]">
                  <span>Symbol</span>
                  <span className="text-right">Last Price</span>
               </div>
               
               {watchlist.map((sym, idx) => (
                  <div key={idx} onClick={() => chooseSymbol(sym)} className="flex justify-between items-center px-4 py-2.5 border-b border-white/5 cursor-pointer hover:bg-[#2A2E39] transition-colors text-[13px] group">
                     <span className="font-medium">{sym}</span>
                     <div className="text-right flex items-center gap-2">
                       <div className="font-mono text-[#D1D4DC]">---</div>
                       <svg onClick={(e) => removeFromWatchlist(e, sym)} viewBox="0 0 24 24" className="w-[14px] h-[14px] fill-[#787B86] opacity-0 group-hover:opacity-100 cursor-pointer hover:fill-[#EF5350] transition-opacity"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                     </div>
                  </div>
               ))}
             </div>
          </aside>
        )}

        {/* Thin Right Sidebar (Toggles) */}
        <aside className="w-[52px] bg-[#131722] border-l border-[#2A2E39] flex flex-col items-center pt-2 gap-2 shrink-0">
          {/* Watchlist Toggle */}
          <div 
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className={`w-8 h-8 rounded flex items-center justify-center cursor-pointer transition-colors ${isRightPanelOpen ? 'text-[#2962FF]' : 'text-[#787B86] hover:bg-[#2A2E39] hover:text-[#D1D4DC]'}`}
            title="Watchlist"
          >
             <svg viewBox="0 0 24 24" className="w-[20px] h-[20px] fill-current"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
          </div>
          {/* Alerts Toggle (Dummy) */}
          <div className="w-8 h-8 rounded flex items-center justify-center text-[#787B86] cursor-pointer hover:bg-[#2A2E39] hover:text-[#D1D4DC] transition-colors" title="Alerts">
            <svg viewBox="0 0 24 24" className="w-[20px] h-[20px] fill-current"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          </div>
        </aside>

      </div>
    </main>
  );
}
