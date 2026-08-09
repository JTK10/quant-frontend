import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import CaracalClient from "./CaracalClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#f59e0b";

async function getCaracalSignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=caracal3,caracal2,shakeout`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Caracal Signal route failed: ${response.status} - ${errText}`);
      throw new Error(`Caracal Signal route failed: ${response.status}`);
    }
    const data = await response.json();
    // CARACAL v3 ("skeleton") is the live engine on this page: source:"caracal3",
    // cap:"CAR-V3". It publishes TWO kinds of row -- event:"FLAG" (the 09:15
    // prev-day-body break, provisional watchlist) and event:"ENTRY" (the
    // confirmed pullback-resumption entry, >= 09:50, vol_ahead < 0.3).
    // CARACAL v2 rows (source:"caracal2", cap CAR-V2/CAR-V2-T) are still read so
    // historical dates keep rendering; they land in the ENTRIES section.
    // OOS shakeout rows (source:"shakeout", cap:"OOS") stay merged onto this
    // page (no separate page since panther-live/elephant retired). Their doc
    // has no dpoc/vol_ahead/rt5 -- the grid renders those cells as em-dashes.
    return (data as any[]).filter(
      (s) => s.source === "caracal3" || s.source === "caracal2" ||
             s.source === "shakeout" || s.cap === "OOS"
    );
  } catch (err) {
    console.error("Error fetching Caracal Signals:", err);
    return [];
  }
}

export default async function CaracalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getCaracalSignals(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="CARACAL v3"
        subtitle=""
        badge="LIVE"
        dateStr={dateStr}
        accentColor={ACCENT}
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div className="flex-1 overflow-hidden relative bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <CaracalClient signals={signals} />
      </div>
    </div>
  );
}
