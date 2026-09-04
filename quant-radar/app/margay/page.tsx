import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import MargayClient from "./MargayClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#a855f7";

async function getMargaySnaps(dateStr: string) {
  try {
    // Same route, same convention as /ocelot: sources= is pushed upstream as
    // :src, the doc shape is identical (source/cap/sig_date/date/cut/time/ts/
    // bull/bear) so no server-side trimming is needed here -- MARGAY publishes
    // ALL matches per cut (not top-N), and the count stays small because both
    // locked sub-patterns already gate on notional + an early-break window.
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=margay`
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`MARGAY route failed: ${response.status} - ${errText}`);
      throw new Error(`MARGAY route failed: ${response.status}`);
    }
    const data = await response.json();
    return (data as any[]).filter((s) => s.source === "margay");
  } catch (err) {
    console.error("Error fetching MARGAY snapshots:", err);
    return [];
  }
}

export default async function MargayPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snaps = await getMargaySnaps(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="MARGAY"
        subtitle="TWO LOCKED BREAK PATTERNS · RANGE + PDL/PDH"
        badge="LIVE"
        dateStr={dateStr}
        accentColor={ACCENT}
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div className="flex-1 overflow-hidden relative bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <MargayClient snaps={snaps} />
      </div>
    </div>
  );
}
