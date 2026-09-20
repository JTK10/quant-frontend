import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import RustyClient from "./RustyClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getRustySnaps(dateStr: string) {
  try {
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=rusty`
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`RUSTY route failed: ${response.status}`);
    return (await response.json() as any[]).filter((s) => s.source === "rusty");
  } catch (error) {
    console.error("Error fetching RUSTY snapshots:", error);
    return [];
  }
}

export default async function RustyPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snaps = await getRustySnaps(dateStr);
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader title="RUSTY" subtitle="INTRADAY MOVE BOARD" badge="LIVE" dateStr={dateStr} accentColor="#f97316">
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>
      <div className="relative flex-1 overflow-hidden bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <RustyClient snaps={snaps} />
      </div>
    </div>
  );
}
