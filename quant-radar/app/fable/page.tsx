import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import FableClient from "./FableClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getFableEvents(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=fable`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Fable route failed: ${response.status}`);
    const data = await response.json();
    // FABLE rows: source:"fable" -- paper option trades on SERVAL TIER signals.
    // kind: ENTRY (paper buy at ask) / MTM (60s mark at bid) / EXIT (sell at bid).
    return data.filter((s: any) => s.source === "fable" || s.cap === "FABLE");
  } catch (err) {
    console.error("Error fetching FABLE events:", err);
    return [];
  }
}

export default async function FablePage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const events = await getFableEvents(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="FABLE"
        subtitle="PAPER OPTIONS BOT — SERVAL TIER"
        badge="PAPER"
        dateStr={dateStr}
        accentColor="#22d3ee"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>
      <FableClient events={events} />
    </div>
  );
}
