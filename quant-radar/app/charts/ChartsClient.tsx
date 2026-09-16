"use client";

import { useState } from "react";
import LiveCandleChart, { type Timeframe } from "./LiveCandleChart";

const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "1D"];

export default function ChartsClient({ streamUrl }: { streamUrl: string }) {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [draftSymbol, setDraftSymbol] = useState("RELIANCE");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");

  return (
    <main className="min-h-screen p-4 md:p-6" style={{ background: "var(--color-bg)", color: "var(--color-text)" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="font-mono text-xs tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>LIVE MARKET CHART</p>
            <h1 className="text-2xl font-semibold">{symbol} · {timeframe}</h1>
          </div>
          <form
            className="ml-auto flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = draftSymbol.trim().toUpperCase();
              if (next) setSymbol(next);
            }}
          >
            <input
              value={draftSymbol}
              onChange={(event) => setDraftSymbol(event.target.value)}
              className="w-36 rounded border px-3 py-2 font-mono text-sm uppercase"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              aria-label="F&O stock symbol"
            />
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
