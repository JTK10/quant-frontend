import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import LynxClient from "./LynxClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#a78bfa";

async function getLynxSnaps(dateStr: string) {
  try {
    // LYNX publishes one snapshot per 5-min cut from 09:30 to 11:30 -- ~25 docs
    // a session, each tiny (a 3-row leaderboard plus counters). Unlike the other
    // pages this one WANTS the whole day: the persistence trail (how each name's
    // top-3 count accumulated across cuts) is the signal, not an afterthought,
    // so there is no lastN here.
    //
    // src (NOT source/sources) is the parameter the ORDS handler binds; passing
    // it filters upstream instead of downloading every publisher's docs.
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=lynx`
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`LYNX route failed: ${response.status} - ${errText}`);
      throw new Error(`LYNX route failed: ${response.status}`);
    }
    const data = await response.json();
    return (data as any[]).filter((s) => s.source === "lynx" || s.cap === "LYNX");
  } catch (err) {
    console.error("Error fetching LYNX snapshots:", err);
    return [];
  }
}

export default async function LynxPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const snaps = await getLynxSnaps(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="LYNX"
        subtitle="CROSS-SECTIONAL RANK · PERSISTENCE"
        badge="LIVE"
        dateStr={dateStr}
        accentColor={ACCENT}
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div className="flex-1 overflow-hidden relative bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <LynxClient snaps={snaps} />
      </div>
    </div>
  );
}
