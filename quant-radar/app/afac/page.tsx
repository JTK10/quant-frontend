import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import AfacClient from "./AfacClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

const TOP_N = 30;

async function getAfacRows(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=afac2`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`AFAC signal route failed: ${response.status} - ${errText}`);
      throw new Error(`AFAC signal route failed: ${response.status}`);
    }
    const data = await response.json();
    // AFAC.2 snapshots: one doc per 5-min cycle, source:"afac2", each carrying an
    // embedded `rows` array (every gated stock, sorted by score desc) computed by
    // afac2_score.py on the VM (split-pool funnel + monotonic "safest mover"
    // quality score). We flatten each cycle's top-30 into one row-per-stock-per-
    // cycle table, same shape/spirit as the RFAC page, so the UI can reuse its
    // sortable-grid pattern.
    const snaps = (data as any[])
      .filter((s) => s.source === "afac2" || s.cap === "AFAC2")
      .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

    const prevScoreByStock = new Map<string, number>();
    const flat: any[] = [];
    for (const snap of snaps) {
      const rows: any[] = Array.isArray(snap.rows) ? snap.rows : [];
      const top = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, TOP_N);
      const seenThisCycle = new Set<string>();
      top.forEach((r, i) => {
        const prev = prevScoreByStock.get(r.n);
        const secs: string[] = Array.isArray(r.secs) ? r.secs : typeof r.secs === "string" && r.secs ? [r.secs] : [];
        flat.push({
          time: snap.time,
          imb: i + 1, // rank within this cycle's top-30
          name: r.n,
          side: r.side,
          score: r.score,
          scoreDelta: prev !== undefined ? (r.score ?? 0) - prev : null,
          chg: r.chg,
          entry: r.px,
          sector: secs.map((s) => s.replace(/^NIFTY_/, "").replace(/_/g, " ")).join(" / "),
          dpoc: r.dpoc,
          ahead: r.vol_ahead,
          dyn: r.dyn_ratio,
        });
        seenThisCycle.add(r.n);
      });
      // update "previous score" baseline from this cycle's full row set (not just top-30)
      // so a stock's delta is correct even if it just entered the top-30
      for (const r of rows) prevScoreByStock.set(r.n, r.score ?? 0);
      void seenThisCycle;
    }
    return flat;
  } catch (err) {
    console.error("Error fetching AFAC rows:", err);
    return [];
  }
}

export default async function AfacPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getAfacRows(dateStr);

  const cycleTimes = Array.from(new Set(signals.map((s: any) => s.time))).sort();
  const latestTime = cycleTimes.length ? cycleTimes[cycleTimes.length - 1] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      <PageHeader
        title="AFAC"
        subtitle="SMC SCANNER"
        badge="LIVE"
        dateStr={dateStr}
        accentColor="#fce205"
      >
        <DatePicker />
        <AutoRefresh interval={45000} />
      </PageHeader>

      <div
        className="flex items-center gap-4 border-b border-[#ffffff10] px-3 py-3 md:px-6 z-10 relative shrink-0 shadow-sm"
        style={{
          background: "linear-gradient(180deg, rgba(252,226,5,0.05), transparent), #0A0A0B",
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#fce205] font-semibold bg-[#fce20515] px-2 py-1 rounded-sm border border-[#fce20530]">
            NSE FNO UNIVERSE
          </span>
          <span className="font-mono text-sm font-bold tracking-[0.18em] text-[#fce205]">
            TOP {TOP_N} BY AFAC.2
          </span>
        </div>
        <div className="flex gap-4 ml-8">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#fce205] shadow-[0_0_8px_rgba(252,226,5,0.5)]"></div>
            <span className="font-mono text-[11px] text-[#fce205] font-medium">
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
          <div className="w-1.5 h-1.5 rounded-full bg-[#fce205] animate-pulse shadow-[0_0_8px_rgba(252,226,5,0.8)]"></div>
          <span className="font-mono text-[11px] text-gray-400">
            {signals.length} ROWS
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative p-4 md:p-6 bg-gradient-to-b from-[#0A0A0B] to-[#121214]">
        <AfacClient signals={signals} latestTime={latestTime as string | null} />
      </div>
    </div>
  );
}
