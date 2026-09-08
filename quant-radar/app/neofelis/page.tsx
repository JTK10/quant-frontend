import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import NeofelisClient from "./NeofelisClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#2dd4bf";

async function getNeofelisSnaps(dateStr: string) {
  try {
    // Same route and doc shape as /ocelot and /margay: sources= is pushed
    // upstream as :src. Both sides carry ARMED and MISS rows in the SAME
    // bull/bear arrays -- a separate top-level "miss" key would be dropped by
    // normalizePantherSignals, which rebuilds every doc from an explicit
    // allowlist that only bull/bear (plus the nb/nm/nbb/nmb counts) are on.
    //
    // Payload is bounded by construction: armed is ~2-3 names/day and the
    // publisher caps near-misses at 30 per cut, so a cut is ~5KB even on a day
    // like 2026-09-02 that had 161 body breaks. No topN trim needed here.
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=neofelis`
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`NEOFELIS route failed: ${response.status} - ${errText}`);
      throw new Error(`NEOFELIS route failed: ${response.status}`);
    }
    const data = await response.json();
    return (data as any[]).filter((s) => s.source === "neofelis");
  } catch (err) {
    console.error("Error fetching NEOFELIS snapshots:", err);
    return [];
  }
}

export default async function NeofelisPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snaps = await getNeofelisSnaps(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="NEOFELIS"
        subtitle="PDH/PDL BODY BREAK · DEPTH GATE · TRAPPED WRITERS"
        badge="LIVE"
        dateStr={dateStr}
        accentColor={ACCENT}
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div className="flex-1 overflow-hidden relative bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <NeofelisClient snaps={snaps} />
      </div>
    </div>
  );
}
