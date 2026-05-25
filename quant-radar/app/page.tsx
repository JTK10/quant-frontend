import { redirect } from "next/navigation";
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
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export default async function RadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getSignals(dateStr);

  const bulls = signals.filter((s) => s.Side === "BULL").length;
  const bears = signals.filter((s) => s.Side === "BEAR").length;
  const direct = signals.filter((s) => s.BreakType && !s.BreakType.toUpperCase().includes("RETEST")).length;
  const retest = signals.filter((s) => s.BreakType && s.BreakType.toUpperCase().includes("RETEST")).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Smart Radar"
        subtitle="SMART MONEY FLOW"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="var(--color-accent)"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>

      <div
        className="grid grid-cols-3 border-b md:grid-cols-5"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <Stat label="SIGNALS" value={String(signals.length)} color="var(--color-text2)" />
        <Stat label="BUY" value={String(bulls)} color="var(--color-bull)" />
        <Stat label="SELL" value={String(bears)} color="var(--color-bear)" />
        <Stat label="DIRECT" value={String(direct)} color="var(--color-gold)" />
        <Stat label="RETEST" value={String(retest)} color="var(--color-purple)" />
      </div>

      <div className="flex-1 overflow-hidden">
        <SmartRadarTable signals={signals} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border-r px-3 py-2.5 last:border-r-0" style={{ borderColor: "var(--color-border)" }}>
      <div className="font-mono text-[8px] tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
