import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import JaguarClient from "./JaguarClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getJaguarSignals(dateStr: string) {
  try {
    // Fetch all cuts for the day
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=jaguar`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Jaguar route failed: ${response.status}`);
    }
    return await response.json();
  } catch (err) {
    console.error("Error fetching Jaguar Signals:", err);
    return [];
  }
}

export default async function JaguarSignalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const docs = await getJaguarSignals(dateStr);

  const bullsMap = new Map();
  const bearsMap = new Map();
  let latestCut = "--:--";

  // Sort docs chronologically to keep the EARLIEST entry time for a symbol
  docs.sort((a: any, b: any) => (a.cut || "").localeCompare(b.cut || ""));

  for (const snap of docs) {
    if (snap.cut && snap.cut > latestCut) latestCut = snap.cut;
    
    for (const r of snap.bull || []) {
      if (!bullsMap.has(r.sym)) {
        bullsMap.set(r.sym, { ...r, time: snap.cut });
      } else {
        const existing = bullsMap.get(r.sym);
        bullsMap.set(r.sym, { ...r, time: existing.time }); // keep first triggered time, update rest
      }
    }
    
    for (const r of snap.bear || []) {
      if (!bearsMap.has(r.sym)) {
        bearsMap.set(r.sym, { ...r, time: snap.cut });
      } else {
        const existing = bearsMap.get(r.sym);
        bearsMap.set(r.sym, { ...r, time: existing.time });
      }
    }
  }

  const bulls = Array.from(bullsMap.values());
  const bears = Array.from(bearsMap.values());

  // Sort by highest conviction (absolute diff_cr)
  bulls.sort((a, b) => Math.abs(b.diff_cr) - Math.abs(a.diff_cr));
  bears.sort((a, b) => Math.abs(b.diff_cr) - Math.abs(a.diff_cr));
  
  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Jaguar Signals"
        subtitle="STRICT CAPITULATION · TRUE BREAKOUTS"
        badge={`LATEST CUT: ${latestCut}`}
        dateStr={dateStr}
        accentColor="#8b5cf6" // Purple accent
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b px-3 py-2 md:px-6 z-10 relative shrink-0"
        style={{
          borderColor: "var(--color-border)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.015), transparent), var(--color-surface)",
        }}
      >
        <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          BIAS
        </span>
        <span
          className="font-mono text-xs font-bold tracking-[0.18em]"
          style={{
            color:
              bias === "BULLISH" ? "var(--color-bull)"
              : bias === "BEARISH" ? "var(--color-bear)"
              : "var(--color-gold)",
          }}
        >
          {bias}
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bull)" }}>
          {bulls.length} LONG
        </span>
        <span className="font-mono text-[9px]" style={{ color: "var(--color-bear)" }}>
          {bears.length} SHORT
        </span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <JaguarClient bulls={bulls} bears={bears} />
      </div>
    </div>
  );
}
