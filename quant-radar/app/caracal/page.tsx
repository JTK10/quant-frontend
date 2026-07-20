import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import CaracalClient from "./CaracalClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const ACCENT = "#f59e0b";

async function getCaracalSignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Caracal Signal route failed: ${response.status} - ${errText}`);
      throw new Error(`Caracal Signal route failed: ${response.status}`);
    }
    const data = await response.json();
    // CARACAL v2 funnel entries only. The old CARACAL A/B/Q tiered engine
    // (source:"caracal", cap CAR-A/CAR-B/CAR-Qc/CAR-Q/CAR-Qx) is retired --
    // this page now shows every CARACAL v2 funnel entry, same as /serval,
    // with cap:"CAR-V2-T" rows highlighted as tier signals.
    // OOS shakeout rows (source:"shakeout", cap:"OOS") stay merged onto this
    // page (no separate page since panther-live/elephant retired). Their doc
    // has no dpoc/vol_ahead/rt5 -- the grid renders those cells as em-dashes.
    return (data as any[]).filter(
      (s) => s.source === "caracal2" || s.source === "shakeout" || s.cap === "OOS"
    );
  } catch (err) {
    console.error("Error fetching Caracal Signals:", err);
    return [];
  }
}

export default async function CaracalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getCaracalSignals(dateStr);

  const nTier = signals.filter((s: any) => s.tier === true || s.cap === "CAR-V2-T").length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="Caracal"
        subtitle="CARACAL V2 -- SPLIT-POOL FUNNEL"
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
