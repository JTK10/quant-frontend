import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import JaguarClient from "./JaguarClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getJaguarSignals(dateStr: string) {
  try {
    // Fetch from the unified panther-signals API but filter for jaguar
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=jaguar&latestCycle=1`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Jaguar route failed: ${response.status}`);
    }
    const data = await response.json();
    return data.length > 0 ? data[0] : null; // we only need the latest cycle snapshot
  } catch (err) {
    console.error("Error fetching Jaguar Signals:", err);
    return null;
  }
}

export default async function JaguarSignalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snap = await getJaguarSignals(dateStr);

  const bulls = snap?.bull || [];
  const bears = snap?.bear || [];
  
  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";
  const cutTime = snap?.cut || "--:--";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Jaguar Signals"
        subtitle="STRICT CAPITULATION · TRUE BREAKOUTS"
        badge={`CUT: ${cutTime}`}
        dateStr={dateStr}
        accentColor="#8b5cf6" // Purple accent
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b px-3 py-2 md:px-6 z-10 relative shrink-0"
        style={{
          borderColor: "var(--color-border)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.015), transparent), var(--color-surface)",
        }}
      >
        <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          BIAS
        </span>
        <span
          className="font-mono text-xs font-bold tracking-[0.18em]"
          style={{
            color:
              bias === "BULLISH" ? "var(--color-bull)"
              : bias === "BEARISH" ? "var(--color-bear)"
              : "var(--color-gold)",
          }}
        >
          {bias}
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bull)" }}>
          {bulls.length} LONG
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bear)" }}>
          {bears.length} SHORT
        </span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <JaguarClient bulls={bulls} bears={bears} />
      </div>
    </div>
  );
}
