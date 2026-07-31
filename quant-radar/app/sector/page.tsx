import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import Afac2Client from "./Afac2Client";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getAfac2Snaps(dateStr: string) {
  try {
    // Sector Scope now runs on V2 DYN RATIO instead of the AFAC.2 score.
    // lastN=4: this page renders only the newest snapshot (rows + sectors) plus
    // one ~15min back for the delta, so there is no reason to ship every cycle.
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=v2dyn&lastN=4`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`V2DYN route failed: ${response.status}`);
    const data = await response.json();

    // V2DYN snapshots: one doc per cycle from v2dyn_scanner.py, carrying
    //   rows    -- every gated stock with dyn_ratio (UNSIGNED: dpoc is already
    //              multiplied by side, so it measures escape from the volume
    //              POC in the stock's OWN direction -- a short escaping down
    //              scores like a long escaping up)
    //   sectors -- net = mean(dyn_ratio * side), i.e. direction re-injected so
    //              a sector escaping up is positive, escaping down negative,
    //              and a conflicted sector nets toward zero. Same unsigned-
    //              stock / signed-sector split AFAC.2 and R.Fac already use.
    // Now driven by RVOL rather than dyn_ratio. dyn_ratio is a POSITION measure
    // -- distance from a 20-session volume POC, ~80% inherited from the prior
    // close -- and over 301 sessions it did not predict (~47% hit rate). RVOL
    // measures participation happening right now, on combined cash+futures
    // volume. Falls back to dyn_ratio wherever rvol is unavailable (missing
    // baseline, or before 09:15 when the baseline has no bucket), so the page
    // degrades instead of blanking.
    //
    // Shaped to what Afac2Client expects: it reads `.rows[].score` and
    // `.sectors[].net`.
    const snaps = (data as any[]).filter((s) => s.source === "v2dyn" || s.cap === "V2DYN");
    return snaps.map((s) => ({
      ...s,
      rows: (Array.isArray(s.rows) ? s.rows : []).map((r: any) => ({
        ...r,
        score: r.rvol ?? r.dyn_ratio,
        secs: r.secs,
      })),
      sectors: (Array.isArray(s.sectors) ? s.sectors : []).map((x: any) => ({
        ...x,
        net: x.net_rvol ?? x.net,
      })),
    }));
  } catch (err) {
    console.error("Error fetching V2DYN snapshots:", err);
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
        subtitle="SECTOR LEADER BOARD"
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
