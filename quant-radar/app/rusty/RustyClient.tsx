"use client";

import { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type Side = "bull" | "bear";
type Row = { s: string; mv?: number | null; brk?: boolean | null; bt?: string | null; ls?: string | null };
type Snap = { cut?: string; time?: string; bull?: Row[]; bear?: Row[] };

const tint = { bull: "#22c55e", bear: "#ef4444" };
const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

function Board({ side, rows }: { side: Side; rows: Row[] }) {
  const ranked = [...rows].sort((a, b) => side === "bull" ? (b.mv ?? -Infinity) - (a.mv ?? -Infinity) : (a.mv ?? Infinity) - (b.mv ?? Infinity));
  const label = side === "bull" ? "BULLISH SIGNALS" : "BEARISH SIGNALS";
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
            <th className="px-3 py-2 text-right font-medium">Broke</th><th className="px-3 py-2 text-right font-medium">Move %</th>
          </tr></thead>
          <tbody>{ranked.length === 0 ? <tr><td colSpan={4} className="px-3 py-8 text-center text-[12px] text-white/30">No signals at this cut.</td></tr> : ranked.map((row, index) => (
            <tr key={row.s} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
              <td className="px-3 py-1.5 tabular-nums text-white/30">{index + 1}</td>
              <td className="px-3 py-1.5 font-medium"><a href={buildTradingViewUrl(row.s, row.s)} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70">{row.s}</a></td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.brk ? <span className="inline-flex items-center gap-1"><span>{row.bt ?? "--"}</span><span className="rounded-sm px-1 text-[9px] font-semibold tracking-wide" style={{ background: `${tint[side]}22`, color: tint[side] }}>{row.ls ?? "BRK"}</span></span> : "--"}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: (row.mv ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{row.mv != null && row.mv > 0 ? "+" : ""}{fmt(row.mv)}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </section>
  );
}

export default function RustyClient({ snaps }: { snaps: Snap[] }) {
  const cuts = useMemo(() => Array.from(new Map(snaps.map((snap) => [String(snap.cut ?? snap.time ?? ""), snap])).entries()).filter(([time]) => time).sort((a, b) => a[0].localeCompare(b[0])), [snaps]);
  const [index, setIndex] = useState<number | null>(null);
  const active = index === null ? cuts.length - 1 : Math.min(index, cuts.length - 1);
  const snap = cuts[active]?.[1];
  if (!cuts.length) return <div className="flex h-full items-center justify-center text-[14px] text-white/50">No RUSTY cuts published for this date yet.</div>;
  return <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-3">
    <div className="flex flex-wrap items-center gap-3"><span className="text-[10px] uppercase tracking-[0.12em] text-white/35">Cut</span><input type="range" min={0} max={cuts.length - 1} value={active} onChange={(event) => setIndex(Number(event.target.value))} className="h-1 w-56 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500" /><span className="min-w-[52px] font-mono text-[13px] font-semibold tabular-nums text-orange-400">{cuts[active]?.[0]}</span><span className="text-[11px] text-white/30">{active + 1} / {cuts.length}</span>{index !== null && active !== cuts.length - 1 && <button onClick={() => setIndex(null)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.05]">Jump to latest</button>}</div>
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row"><Board side="bull" rows={snap?.bull ?? []} /><Board side="bear" rows={snap?.bear ?? []} /></div>
  </div>;
}
