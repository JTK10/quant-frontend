import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import SmartRadarTable from "@/components/SmartRadarTable";
import type { RadarSignal } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getSignals(dateStr: string): Promise<RadarSignal[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch {
    return [];
  }
}

export default async function RadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getSignals(dateStr);

  const bulls = signals.filter((signal) => signal.Side === "BULL").length;
  const bears = signals.filter((signal) => signal.Side === "BEAR").length;
  const highConviction = signals.filter((signal) => signal.Confidence >= 4).length;
  const optionsReady = signals.filter((signal) => signal.HasOptions).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Smart Radar"
        subtitle="BREAKOUT RETEST SIGNALS · PCR CONFIRMED"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="var(--color-accent)"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>

      <div
        className="grid grid-cols-2 gap-3 border-b px-4 py-3 md:grid-cols-5 lg:px-6"
        style={{ borderColor: "var(--color-border)", background: "rgba(255, 255, 255, 0.7)" }}
      >
        <SummaryStat label="Total signals" value={String(signals.length)} color="var(--color-text2)" />
        <SummaryStat label="Bullish" value={String(bulls)} color="var(--color-bull)" />
        <SummaryStat label="Bearish" value={String(bears)} color="var(--color-bear)" />
        <SummaryStat label="High conv >= 4" value={String(highConviction)} color="var(--color-gold)" />
        <SummaryStat label="With options" value={String(optionsReady)} color="var(--color-purple)" />
      </div>

      <div className="flex-1 overflow-hidden">
        <SmartRadarTable signals={signals} />
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      className="rounded-2xl border px-4 py-3 shadow-sm"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div className="font-mono text-[9px] tracking-[0.15em]" style={{ color: "var(--color-muted)" }}>
        {label.toUpperCase()}
      </div>
      <div className="mt-1 text-xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
