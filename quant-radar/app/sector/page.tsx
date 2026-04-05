import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import SectorFlowClient from "@/components/SectorFlowClient";
import SectorSentiment from "@/components/SectorSentiment";
import type { SectorData } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getSectorData(dateStr: string): Promise<SectorData[]> {
  try {
    const url = await getInternalApiUrl(`/api/sector?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch {
    return [];
  }
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const sectors = await getSectorData(dateStr);

  const liveSectors = sectors.filter((sector) => sector.totalSignals > 0);
  const bullSectors = liveSectors.filter((sector) => sector.isBullish).length;
  const bearSectors = liveSectors.filter((sector) => !sector.isBullish).length;
  const totalSignals = liveSectors.reduce((sum, sector) => sum + sector.totalSignals, 0);
  const leader = liveSectors[0];

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Sector Flow"
        subtitle="MARKET ROTATION · SECTOR STRENGTH MAP"
        badge="LIVE HEATMAP"
        dateStr={dateStr}
        accentColor="var(--color-gold)"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div
        className="grid grid-cols-2 border-b md:grid-cols-3 xl:grid-cols-6"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        <SummaryStat label="Total sectors" value={String(sectors.length)} color="var(--color-text2)" />
        <SummaryStat label="Live themes" value={String(liveSectors.length)} color="var(--color-accent)" />
        <SummaryStat label="Bull sectors" value={String(bullSectors)} color="var(--color-bull)" />
        <SummaryStat label="Bear sectors" value={String(bearSectors)} color="var(--color-bear)" />
        <SummaryStat label="Live signals" value={String(totalSignals)} color="var(--color-gold)" />
        <SummaryStat
          label="Lead sector"
          value={leader?.label ?? "-"}
          color={leader ? (leader.isBullish ? "var(--color-bull)" : "var(--color-bear)") : "var(--color-muted)"}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[320px] xl:w-[380px] flex-shrink-0 border-r overflow-y-auto p-4" style={{ borderColor: "var(--color-border)" }}>
          <SectorSentiment />
        </div>
        <div className="flex-1 overflow-y-auto">
          <SectorFlowClient sectors={sectors} />
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
      <div className="mt-1 truncate text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
