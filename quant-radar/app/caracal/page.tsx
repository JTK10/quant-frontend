import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import CaracalClient from "./CaracalClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

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
    // CARACAL rows: source:"caracal" (cap = CAR-A / CAR-B / CAR-Qc / CAR-Q / CAR-Qx).
    // OOS shakeout rows: source:"shakeout", cap:"OOS" -- merged onto this page (2026-07,
    // panther-live/elephant retired) since OOS has no separate page anymore. OOS's publish
    // doc has no event/detail fields (single-shot signal, no CONFIRM/SCRATCH lifecycle), so
    // synthesize both here to fit CaracalClient's row shape without touching the VM payload.
    const merged = data.filter((s: any) =>
      s.source === "caracal" || (typeof s.cap === "string" && s.cap.startsWith("CAR-")) ||
      s.source === "shakeout" || s.cap === "OOS"
    );
    return merged.map((s: any) => {
      if (s.cap !== "OOS") return s;
      const parts = [
        typeof s.surge === "number" ? `rvol=${s.surge.toFixed(2)}` : null,
        typeof s.mass_cr === "number" ? `score=${s.mass_cr.toFixed(2)}` : null,
        typeof s.delta === "number" ? `delta=${s.delta.toFixed(2)}` : null,
      ].filter(Boolean);
      return { ...s, event: s.event || "ENTRY", detail: s.detail || `SHAKEOUT LONG ${parts.join(" ")}` };
    });
  } catch (err) {
    console.error("Error fetching Caracal Signals:", err);
    return [];
  }
}

export default async function CaracalPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getCaracalSignals(dateStr);

  const entries = signals.filter((s: any) => s.event === "ENTRY");
  const confirms = signals.filter((s: any) => s.event === "CONFIRM");
  const scratches = signals.filter((s: any) => s.event === "SCRATCH");
  const tierQ = signals.filter((s: any) => s.event === "TIER_Q");

  const bulls = entries.filter((s: any) => s.side === "LONG");
  const bears = entries.filter((s: any) => s.side === "SHORT");
  const bias = bulls.length > bears.length ? "BULLISH" : bears.length > bulls.length ? "BEARISH" : "NEUTRAL";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="Caracal"
        subtitle="PRECISION ENTRY ENGINE"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#f59e0b" // Amber accent for the desert cat
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b border-[#ffffff10] px-3 py-3 md:px-6 z-10 relative shrink-0 shadow-sm"
        style={{
          background: "linear-gradient(180deg, rgba(245,158,11,0.05), transparent), #0A0A0B",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#f59e0b] font-semibold bg-[#f59e0b15] px-2 py-1 rounded-sm border border-[#f59e0b30]">
            MARKET BIAS
          </span>
          <span
            className="font-mono text-sm font-bold tracking-[0.18em]"
            style={{
              color:
                bias === "BULLISH" ? "#10b981"
                : bias === "BEARISH" ? "#ef4444"
                : "#fbbf24",
              textShadow: bias === "BULLISH" ? "0 0 10px rgba(16, 185, 129, 0.4)" : bias === "BEARISH" ? "0 0 10px rgba(239, 68, 68, 0.4)" : "none",
            }}
          >
            {bias}
          </span>
        </div>
        <div className="flex gap-4 ml-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
            <span className="font-mono text-[11px] text-[#f59e0b] font-medium">
              {entries.length} ENTRIES
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="font-mono text-[11px] text-[#10b981] font-medium">
              {confirms.length} CONFIRMED
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.7)]"></div>
            <span className="font-mono text-[11px] text-[#fbbf24] font-medium">
              {tierQ.length} TIER-Q
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
            <span className="font-mono text-[11px] text-[#ef4444] font-medium">
              {scratches.length} SCRATCHED
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 px-3 py-1 bg-[#ffffff05] rounded-md border border-[#ffffff10]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div>
          <span className="font-mono text-[11px] text-gray-400">
            {signals.length} EVENTS
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative p-4 md:p-6 bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <CaracalClient signals={signals} />
      </div>
    </div>
  );
}
