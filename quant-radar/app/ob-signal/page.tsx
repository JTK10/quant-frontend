import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import ObSignalClient from "./ObSignalClient";
import type { ObSignalRow } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getObSignals(dateStr: string): Promise<ObSignalRow[]> {
  try {
    const url = await getInternalApiUrl(`/api/ob-signal?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("OB Signal route failed");
    return response.json();
  } catch {
    return [];
  }
}

export default async function ObSignalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getObSignals(dateStr);

  const bulls = signals.filter((s) => s.Side === "BULL");
  const bears = signals.filter((s) => s.Side === "BEAR");
  const highScore = signals.filter((s) => s.Score >= 5).length;

  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="OB Radar"
        subtitle="ORDER BLOCK + PDL/PDH · ELITE FILTER"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#f59e0b"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
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
          {bulls.length} BULL
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bear)" }}>
          {bears.length} BEAR
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-gold)" }}>
          {highScore} HIGH CONV
        </span>
        <span className="ml-auto font-mono text-[9px]" style={{ color: "var(--color-muted)" }}>
          {signals.length} TOTAL · 09:25–10:00 WINDOW
        </span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <ObSignalClient signals={signals} />
      </div>
    </div>
  );
}
