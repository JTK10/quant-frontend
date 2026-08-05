import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import StrikeClient from "./StrikeClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

/**
 * Picks come from strike_scan.py on the VM (source "strikepick"), one doc per
 * underlying per 5-min cycle. Paper positions come from the same bus with
 * source "strike" -- ENTRY / MTM / EXIT, exactly the shape FABLE publishes.
 */
async function getRows(dateStr: string, sources: string) {
  try {
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=${sources}`
    );
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`panther-signals ${r.status}`);
    return await r.json();
  } catch (err) {
    console.error(`Error fetching ${sources}:`, err);
    return [];
  }
}

export default async function StrikePage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const [picksRaw, tradesRaw] = await Promise.all([
    getRows(dateStr, "strikepick"),
    getRows(dateStr, "strike"),
  ]);

  // keep only the LATEST pick per underlying -- the scanner republishes each cycle
  const latest = new Map<string, any>();
  for (const p of picksRaw) {
    if (p.source !== "strikepick" && p.cap !== "STRIKE") continue;
    const k = p.underlying || p.name;
    const prev = latest.get(k);
    if (!prev || (p.ts ?? 0) > (prev.ts ?? 0)) latest.set(k, p);
  }
  const picks = Array.from(latest.values());
  const trades = tradesRaw.filter((t: any) => t.source === "strike");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="STRIKE"
        subtitle="OPTION STRIKE PICKER — 5-7% OTM BAND"
        badge="PAPER"
        dateStr={dateStr}
        accentColor="#f59e0b"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>
      <StrikeClient picks={picks} trades={trades} dateStr={dateStr} />
    </div>
  );
}
