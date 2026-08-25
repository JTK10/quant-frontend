import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import OcelotClient from "./OcelotClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#f97316";

async function getOcelotSnaps(dateStr: string) {
  try {
    // OCELOT publishes one snapshot per 5-min cut, 09:15-15:40 -- up to 78 docs
    // a session, each ~5KB (top 25 per side after the liquidity floor). The
    // whole day is wanted, not just the latest cut: how a name's flow builds
    // across cuts is the thing intraday capture exists to show.
    //
    // sources= is the page-level filter; the route pushes it upstream as :src.
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=ocelot`
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`OCELOT route failed: ${response.status} - ${errText}`);
      throw new Error(`OCELOT route failed: ${response.status}`);
    }
    const data = await response.json();
    return (data as any[]).filter((s) => s.source === "ocelot");
  } catch (err) {
    console.error("Error fetching OCELOT snapshots:", err);
    return [];
  }
}

export default async function OcelotPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snaps = await getOcelotSnaps(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="OCELOT"
        subtitle="OPTION FLOW · 5-MIN CHAIN CAPTURE"
        badge="LIVE"
        dateStr={dateStr}
        accentColor={ACCENT}
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div className="flex-1 overflow-hidden relative bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <OcelotClient snaps={snaps} />
      </div>
    </div>
  );
}
