import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import KairosClient from "./KairosClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl, fetchInternalApi } from "@/utils/internalApi";
import Link from "next/link";
import { kairosSource, type KairosEngine, type KairosEvent } from "@/utils/kairos";

export const dynamic = "force-dynamic";

async function getKairosEvents(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=kairos,kairos2`);
    const response = await fetchInternalApi(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Kairos route failed: ${response.status}`);
    const data: KairosEvent[] = await response.json();
    // KAIROS rows: source:"kairos" -- option trades on the LYNX rank-1 pick.
    // kind: ENTRY (buy at ask) / MTM (60s mark at bid) / EXIT (sell at bid).
    // Each doc carries `mode`: "paper" or "live". The bot defaults to paper and
    // only places real orders when KAIROS_MODE=live is set on the VM, so the
    // badge below is read from the data rather than hardcoded -- a page that
    // says PAPER while the bot is armed would be the worst possible bug here.
    return {events: data.filter((s) => kairosSource(s) !== null), asOf: Date.now()};
  } catch (err) {
    console.error("Error fetching KAIROS events:", err);
    return {events: [] as KairosEvent[], asOf: Date.now()};
  }
}

export default async function KairosPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const params = searchParams ? await searchParams : {};
  const engine: KairosEngine = params.engine === "kairos" ? "kairos" : "kairos2";
  const {events, asOf} = await getKairosEvents(dateStr);
  const live = events.some((e) => kairosSource(e) === engine && e.mode === "live");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title={engine === "kairos2" ? "KAIROS 2.0" : "KAIROS"}
        subtitle={engine === "kairos2" ? "PALLAS AI · OPTIONS PAPER TRADER" : `OPTIONS BOT — LYNX RANK-1${live ? "" : " — PAPER"}`}
        badge={live ? "LIVE" : "PAPER"}
        dateStr={dateStr}
        accentColor="#22d3ee"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>
      <div className="flex gap-2 px-3 pt-3 md:px-6" aria-label="Kairos engine">
        {([['kairos2','Kairos 2.0'],['kairos','Kairos']] as const).map(([value,label]) => <Link key={value}
          href={`/kairos?engine=${value}&date=${dateStr}`} aria-current={engine === value ? "page" : undefined}
          className={`rounded-lg border px-4 py-2 font-mono text-xs ${engine === value ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-white"}`}>{label}</Link>)}
      </div>
      <KairosClient events={events} engine={engine} dateStr={dateStr} asOf={asOf} />
    </div>
  );
}
