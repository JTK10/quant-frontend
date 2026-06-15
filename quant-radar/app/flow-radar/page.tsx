import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import FlowRadarTable from "@/components/FlowRadarTable";
import type { FlowRadarRow } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getFlowRadar(dateStr: string): Promise<FlowRadarRow[]> {
  try {
    const url = await getInternalApiUrl(`/api/flow-radar?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}



export default async function FlowRadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  
  const radarRows = await getFlowRadar(dateStr);

  const confirmCount = radarRows.filter(r => r.Verdict === "CONFIRM").length;
  const vetoCount = radarRows.filter(r => r.Verdict === "VETO").length;
  const longBuildups = radarRows.filter(r => r.Buildup.includes("LONG")).length;
  const shortBuildups = radarRows.filter(r => r.Buildup.includes("SHORT")).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Flow Radar"
        subtitle="OPTIONS FLOW · OI BUILDUP · SMARTLIST"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="var(--color-accent)"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div
        className="grid grid-cols-2 border-b md:grid-cols-5 shrink-0"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <SummaryStat label="Total Scanned" value={String(radarRows.length)} color="var(--color-text2)" />
        <SummaryStat label="Flow Confirmed" value={String(confirmCount)} color="var(--color-bull)" />
        <SummaryStat label="Flow Vetoed" value={String(vetoCount)} color="var(--color-bear)" />
        <SummaryStat label="Long Buildups" value={String(longBuildups)} color="var(--color-gold)" />
        <SummaryStat label="Short Buildups" value={String(shortBuildups)} color="var(--color-purple)" />
      </div>

      <div className="flex-1 overflow-auto flex flex-col" style={{ borderColor: "var(--color-border)" }}>
        {/* Full width Flow Radar Table */}
        <div className="w-full h-full flex flex-col overflow-hidden">
          <FlowRadarTable rows={radarRows} />
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="border-r px-4 py-3 last:border-r-0" style={{ borderColor: "var(--color-border)" }}>
      <div className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
        {label.toUpperCase()}
      </div>
      <div className="mt-1 text-xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
