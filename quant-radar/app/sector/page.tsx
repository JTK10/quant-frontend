import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import Afac2Client from "./Afac2Client";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getAfac2Snaps(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`AFAC2 route failed: ${response.status}`);
    const data = await response.json();
    // AFAC.2 snapshots: one doc per 5-min cycle, source:"afac2", with embedded
    // rows (top-30 stocks by score) and sectors (aggregates). Monotonic
    // "safest mover" quality score -- descriptive leaderboard, not an entry signal.
    return data.filter((s: any) => s.source === "afac2" || s.cap === "AFAC2");
  } catch (err) {
    console.error("Error fetching AFAC2 snapshots:", err);
    return [];
  }
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snaps = await getAfac2Snaps(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="SECTOR SCOPE"
        subtitle="AFAC.2 ROTATION — SAFEST-MOVER LEADERBOARD"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#fce205"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>
      <Afac2Client snaps={snaps} />
    </div>
  );
}
