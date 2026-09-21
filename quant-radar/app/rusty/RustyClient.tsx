"use client";

import { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type Side = "bull" | "bear";
type SortKey = "move" | "rustyPct" | "rustyRank" | "moveRank" | "putIncreaseRank" | "callIncreaseRank" | "target" | "opp";
type Row = { s: string; mv?: number | null; brk?: boolean | null; bt?: string | null; ls?: string | null; p?: number | null; rr?: number | null; pi?: number | null; ci?: number | null; w?: number | null; t?: number | null; o?: number | null };
type Snap = { cut?: string; time?: string; bull?: Row[]; bear?: Row[] };

const tint = { bull: "#22c55e", bear: "#ef4444" };
const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

function Board({ side, rows, sort, setSort, targetOnly, setTargetOnly, brokeOnly, setBrokeOnly }: { side: Side; rows: Row[]; sort: { key: SortKey; strongFirst: boolean }; setSort: (key: SortKey) => void; targetOnly: boolean; setTargetOnly: (next: boolean) => void; brokeOnly: boolean; setBrokeOnly: (next: boolean) => void }) {
  const ranked = rows.filter((row) => !targetOnly || (row.t ?? -Infinity) > 1.5)
    .filter((row) => !brokeOnly || Boolean(row.brk && row.bt && row.ls)).sort((a, b) => {
    if (sort.key === "move") {
      const value = side === "bull" ? (b.mv ?? -Infinity) - (a.mv ?? -Infinity) : (a.mv ?? Infinity) - (b.mv ?? Infinity);
      return sort.strongFirst ? value : -value;
    }
    const value = sort.key === "rustyPct" ? (a.p == null ? Infinity : Math.abs(a.p)) - (b.p == null ? Infinity : Math.abs(b.p))
      : sort.key === "rustyRank" ? (a.rr ?? Infinity) - (b.rr ?? Infinity)
      : sort.key === "moveRank" ? (a.w ?? Infinity) - (b.w ?? Infinity)
      : sort.key === "putIncreaseRank" ? (a.pi ?? Infinity) - (b.pi ?? Infinity)
      : sort.key === "callIncreaseRank" ? (a.ci ?? Infinity) - (b.ci ?? Infinity)
      : sort.key === "target" ? (b.t ?? -Infinity) - (a.t ?? -Infinity)
      : sort.key === "opp" ? (b.o ?? -Infinity) - (a.o ?? -Infinity)
      : 0;
    return sort.strongFirst ? value : -value;
  });
  const label = side === "bull" ? "BULLISH SIGNALS" : "BEARISH SIGNALS";
  const header = (key: SortKey, label: string) => <button onClick={() => setSort(key)} className="inline-flex items-center gap-1 uppercase tracking-[0.1em] transition hover:text-white" style={{ color: sort.key === key ? tint[side] : undefined }}>{label}<span style={{ opacity: sort.key === key ? 1 : 0.3 }}>{sort.key === key ? (sort.strongFirst ? "▲" : "▼") : "↕"}</span></button>;
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint[side] }}>{label}</h2>
        <span className="text-[11px] text-white/35">{ranked.length} names</span>
        <button onClick={() => setTargetOnly(!targetOnly)} className="ml-auto rounded border px-2 py-1 text-[10px] tracking-wider transition" style={{ borderColor: targetOnly ? tint[side] : "rgba(255,255,255,0.1)", color: targetOnly ? tint[side] : "rgba(255,255,255,0.5)", background: targetOnly ? `${tint[side]}11` : "transparent" }}>{targetOnly ? "TGT > 1.5%" : "ALL TGT"}</button>
        <button onClick={() => setBrokeOnly(!brokeOnly)} className="rounded border px-2 py-1 text-[10px] tracking-wider transition" style={{ borderColor: brokeOnly ? tint[side] : "rgba(255,255,255,0.1)", color: brokeOnly ? tint[side] : "rgba(255,255,255,0.5)", background: brokeOnly ? `${tint[side]}11` : "transparent" }}>{brokeOnly ? "BROKE ONLY" : "ALL BREAKS"}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013]"><tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
            <th className="px-3 py-2 text-left font-medium">#</th><th className="px-3 py-2 text-left font-medium">Symbol</th>
            <th className="px-3 py-2 text-right font-medium">Broke</th><th className="px-3 py-2 text-right font-medium">{header("move", "Move %")}</th><th className="px-3 py-2 text-right font-medium">{header("moveRank", "Move Rank")}</th><th className="px-3 py-2 text-right font-medium">{header("rustyPct", "Rusty %")}</th><th className="px-3 py-2 text-right font-medium">{header("rustyRank", "Rusty Rank")}</th><th className="px-3 py-2 text-right font-medium">{header(side === "bull" ? "putIncreaseRank" : "callIncreaseRank", side === "bull" ? "Put ↑ Rank" : "Call ↑ Rank")}</th><th className="px-3 py-2 text-right font-medium">{header("target", "Tgt %")}</th><th className="px-3 py-2 text-right font-medium">{header("opp", "Opp Flow")}</th>
          </tr></thead>
          <tbody>{ranked.length === 0 ? <tr><td colSpan={10} className="px-3 py-8 text-center text-[12px] text-white/30">No signals at this cut.</td></tr> : ranked.map((row, index) => (
            <tr key={row.s} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
              <td className="px-3 py-1.5 tabular-nums text-white/30">{index + 1}</td>
              <td className="px-3 py-1.5 font-medium"><a href={buildTradingViewUrl(row.s, row.s)} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70">{row.s}</a></td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.brk ? <span className="inline-flex items-center gap-1"><span>{row.bt ?? "--"}</span><span className="rounded-sm px-1 text-[9px] font-semibold tracking-wide" style={{ background: `${tint[side]}22`, color: tint[side] }}>{row.ls ?? "BRK"}</span></span> : "--"}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: (row.mv ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{row.mv != null && row.mv > 0 ? "+" : ""}{fmt(row.mv)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.w ?? "--"}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: (row.p ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{row.p == null ? "--" : `${row.p > 0 ? "+" : ""}${fmt(row.p)}%`}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.rr ?? "--"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/55">{side === "bull" ? (row.pi ?? "--") : (row.ci ?? "--")}</td>
              <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: (row.t ?? 0) >= 1.5 ? tint[side] : "rgba(255,255,255,0.45)" }}>{row.t == null ? "--" : `${fmt(row.t)}%`}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmt(row.o)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function RustyClient({ snaps }: { snaps: Snap[] }) {
  const cuts = useMemo(() => Array.from(new Map(snaps.map((snap) => [String(snap.cut ?? snap.time ?? ""), snap])).entries()).filter(([time]) => time).sort((a, b) => a[0].localeCompare(b[0])), [snaps]);
  const [index, setIndex] = useState<number | null>(null);
  const [bullSort, setBullSort] = useState<{ key: SortKey; strongFirst: boolean }>({ key: "move", strongFirst: true });
  const [bearSort, setBearSort] = useState<{ key: SortKey; strongFirst: boolean }>({ key: "move", strongFirst: true });
  const [bullTargetOnly, setBullTargetOnly] = useState(false);
  const [bearTargetOnly, setBearTargetOnly] = useState(false);
  const [bullBrokeOnly, setBullBrokeOnly] = useState(false);
  const [bearBrokeOnly, setBearBrokeOnly] = useState(false);
  const active = index === null ? cuts.length - 1 : Math.min(index, cuts.length - 1);
  const snap = cuts[active]?.[1];
  const changeSort = (side: Side, key: SortKey) => {
    const current = side === "bull" ? bullSort : bearSort;
    const next = { key, strongFirst: current.key === key ? !current.strongFirst : true };
    side === "bull" ? setBullSort(next) : setBearSort(next);
  };
  if (!cuts.length) return <div className="flex h-full items-center justify-center text-[14px] text-white/50">No RUSTY cuts published for this date yet.</div>;
  return <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-3">
    <div className="flex flex-wrap items-center gap-3"><span className="text-[10px] uppercase tracking-[0.12em] text-white/35">Cut</span><input type="range" min={0} max={cuts.length - 1} value={active} onChange={(event) => setIndex(Number(event.target.value))} className="h-1 w-56 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500" /><span className="min-w-[52px] font-mono text-[13px] font-semibold tabular-nums text-orange-400">{cuts[active]?.[0]}</span><span className="text-[11px] text-white/30">{active + 1} / {cuts.length}</span>{index !== null && active !== cuts.length - 1 && <button onClick={() => setIndex(null)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.05]">Jump to latest</button>}</div>
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"><Board side="bull" rows={snap?.bull ?? []} sort={bullSort} setSort={(key) => changeSort("bull", key)} targetOnly={bullTargetOnly} setTargetOnly={setBullTargetOnly} brokeOnly={bullBrokeOnly} setBrokeOnly={setBullBrokeOnly} /><Board side="bear" rows={snap?.bear ?? []} sort={bearSort} setSort={(key) => changeSort("bear", key)} targetOnly={bearTargetOnly} setTargetOnly={setBearTargetOnly} brokeOnly={bearBrokeOnly} setBrokeOnly={setBearBrokeOnly} /></div>
  </div>;
}
