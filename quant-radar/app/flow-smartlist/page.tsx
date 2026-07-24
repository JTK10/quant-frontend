import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import FlowSmartlistBoard from "@/components/FlowSmartlistBoard";
import type { FlowSmartlistCategory } from "@/utils/backend";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getFlowSmartlist(dateStr: string): Promise<Record<string, FlowSmartlistCategory>> {
  try {
    const url = await getInternalApiUrl(`/api/flow-smartlist?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return {};
    return response.json();
  } catch {
    return {};
  }
}

export default async function FlowSmartlistPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  
  const smartlistData = await getFlowSmartlist(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Flow Smartlist"
        subtitle="OI CHANGE · OI GAINERS · OI LOSERS · MOST ACTIVE · TOP TRADED · IV GAINERS"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="var(--color-gold)"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div className="flex-1 overflow-auto flex flex-col bg-black/20">
        <FlowSmartlistBoard data={smartlistData} />
      </div>
    </div>
  );
}
