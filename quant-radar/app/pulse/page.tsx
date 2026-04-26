import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import WatchlistClient from "@/components/WatchlistClient";
import type { PulseData } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getPulseData(dateStr: string): Promise<PulseData> {
  try {
    const url = await getInternalApiUrl(`/api/pulse?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Pulse route failed");
    return response.json();
  } catch {
    return { watchlist: [], bulls: [], bears: [], bias: "NEUTRAL", asOf: null };
  }
}

export default async function PulsePage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getPulseData(dateStr);

  // Combine all signals into a single watchlist-style list
  const allSignals = [...data.bulls, ...data.bears];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Watchlist"
        subtitle="FLOW CONFIRMED · LIVE SIGNALS"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="var(--color-bull)"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b px-3 py-2 md:px-6"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          BIAS
        </span>
        <span
          className="font-mono text-xs font-bold tracking-[0.18em]"
          style={{
            color:
              data.bias === "BULLISH" ? "var(--color-bull)"
              : data.bias === "BEARISH" ? "var(--color-bear)"
              : "var(--color-gold)",
          }}
        >
          {data.bias}
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bull)" }}>
          {data.bulls.length} BUY
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bear)" }}>
          {data.bears.length} SELL
        </span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>
          {allSignals.length} TOTAL
        </span>
      </div>

      <div className="flex-1 overflow-hidden">
        <WatchlistClient signals={allSignals} />
      </div>
    </div>
  );
}
