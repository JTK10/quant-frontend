import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import CapsClient from "./CapsClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getCapsSignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Caps Signal route failed: ${response.status} - ${errText}`);
      throw new Error(`Caps Signal route failed: ${response.status}`);
    }
    const data = await response.json();
    // Filter out intraday panther_live signals by ensuring 'cap' or 'mass_cr' exists.
    // CARACAL signals also carry 'cap' (CAR-*) — they have their own page.
    return data.filter((s: any) => (s.cap || s.mass_cr !== undefined) && s.source !== "caracal");
  } catch (err) {
    console.error("Error fetching Caps Signals:", err);
    return [];
  }
}

export default async function CapsSignalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getCapsSignals(dateStr);

  const bulls = signals.filter((s: any) => s.side === "LONG");
  const bears = signals.filter((s: any) => s.side === "SHORT");
  
  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="Caps Signals Engine"
        subtitle="ELEPHANT FOOTPRINT SCANNER"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#8b5cf6" // Violet accent for this page
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b border-[#ffffff10] px-3 py-3 md:px-6 z-10 relative shrink-0 shadow-sm"
        style={{
          background: "linear-gradient(180deg, rgba(139,92,246,0.05), transparent), #0A0A0B",
        }}
      >
        <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.2em] text-[#8b5cf6] font-semibold bg-[#8b5cf615] px-2 py-1 rounded-sm border border-[#8b5cf630]">
                MARKET BIAS
            </span>
            <span
            className="font-mono text-sm font-bold tracking-[0.18em]"
            style={{
                color:
                bias === "BULLISH" ? "#10b981"
                : bias === "BEARISH" ? "#ef4444"
                : "#fbbf24",
                textShadow: bias === "BULLISH" ? "0 0 10px rgba(16, 185, 129, 0.4)" : bias === "BEARISH" ? "0 0 10px rgba(239, 68, 68, 0.4)" : "none"
            }}
            >
            {bias}
            </span>
        </div>
        <div className="flex gap-4 ml-8">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <span className="font-mono text-[11px] text-[#10b981] font-medium">
                {bulls.length} LONG
                </span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
                <span className="font-mono text-[11px] text-[#ef4444] font-medium">
                {bears.length} SHORT
                </span>
            </div>
        </div>
        
        <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-[#ffffff05] rounded-md border border-[#ffffff10]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] animate-pulse shadow-[0_0_8px_rgba(139,92,246,0.8)]"></div>
            <span className="font-mono text-[11px] text-gray-400">
            {signals.length} TOTAL SIGNALS
            </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative p-4 md:p-6 bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <CapsClient signals={signals} />
      </div>
    </div>
  );
}
