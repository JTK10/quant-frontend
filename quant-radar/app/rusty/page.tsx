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
  // NSE/FAOP/71777: no trading session on Gandhi Jayanti. The publisher
  // still emits wall-clock cuts using unchanged quotes on this holiday.
  const marketClosed = dateStr === "2026-10-02";
  if (marketClosed) {
    return (
      <RustyClient
        key={dateStr}
        snaps={[]}
        dateStr={dateStr}
        controls={<DatePicker />}
        emptyMessage={<><strong>Market closed — Gandhi Jayanti</strong><p>October 2, 2026 is an NSE trading holiday. No trading snapshots are available for this date.</p><a className="charts-link" href="/rusty?date=2026-10-01">View October 1 snapshots ↗</a></>}
      />
    );
  }
  const snaps = await getRustySnaps(dateStr);
  return (
    <RustyClient key={dateStr} snaps={snaps} dateStr={dateStr} controls={<><DatePicker /><AutoRefresh interval={45000} /></>} />
  );
}
