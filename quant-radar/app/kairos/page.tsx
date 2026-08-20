import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import KairosClient from "./KairosClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getKairosEvents(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=kairos`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Kairos route failed: ${response.status}`);
    const data = await response.json();
    // KAIROS rows: source:"kairos" -- option trades on the LYNX rank-1 pick.
    // kind: ENTRY (buy at ask) / MTM (60s mark at bid) / EXIT (sell at bid).
    // Each doc carries `mode`: "paper" or "live". The bot defaults to paper and
    // only places real orders when KAIROS_MODE=live is set on the VM, so the
    // badge below is read from the data rather than hardcoded -- a page that
    // says PAPER while the bot is armed would be the worst possible bug here.
    return data.filter((s: any) => s.source === "kairos" || s.cap === "KAIROS");
  } catch (err) {
    console.error("Error fetching KAIROS events:", err);
    return [];
  }
}

export default async function KairosPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const events = await getKairosEvents(dateStr);
  const live = events.some((e: any) => e?.mode === "live");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="KAIROS"
        subtitle={`OPTIONS BOT — LYNX RANK-1${live ? "" : " — PAPER"}`}
        badge={live ? "LIVE" : "PAPER"}
        dateStr={dateStr}
        accentColor="#22d3ee"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>
      <KairosClient events={events} />
    </div>
  );
}
