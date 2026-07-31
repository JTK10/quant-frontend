import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import RfacClient from "./RfacClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const TOP_N = 40;

async function getV2DynRows(dateStr: string) {
  try {
    // topN/rankBy: trim to the rendered top-40 and resolve `_d` server-side.
    // The untrimmed payload was 2.05MB -- inside Vercel's 2MiB cache-entry limit
    // by only ~45KB, i.e. a few more cycles or names from silently returning []
    // the way AFAC did.
    // Ranked by RVOL, not dyn_ratio. dyn_ratio measures POSITION -- how far
    // price sits from a 20-session volume POC -- which is ~80% inherited from
    // the prior close and, measured over 301 sessions, does not predict
    // (~47% hit rate, safety ~1.0). RVOL measures PARTICIPATION right now.
    // dyn_ratio is kept as a column: it still earns its place as a FILTER
    // (SERVAL's TIER gate is dyn_ratio >= 1.5), just not as the ranking.
    const url = await getInternalApiUrl(
      `/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=v2dyn&topN=${TOP_N}&rankBy=rvol`,
    );
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`V2DYN route failed: ${response.status}`);
    const data = await response.json();

    // V2DYN snapshots: one doc per cycle from v2dyn_scanner.py on the VM, each
    // carrying a `rows` array already sorted by dyn_ratio desc.
    //   dyn_ratio = dpoc / day-median-rt5, on a single CASH basis -- levels,
    //   rt5 and the 20-session volume profile are all cash-derived, with the
    //   profile weighted by combined cash+futures participation.
    // dyn_ratio is UNSIGNED w.r.t. direction: dpoc is already multiplied by
    // side, so it measures escape from the volume magnet in the stock's OWN
    // direction. A short escaping down ranks the same as a long escaping up;
    // negative just means "still behind the POC", not "short".
    const snaps = (data as any[])
      .filter((s) => s.source === "v2dyn" || s.cap === "V2DYN")
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

    const flat: any[] = [];
    for (const snap of snaps) {
      // already trimmed to TOP_N and sorted by rvol desc, with `_d` resolved
      const top: any[] = Array.isArray(snap.rows) ? snap.rows : [];
      top.forEach((r, i) => {
        flat.push({
          time: snap.time,
          imb: i + 1, // rank within this cycle
          name: r.n,
          side: r.side,
          rvol: r.rvol ?? null,
          rvolCash: r.rvol_cash ?? null,
          rvolFut: r.rvol_fut ?? null,
          dyn_ratio: r.dyn_ratio,
          dynDelta: r._d ?? null,
          dpoc: r.dpoc,
          rt5: r.rt5,
          chg: r.chg,
          entry: r.px,
        });
      });
    }
    return flat;
  } catch (err) {
    console.error("Error fetching V2DYN rows:", err);
    return [];
  }
}

export default async function RfacPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getV2DynRows(dateStr);

  const cycleTimes = Array.from(new Set(signals.map((s: any) => s.time))).sort();
  const latestTime = cycleTimes.length ? cycleTimes[cycleTimes.length - 1] : null;
  const nTier = signals.filter(
    (s: any) => s.time === latestTime && (s.dyn_ratio ?? 0) >= 1.5,
  ).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="RFAC"
        subtitle="RVOL — CASH + FUTURES PARTICIPATION"
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
            TOP {TOP_N} BY RVOL
          </span>
        </div>
        <div className="flex gap-4 ml-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="font-mono text-[11px] text-[#10b981] font-medium">
              {cycleTimes.length} CYCLES TODAY
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.7)]"></div>
            <span className="font-mono text-[11px] text-[#fbbf24] font-medium">
              {nTier} AT ≥1.5
            </span>
          </div>
          {latestTime ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.7)]"></div>
              <span className="font-mono text-[11px] text-[#22d3ee] font-medium">
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
