"use client";

import { useEffect, useMemo, useState } from "react";
import { findChartSymbols, resolveChartSymbol } from "./chartSymbols";
import LiveCandleChart, { type Timeframe } from "./LiveCandleChart";

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
  const matches = useMemo(() => findChartSymbols(draftSymbol).slice(0, 8), [draftSymbol]);
  const selected = panels[activePanel] ?? panels[0];

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

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    setActivePanel((current) => Math.min(current, next - 1));
  };

  const visiblePanels = panels.slice(0, layout);
  const gridClass = layout === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2";

  return (
    <main className="min-h-screen p-4 md:p-6" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>LIVE MARKET CHART</p>
            <h1 className="text-2xl font-semibold">{layout === 1 ? selected.symbol : `${layout} CHART LAYOUT`}</h1>
          </div>
          <form
            className="relative ml-auto flex gap-2"
            onSubmit={(event) => { event.preventDefault(); submitSearch(); }}
          >
            <div className="relative">
              <input
                value={draftSymbol}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                onChange={(event) => { setDraftSymbol(event.target.value.toUpperCase()); setShowSuggestions(true); }}
                className="w-64 rounded border px-3 py-2 font-mono text-sm uppercase"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                aria-label="Search F&O stock or index for selected chart"
                aria-autocomplete="list"
                autoComplete="off"
              />
              {showSuggestions && matches.length > 0 && (
                <div className="absolute right-0 z-20 mt-1 max-h-80 w-80 overflow-y-auto rounded border p-1 shadow-2xl" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
                  {matches.map((match) => (
                    <button key={match.symbol} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSymbol(match.symbol)} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">
                      <span className="block font-mono text-xs font-semibold" style={{ color: "var(--color-bull)" }}>{match.symbol}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--color-muted)" }}>{match.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="rounded px-3 py-2 text-sm font-semibold" style={{ background: "var(--color-bull)", color: "#07120c" }}>Load selected</button>
          </form>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {LAYOUTS.map((value) => (
            <button key={value} onClick={() => chooseLayout(value)} className="rounded border px-3 py-1.5 font-mono text-xs" style={{ borderColor: layout === value ? "var(--color-bull)" : "var(--color-border)", background: layout === value ? "rgba(34,197,94,.16)" : "var(--color-surface)" }}>
              {layoutLabels[value]}
            </button>
          ))}
          <span className="mx-1 self-center text-xs" style={{ color: "var(--color-muted)" }}>Selected: {selected.symbol}</span>
          {TIMEFRAMES.map((value) => (
            <button key={value} onClick={() => updatePanel({ timeframe: value })} className="rounded border px-3 py-1.5 font-mono text-xs" style={{ borderColor: selected.timeframe === value ? "var(--color-bull)" : "var(--color-border)", background: selected.timeframe === value ? "rgba(34,197,94,.16)" : "var(--color-surface)" }}>
              {value}
            </button>
          ))}
          <span className="ml-auto self-center font-mono text-[10px] tracking-wider" style={{ color: streamUrl ? "var(--color-bull)" : "var(--color-bear)" }}>{streamUrl ? "STREAM READY" : "STREAM URL NOT CONFIGURED"}</span>
        </div>

        <section className={`grid gap-3 ${gridClass}`}>
          {streamUrl ? visiblePanels.map((panel, index) => (
            <article key={index} onClick={() => { setActivePanel(index); setDraftSymbol(panel.symbol); }} className="min-w-0 overflow-hidden rounded border p-2 transition" style={{ borderColor: activePanel === index ? "var(--color-bull)" : "var(--color-border)", background: "var(--color-surface)" }}>
              <div className="mb-1 flex items-center justify-between px-1 font-mono text-[11px]">
                <span style={{ color: activePanel === index ? "var(--color-bull)" : "var(--color-text2)" }}>CHART {index + 1} · {panel.symbol}</span>
                <span style={{ color: "var(--color-muted)" }}>{panel.timeframe} · IST</span>
              </div>
              <LiveCandleChart compact={layout > 1} symbol={panel.symbol} streamUrl={streamUrl} timeframe={panel.timeframe} />
            </article>
          )) : (
            <div className="grid min-h-[460px] place-items-center rounded border p-8 text-center" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>Chart stream is not configured.</div>
          )}
        </section>
      </div>
    </main>
  );
}