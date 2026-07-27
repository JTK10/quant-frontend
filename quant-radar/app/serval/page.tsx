import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import ServalClient from "./ServalClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getServalSignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=serval`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Serval signal route failed: ${response.status}`);
    const data = await response.json();
    // SERVAL rows: source:"serval" -- funnel entries cap:"SERVAL", tier trades
    // cap:"SERVAL-T" (dynamic gate + ATR bracket). All displayed columns are
    // CAUSAL (known at signal time): dpoc, vol_ahead, rt5, atr, dyn_ratio.
    return data.filter(
      (s: any) =>
        s.source === "serval" || (typeof s.cap === "string" && s.cap.startsWith("SERVAL"))
    );
  } catch (err) {
    console.error("Error fetching SERVAL signals:", err);
    return [];
  }
}

export default async function ServalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getServalSignals(dateStr);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="SERVAL"
        subtitle="DYNAMIC BREAKOUT ENGINE"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#ec4899"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>
      <ServalClient signals={signals} />
    </div>
  );
}
