"use client";

import { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type Side = "bull" | "bear";
type SortKey = "move" | "rustyPct" | "rustyRank" | "decreaseRank" | "moveRank" | "putIncreaseRank" | "callIncreaseRank" | "ce" | "pe" | "candleBody";
type Row = {
  s: string;
  mv?: number | null;
  brk?: boolean | null;
  bt?: string | null;
  ls?: string | null;
  p?: number | null;
  rr?: number | null;
  dr?: number | null;
  pi?: number | null;
  ci?: number | null;
  w?: number | null;
  ce?: number | null;
  pe?: number | null;
  ce_pct?: number | null;
  pe_pct?: number | null;
  oi_bias?: number | null;
  flow_type?: string | null;
  flow_label?: string | null;
  badge_color?: string | null;
  badge_bg?: string | null;
  conviction?: string | null;
  is_new_discovery?: boolean | null;
  // 5M Candle Quality Metrics
  c_time?: string | null;
  c_open?: number | null;
  c_close?: number | null;
  c_high?: number | null;
  c_low?: number | null;
  c_body?: number | null;
  c_uw?: number | null;
  c_lw?: number | null;
  c_mv?: number | null;
  is_maru?: boolean | null;
  is_solid?: boolean | null;
  candle_tier?: string | null;
  entry_confirmed?: boolean | null;
};
type Snap = { cut?: string; time?: string; bull?: Row[]; bear?: Row[] };

const tint = { bull: "#22c55e", bear: "#ef4444" };
const fmt = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "--" : value.toFixed(2);

function Board({
  side, rows, sort, setSort,
  brokeOnly, setBrokeOnly,
  highOnly, setHighOnly,
  entryOnly, setEntryOnly,
  maruOnly, setMaruOnly,
}: {
  side: Side;
  rows: Row[];
  sort: { key: SortKey; strongFirst: boolean };
  setSort: (key: SortKey) => void;
  brokeOnly: boolean;
  setBrokeOnly: (next: boolean) => void;
  highOnly: boolean;
  setHighOnly: (next: boolean) => void;
  entryOnly: boolean;
  setEntryOnly: (next: boolean) => void;
  maruOnly: boolean;
  setMaruOnly: (next: boolean) => void;
}) {
  const ranked = rows.filter((row) => {
    if (entryOnly && !row.entry_confirmed) return false;
    if (maruOnly && !row.is_maru) return false;
    if (highOnly && row.conviction !== "HIGH") return false;
    if (brokeOnly && !Boolean(row.brk && row.bt && row.ls)) return false;
    return true;
  }).sort((a, b) => {
    if (sort.key === "move") {
      const value = side === "bull" ? (b.mv ?? -Infinity) - (a.mv ?? -Infinity) : (a.mv ?? Infinity) - (b.mv ?? Infinity);
      return sort.strongFirst ? value : -value;
    }
    if (sort.key === "candleBody") {
      const value = (b.c_body ?? -Infinity) - (a.c_body ?? -Infinity);
      return sort.strongFirst ? value : -value;
    }
    const value = sort.key === "rustyPct" ? (a.p == null ? Infinity : Math.abs(a.p)) - (b.p == null ? Infinity : Math.abs(b.p))
      : sort.key === "rustyRank" ? (a.rr ?? Infinity) - (b.rr ?? Infinity)
      : sort.key === "decreaseRank" ? (a.dr ?? Infinity) - (b.dr ?? Infinity)
      : sort.key === "moveRank" ? (a.w ?? Infinity) - (b.w ?? Infinity)
      : sort.key === "putIncreaseRank" ? (a.pi ?? Infinity) - (b.pi ?? Infinity)
      : sort.key === "callIncreaseRank" ? (a.ci ?? Infinity) - (b.ci ?? Infinity)
      : sort.key === "ce" ? (b.ce ?? -Infinity) - (a.ce ?? -Infinity)
      : sort.key === "pe" ? (b.pe ?? -Infinity) - (a.pe ?? -Infinity)
      : 0;
    return sort.strongFirst ? value : -value;
  });

  const label = side === "bull" ? "BULLISH SIGNALS" : "BEARISH SIGNALS";
  const header = (key: SortKey, label: string) => (
    <button onClick={() => setSort(key)} className="inline-flex items-center gap-1 uppercase tracking-[0.1em] transition hover:text-white" style={{ color: sort.key === key ? tint[side] : undefined }}>
      {label}<span style={{ opacity: sort.key === key ? 1 : 0.3 }}>{sort.key === key ? (sort.strongFirst ? "▲" : "▼") : "↕"}</span>
    </button>
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-baseline gap-2 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint[side] }}>{label}</h2>
        <span className="text-[11px] text-white/35">{ranked.length} names</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setEntryOnly(!entryOnly)}
            className="rounded border px-2 py-0.5 text-[10px] tracking-wider transition font-bold"
            style={{
              borderColor: entryOnly ? "#f97316" : "rgba(255,255,255,0.1)",
              color: entryOnly ? "#fff" : "rgba(255,255,255,0.5)",
              background: entryOnly ? "linear-gradient(135deg, #f97316, #ef4444)" : "transparent"
            }}
          >
            🎯 ENTRIES ONLY
          </button>
          <button
            onClick={() => setMaruOnly(!maruOnly)}
            className="rounded border px-2 py-0.5 text-[10px] tracking-wider transition"
            style={{
              borderColor: maruOnly ? "#a855f7" : "rgba(255,255,255,0.1)",
              color: maruOnly ? "#a855f7" : "rgba(255,255,255,0.5)",
              background: maruOnly ? "rgba(168,85,247,0.15)" : "transparent"
            }}
          >
            🔥 MARUBOZUS
          </button>
          <button
            onClick={() => setHighOnly(!highOnly)}
            className="rounded border px-2 py-0.5 text-[10px] tracking-wider transition"
            style={{
              borderColor: highOnly ? "#38bdf8" : "rgba(255,255,255,0.1)",
              color: highOnly ? "#38bdf8" : "rgba(255,255,255,0.5)",
              background: highOnly ? "rgba(56,189,248,0.12)" : "transparent"
            }}
          >
            STRONG OI
          </button>
          <button
            onClick={() => setBrokeOnly(!brokeOnly)}
            className="rounded border px-2 py-0.5 text-[10px] tracking-wider transition"
            style={{
              borderColor: brokeOnly ? tint[side] : "rgba(255,255,255,0.1)",
              color: brokeOnly ? tint[side] : "rgba(255,255,255,0.5)",
              background: brokeOnly ? `${tint[side]}11` : "transparent"
            }}
          >
            {brokeOnly ? "BROKE ONLY" : "ALL BREAKS"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013]">
            <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-left font-medium">{header("candleBody", "🕯️ 5M Candle")}</th>
              <th className="px-3 py-2 text-left font-medium">Classification</th>
              <th className="px-3 py-2 text-right font-medium">Broke</th>
              <th className="px-3 py-2 text-right font-medium">{header("move", "Move %")}</th>
              <th className="px-3 py-2 text-right font-medium">OI vs Baseline (CE / PE)</th>
              <th className="px-3 py-2 text-right font-medium">{header("rustyPct", "Rusty %")}</th>
              <th className="px-3 py-2 text-right font-medium">{header("decreaseRank", side === "bull" ? "Call ↓" : "Put ↓")}</th>
              <th className="px-3 py-2 text-right font-medium">{header(side === "bull" ? "putIncreaseRank" : "callIncreaseRank", side === "bull" ? "Put ↑" : "Call ↑")}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-[12px] text-white/30">No signals matching filter.</td></tr>
            ) : ranked.map((row, index) => (
              <tr key={row.s} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
                <td className="px-3 py-1.5 tabular-nums text-white/30">{index + 1}</td>
                <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                  <a href={buildTradingViewUrl(row.s, row.s)} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70">{row.s}</a>
                  {row.entry_confirmed && (
                    <span className="ml-1.5 rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-[0_0_8px_rgba(249,115,22,0.6)]" style={{ background: "linear-gradient(135deg, #f97316, #ef4444)" }}>
                      🎯 ENTRY
                    </span>
                  )}
                  {row.is_new_discovery && <span className="ml-1.5 rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-bold text-emerald-400">NEW</span>}
                </td>
                <td className="px-3 py-1.5 text-left whitespace-nowrap">
                  <div>
                    {row.is_maru ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9.5px] font-bold shadow-[0_0_8px_rgba(244,63,94,0.3)]" style={{ color: side === "bull" ? "#10b981" : "#f43f5e", background: side === "bull" ? "rgba(16,185,129,0.2)" : "rgba(244,63,94,0.2)", border: `1px solid ${side === "bull" ? "rgba(16,185,129,0.5)" : "rgba(244,63,94,0.5)"}` }}>
                        🔥 MARUBOZU ({row.c_body?.toFixed(0)}%)
                      </span>
                    ) : row.is_solid ? (
                      <span className="inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 bg-amber-400/15 border border-amber-400/30">
                        ⚡ SOLID ({row.c_body?.toFixed(0)}%)
                      </span>
                    ) : row.c_body != null ? (
                      <span className="text-[10px] text-white/40">
                        Wicky ({row.c_body?.toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/20">--</span>
                    )}
                  </div>
                  {row.c_open != null && row.c_close != null && (
                    <div className="font-mono text-[9px] text-white/40 mt-0.5">
                      {row.c_time ? `${row.c_time} ` : ""}O:{fmt(row.c_open)} C:{fmt(row.c_close)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1.5 text-left">
                  {row.flow_label ? (
                    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ color: row.badge_color ?? "#94a3b8", background: row.badge_bg ?? "rgba(148,163,184,0.12)" }}>
                      {row.flow_label}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/30">--</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.brk ? <span className="inline-flex items-center gap-1"><span>{row.bt ?? "--"}</span><span className="rounded-sm px-1 text-[9px] font-semibold tracking-wide" style={{ background: `${tint[side]}22`, color: tint[side] }}>{row.ls ?? "BRK"}</span></span> : "--"}</td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: (row.mv ?? 0) >= 0 ? "#22c55e" : "#ef4444" }}>{row.mv != null && row.mv > 0 ? "+" : ""}{fmt(row.mv)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[11px]">
                  <span className={(row.ce_pct ?? row.ce ?? 0) > 0 ? "text-rose-400" : (row.ce_pct ?? row.ce ?? 0) < 0 ? "text-cyan-400" : "text-white/40"}>C:{(row.ce_pct ?? row.ce) != null ? ((row.ce_pct ?? row.ce)! > 0 ? `+${fmt(row.ce_pct ?? row.ce)}%` : `${fmt(row.ce_pct ?? row.ce)}%`) : "--"}</span>
                  <span className="mx-1 text-white/20">|</span>
                  <span className={(row.pe_pct ?? row.pe ?? 0) > 0 ? "text-emerald-400" : (row.pe_pct ?? row.pe ?? 0) < 0 ? "text-pink-400" : "text-white/40"}>P:{(row.pe_pct ?? row.pe) != null ? ((row.pe_pct ?? row.pe)! > 0 ? `+${fmt(row.pe_pct ?? row.pe)}%` : `${fmt(row.pe_pct ?? row.pe)}%`) : "--"}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums" style={{ color: tint[side] }}>{row.p == null ? "--" : `${row.p > 0 ? "+" : ""}${fmt(row.p)}%`}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/45">{row.dr ?? "--"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/55">{side === "bull" ? (row.pi ?? "--") : (row.ci ?? "--")}</td>
              </tr>
            ))}
          </tbody>
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
  const [bullBrokeOnly, setBullBrokeOnly] = useState(false);
  const [bearBrokeOnly, setBearBrokeOnly] = useState(false);
  const [bullHighOnly, setBullHighOnly] = useState(false);
  const [bearHighOnly, setBearHighOnly] = useState(false);
  const [bullEntryOnly, setBullEntryOnly] = useState(false);
  const [bearEntryOnly, setBearEntryOnly] = useState(false);
  const [bullMaruOnly, setBullMaruOnly] = useState(false);
  const [bearMaruOnly, setBearMaruOnly] = useState(false);

  const active = index === null ? cuts.length - 1 : Math.min(index, cuts.length - 1);
  const snap = cuts[active]?.[1];

  const changeSort = (side: Side, key: SortKey) => {
    const current = side === "bull" ? bullSort : bearSort;
    const next = { key, strongFirst: current.key === key ? !current.strongFirst : true };
    side === "bull" ? setBullSort(next) : setBearSort(next);
  };

  if (!cuts.length) return <div className="flex h-full items-center justify-center text-[14px] text-white/50">No RUSTY cuts published for this date yet.</div>;

  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/35">Cut</span>
        <input
          type="range"
          min={0}
          max={cuts.length - 1}
          value={active}
          onChange={(event) => setIndex(Number(event.target.value))}
          className="h-1 w-56 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500"
        />
        <span className="min-w-[52px] font-mono text-[13px] font-semibold tabular-nums text-orange-400">{cuts[active]?.[0]}</span>
        <span className="text-[11px] text-white/30">{active + 1} / {cuts.length}</span>
        {index !== null && active !== cuts.length - 1 && (
          <button onClick={() => setIndex(null)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.05]">
            Jump to latest
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <Board
          side="bull"
          rows={snap?.bull ?? []}
          sort={bullSort}
          setSort={(key) => changeSort("bull", key)}
          brokeOnly={bullBrokeOnly}
          setBrokeOnly={setBullBrokeOnly}
          highOnly={bullHighOnly}
          setHighOnly={setBullHighOnly}
          entryOnly={bullEntryOnly}
          setEntryOnly={setBullEntryOnly}
          maruOnly={bullMaruOnly}
          setMaruOnly={setBullMaruOnly}
        />
        <Board
          side="bear"
          rows={snap?.bear ?? []}
          sort={bearSort}
          setSort={(key) => changeSort("bear", key)}
          brokeOnly={bearBrokeOnly}
          setBrokeOnly={setBearBrokeOnly}
          highOnly={bearHighOnly}
          setHighOnly={setBearHighOnly}
          entryOnly={bearEntryOnly}
          setEntryOnly={setBearEntryOnly}
          maruOnly={bearMaruOnly}
          setMaruOnly={setBearMaruOnly}
        />
      </div>
    </div>
  );
}
