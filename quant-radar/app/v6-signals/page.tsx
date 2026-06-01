import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import V6Client from "./V6Client";
import type { V6Row } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getV6Signals(dateStr: string): Promise<V6Row[]> {
  try {
    const url = await getInternalApiUrl(`/api/v6-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("V6 Signal route failed");
    return response.json();
  } catch {
    return [];
  }
}

export default async function V6SignalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getV6Signals(dateStr);

  const bulls = signals.filter(s => s.Direction === "LONG");
  const bears = signals.filter(s => s.Direction === "SHORT");
  
  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="V6 Momentum"
        subtitle="PREMIUM TIER SIGNALS"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#00e89a"
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b px-3 py-2 md:px-6 z-10 relative"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
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
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>
          {signals.length} TOTAL
        </span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <V6Client signals={signals} />
      </div>
    </div>
  );
}
