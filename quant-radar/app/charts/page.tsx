import PageHeader from "@/components/PageHeader";
import { DatePicker } from "@/components/Controls";
import ChartsClient from "./ChartsClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#38bdf8";

/** The current LYNX board, used only to populate the symbol picker.
 *
 * A failure here must NOT take the page down: the grid is manual, so charts
 * still work with an empty picker. That is why this swallows rather than throws
 * the way the LYNX page does -- there, no data means no page; here it means one
 * dropdown is short. */
async function getLynxNames(dateStr: string): Promise<
  { sym: string; side?: string; n_top3?: number; first?: string; tier: string }[]
> {
  try {
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=lynx`
    );
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const snaps = (data as any[]).filter(
      (s) => s.source === "lynx" || s.cap === "LYNX"
    );
    if (!snaps.length) return [];
    // newest cut wins; ts is numeric and always set by the publisher
    const latest = snaps.reduce((a, b) =>
      (Number(b?.ts) || 0) >= (Number(a?.ts) || 0) ? b : a
    );
    const pool: any[] = latest.pool || latest.rows || [];
    return pool
      .map((r) => ({
        sym: String(r.sym),
        side: r.side,
        n_top3: Number(r.n_top3) || 0,
        first: r.first,
        tier: (Number(r.n_top3) || 0) > 0 ? "RANKED" : "GATED",
      }))
      .sort(
        (a, b) =>
          (b.n_top3 || 0) - (a.n_top3 || 0) || a.sym.localeCompare(b.sym)
      );
  } catch {
    return [];
  }
}

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: DateSearchParams;
}) {
  const dateStr = await resolveDate(searchParams);
  const names = await getLynxNames(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="CHARTS"
        subtitle="MULTI-PANE — TRADINGVIEW"
        badge={`${names.length} LYNX`}
        dateStr={dateStr}
        accentColor={ACCENT}
      >
        <DatePicker />
      </PageHeader>
      <ChartsClient names={names} />
    </div>
  );
}
