"use client";

import { useEffect, useMemo, useState } from "react";
import { findChartSymbols, resolveChartSymbol } from "./chartSymbols";
import LiveCandleChart, { type Timeframe } from "./LiveCandleChart";

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "1D"];
const DEFAULT_SYMBOL = "RELIANCE";

type ChartsClientProps = {
  streamUrl: string;
  initialSymbol?: string;
};

export default function ChartsClient({ streamUrl, initialSymbol }: ChartsClientProps) {
  const initial = resolveChartSymbol(initialSymbol ?? "")?.symbol ?? DEFAULT_SYMBOL;
  const [symbol, setSymbol] = useState(initial);
  const [draftSymbol, setDraftSymbol] = useState(initial);
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const matches = useMemo(() => findChartSymbols(draftSymbol).slice(0, 8), [draftSymbol]);

  useEffect(() => {
    const next = resolveChartSymbol(initialSymbol ?? "")?.symbol ?? DEFAULT_SYMBOL;
    setSymbol(next);
    setDraftSymbol(next);
  }, [initialSymbol]);

  const chooseSymbol = (next: string) => {
    setSymbol(next);
    setDraftSymbol(next);
    setShowSuggestions(false);
  };

  const submitSearch = () => {
    const exact = resolveChartSymbol(draftSymbol);
    if (exact) chooseSymbol(exact.symbol);
    else setShowSuggestions(true);
  };

  return (
    <main className="min-h-screen p-4 md:p-6" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>LIVE MARKET CHART</p>
            <h1 className="text-2xl font-semibold">{symbol} · {timeframe}</h1>
          </div>
          <form
            className="relative ml-auto flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="relative">
              <input
                value={draftSymbol}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 120)}
                onChange={(event) => {
                  setDraftSymbol(event.target.value.toUpperCase());
                  setShowSuggestions(true);
                }}
                className="w-64 rounded border px-3 py-2 font-mono text-sm uppercase"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                aria-label="Search F&O stock or index"
                aria-autocomplete="list"
                autoComplete="off"
              />
              {showSuggestions && matches.length > 0 && (
                <div className="absolute right-0 z-20 mt-1 max-h-80 w-80 overflow-y-auto rounded border p-1 shadow-2xl" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
                  {matches.map((match) => (
                    <button
                      key={match.symbol}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => chooseSymbol(match.symbol)}
                      className="block w-full rounded px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="block font-mono text-xs font-semibold" style={{ color: "var(--color-bull)" }}>{match.symbol}</span>
                      <span className="block truncate text-xs" style={{ color: "var(--color-muted)" }}>{match.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="rounded px-3 py-2 text-sm font-semibold" style={{ background: "var(--color-bull)", color: "#07120c" }}>
              Load
            </button>
          </form>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {TIMEFRAMES.map((value) => (
            <button
              key={value}
              onClick={() => setTimeframe(value)}
              className="rounded border px-3 py-1.5 font-mono text-xs"
              style={{
                borderColor: timeframe === value ? "var(--color-bull)" : "var(--color-border)",
                background: timeframe === value ? "rgba(34,197,94,.16)" : "var(--color-surface)",
              }}
            >
              {value}
            </button>
          ))}
          <span className="ml-auto self-center font-mono text-[10px] tracking-wider" style={{ color: streamUrl ? "var(--color-bull)" : "var(--color-bear)" }}>
            {streamUrl ? "STREAM READY" : "STREAM URL NOT CONFIGURED"}
          </span>
        </div>

        <section className="rounded border p-2" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          {streamUrl ? (
            <LiveCandleChart symbol={symbol} streamUrl={streamUrl} timeframe={timeframe} />
          ) : (
            <div className="grid min-h-[460px] place-items-center p-8 text-center" style={{ color: "var(--color-muted)" }}>
              Set <code>NEXT_PUBLIC_CHART_STREAM_URL</code> in Vercel after the new VM1 chart-stream service is deployed.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}