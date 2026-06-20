import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import PantherClient from "./PantherClient";
import type { PantherRow } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getPantherSignals(dateStr: string): Promise<PantherRow[]> {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Panther Signal route failed: ${response.status} - ${errText}`);
      throw new Error(`Panther Signal route failed: ${response.status}`);
    }
    return response.json();
  } catch (err) {
    console.error("Error fetching Panther Signals:", err);
    return [];
  }
}

export default async function PantherSignalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getPantherSignals(dateStr);

  const bulls = signals.filter(s => s.side === "LONG");
  const bears = signals.filter(s => s.side === "SHORT");
  
  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Panther Signals"
        subtitle="LIVE K-ENGINE"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#f43f5e"
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div

        className="flex items-center gap-4 border-b px-3 py-2 md:px-6 z-10 relative shrink-0"
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
        <PantherClient signals={signals} />
      </div>
    </div>
  );
}
