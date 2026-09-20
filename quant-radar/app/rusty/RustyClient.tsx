"use client";

import { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type Side = "bull" | "bear";
type SortKey = "move" | "oi" | "rank";
type Row = { s: string; mv?: number | null; mr?: number | null; oi: number; rk: number; brk?: boolean | null; bt?: string | null; ls?: string | null };
type Snap = { cut?: string; time?: string; n?: number; bull?: Row[]; bear?: Row[] };
type Sort = { key: SortKey; strongFirst: boolean };

const tint = { bull: "#22c55e", bear: "#ef4444" };
const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

function compareRows(a: Row, b: Row, side: Side, sort: Sort) {
  if (sort.key === "move") {
    const av = a.mv ?? (side === "bull" ? -Infinity : Infinity);
    const bv = b.mv ?? (side === "bull" ? -Infinity : Infinity);
    const value = side === "bull" ? bv - av : av - bv;
    return sort.strongFirst ? value : -value;
  }
  const value = sort.key === "oi" ? a.oi - b.oi : a.rk - b.rk;
  return sort.strongFirst ? value : -value;
}

function arrow(current: Sort, key: SortKey) {
  return current.key !== key ? "↕" : current.strongFirst ? "▲" : "▼";
}

function Board({ side, rows, sort, setSort }: { side: Side; rows: Row[]; sort: Sort; setSort: (key: SortKey) => void }) {
  const ranked = [...rows].sort((a, b) => compareRows(a, b, side, sort));
  const label = side === "bull" ? "BULLISH · CALL OI DECREASING" : "BEARISH · PUT OI DECREASING";
  const rankLabel = side === "bull" ? "Winner rank" : "Loser rank";
  const clickHeader = (key: SortKey, label: string) => (
    <button onClick={() => setSort(key)} className="inline-flex items-center gap-1 uppercase tracking-[0.1em] transition hover:text-white" style={{ color: sort.key === key ? tint[side] : undefined }}>
      {label}<span style={{ opacity: sort.key === key ? 1 : 0.3 }}>{arrow(sort, key)}</span>
    </button>
  );
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint[side] }}>{label}</h2>
        <span className="text-[11px] text-white/35">{ranked.length} names</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013]"><tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
            <th className="px-3 py-2 text-left font-medium">#</th><th className="px-3 py-2 text-left font-medium">Symbol</th>
            <th className="px-3 py-2 text-right font-medium">Broke</th><th className="px-3 py-2 text-right font-medium">{clickHeader("move", "Move %")}</th>
            <th className="px-3 py-2 text-right font-medium">{rankLabel}</th><th className="px-3 py-2 text-right font-medium">{clickHeader("oi", `${side === "bull" ? "Call" : "Put"} OI ↓ %`)}</th>
            <th className="px-3 py-2 text-right font-medium">{clickHeader("rank", "OI rank")}</th>
          </tr></thead>
          <tbody>{ranked.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-[12px] text-white/30">No matching OI rows at this cut.</td></tr> : ranked.map((row, index) => (
            <tr key={row.s} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
              <td className="px-3 py-1.5 tabular-nums text-white/30">{index + 1}</td>
              <td className="px-3 py-1.5 font-medium"><a href={buildTradingViewUrl(row.s, row.s)} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70">{row.s}</a></td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.brk ? <span className="inline-flex items-center gap-1"><span>{row.bt ?? "--"}</span><span className="rounded-sm px-1 text-[9px] font-semibold tracking-wide" style={{ background: `${tint[side]}22`, color: tint[side] }}>{row.ls ?? "BRK"}</span></span> : "--"}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: (row.mv ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{row.mv != null && row.mv > 0 ? "+" : ""}{fmt(row.mv)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.mr ?? "--"}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: tint[side] }}>{fmt(row.oi)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.rk}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function RustyClient({ snaps }: { snaps: Snap[] }) {
  const cuts = useMemo(() => Array.from(new Map(snaps.map((snap) => [String(snap.cut ?? snap.time ?? ""), snap])).entries()).filter(([time]) => time).sort((a, b) => a[0].localeCompare(b[0])), [snaps]);
  const [index, setIndex] = useState<number | null>(null);
  const [bullSort, setBullSort] = useState<Sort>({ key: "move", strongFirst: true });
  const [bearSort, setBearSort] = useState<Sort>({ key: "move", strongFirst: true });
  const active = index === null ? cuts.length - 1 : Math.min(index, cuts.length - 1);
  const snap = cuts[active]?.[1];
  const changeSort = (side: Side, key: SortKey) => {
    const current = side === "bull" ? bullSort : bearSort;
    const next = { key, strongFirst: current.key === key ? !current.strongFirst : true };
    side === "bull" ? setBullSort(next) : setBearSort(next);
  };
  if (!cuts.length) return <div className="flex h-full items-center justify-center text-[14px] text-white/50">No RUSTY cuts published for this date yet.</div>;
  return <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-3">
    <div className="flex flex-wrap items-center gap-3"><span className="text-[10px] uppercase tracking-[0.12em] text-white/35">Cut</span><input type="range" min={0} max={cuts.length - 1} value={active} onChange={(event) => setIndex(Number(event.target.value))} className="h-1 w-56 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500" /><span className="min-w-[52px] font-mono text-[13px] font-semibold tabular-nums text-orange-400">{cuts[active]?.[0]}</span><span className="text-[11px] text-white/30">{active + 1} / {cuts.length}</span>{index !== null && active !== cuts.length - 1 && <button onClick={() => setIndex(null)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.05]">Jump to latest</button>}<span className="ml-auto text-[11px] text-white/30">{snap?.n ?? "--"} matched-baseline names</span></div>
    <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/45">Bull: Call OI decreasing. Bear: Put OI decreasing. OI % is cumulative from the matched 09:15 strike basket; Move % is current cash price versus today’s opening price. Click Move %, OI ↓ %, or OI rank to sort. Broke uses Ocelot’s live PDH/PDL or opening-range break state.</p>
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"><Board side="bull" rows={snap?.bull ?? []} sort={bullSort} setSort={(key) => changeSort("bull", key)} /><Board side="bear" rows={snap?.bear ?? []} sort={bearSort} setSort={(key) => changeSort("bear", key)} /></div>
  </div>;
}
