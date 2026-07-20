import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import RfacClient from "./RfacClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

async function getRfacSignals(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`RFAC Signal route failed: ${response.status} - ${errText}`);
      throw new Error(`RFAC Signal route failed: ${response.status}`);
    }
    const data = await response.json();
    // RFAC rows: source:"rfac", cap:"RFAC" -- published every 5min during market hours by
    // rfac-scanner.service on the VM. Not wired into CARACAL; standalone RVOL-velocity
    // scanner across ~215 NSE futures contracts. Each row is one ranked stock within a
    // 5-min cycle (imb = rank 1-20, surge = growth_pct, mass_cr = rvol_now, delta = rvol_velocity).
    return data.filter((s: any) => s.source === "rfac" || s.cap === "RFAC");
  } catch (err) {
    console.error("Error fetching RFAC Signals:", err);
    return [];
  }
}

export default async function RfacPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getRfacSignals(dateStr);

  const cycleTimes = Array.from(new Set(signals.map((s: any) => s.time))).sort();
  const latestTime = cycleTimes.length ? cycleTimes[cycleTimes.length - 1] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="RFAC"
        subtitle="RVOL VELOCITY SCANNER"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#10b981"
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b border-[#ffffff10] px-3 py-3 md:px-6 z-10 relative shrink-0 shadow-sm"
        style={{
          background: "linear-gradient(180deg, rgba(16,185,129,0.05), transparent), #0A0A0B",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#10b981] font-semibold bg-[#10b98115] px-2 py-1 rounded-sm border border-[#10b98130]">
            NSE FNO UNIVERSE
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.18em] text-[#10b981]">
            ~215 CONTRACTS
          </span>
        </div>
        <div className="flex gap-4 ml-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="font-mono text-[11px] text-[#10b981] font-medium">
              {cycleTimes.length} CYCLES TODAY
            </span>
          </div>
          {latestTime ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.7)]"></div>
              <span className="font-mono text-[11px] text-[#fbbf24] font-medium">
                LATEST {String(latestTime).substring(0, 5)}
              </span>
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-[#ffffff05] rounded-md border border-[#ffffff10]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          <span className="font-mono text-[11px] text-gray-400">
            {signals.length} ROWS
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative p-4 md:p-6 bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <RfacClient signals={signals} latestTime={latestTime as string | null} />
      </div>
    </div>
  );
}
