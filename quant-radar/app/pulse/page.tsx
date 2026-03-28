import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import SignalPulseClient from "@/components/SignalPulseClient";
import type { PulseData } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getPulseData(dateStr: string): Promise<PulseData> {
  try {
    const url = await getInternalApiUrl(`/api/pulse?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Pulse route failed");
    }

    return response.json();
  } catch {
    return { watchlist: [], bulls: [], bears: [], bias: "NEUTRAL", asOf: null };
  }
}

export default async function PulsePage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getPulseData(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Signal Pulse"
        subtitle="PCR WATCHLIST · BULL BEAR CONVICTION"
        badge="LIVE VELOCITY"
        dateStr={dateStr}
        accentColor="var(--color-bull)"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>

      <div
        className="flex flex-wrap items-center gap-4 border-b px-5 py-3 lg:px-8"
        style={{
          borderColor: "var(--color-border)",
          background:
            data.bias === "BULLISH"
              ? "rgba(0, 232, 154, 0.06)"
              : data.bias === "BEARISH"
                ? "rgba(255, 59, 107, 0.06)"
                : "var(--color-surface)",
        }}
      >
        <span className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
          MARKET BIAS
        </span>
        <span
          className="font-mono text-sm font-bold tracking-[0.22em]"
          style={{
            color:
              data.bias === "BULLISH"
                ? "var(--color-bull)"
                : data.bias === "BEARISH"
                  ? "var(--color-bear)"
                  : "var(--color-gold)",
          }}
        >
          {data.bias}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
          Bulls {data.bulls.length}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
          Bears {data.bears.length}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
          Watchlist {data.watchlist.length}
        </span>
        {data.asOf ? (
          <span className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
            As of {data.asOf}
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-hidden">
        <SignalPulseClient data={data} />
      </div>
    </div>
  );
}

