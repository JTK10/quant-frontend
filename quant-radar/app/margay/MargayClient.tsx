"use client";

import { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type Row = {
  s: string;                // symbol
  type: "RANGE_BREAK" | "PDL_BREAK" | "PDH_BREAK";
  lv: number | null;        // the level -- 09:15->10:00 true range (RANGE_BREAK) or PDL/PDH
  brk: string | null;       // break time. null on RANGE_BREAK means still waiting.
  ce_chg: number | null;    // call OI %chg in the 1.5% band since 09:15 (PDL/PDH_BREAK only)
  pe_chg: number | null;    // put OI %chg, same band
  mv: number | null;        // %move from prior close, live every cut
  sp: number | null;        // spot
  cr: number | null;        // notional, Rs crore
};

type Snap = {
  cut?: string;
  time?: string;
  bull?: Row[];
  bear?: Row[];
};

const ACCENT = "#a855f7";

const TYPE_TINT: Record<Row["type"], string> = {
  RANGE_BREAK: "rgba(255,255,255,0.5)",
  PDL_BREAK: "#ef4444",
  PDH_BREAK: "#22c55e",
};

const TYPE_LABEL: Record<Row["type"], string> = {
  RANGE_BREAK: "RANGE",
  PDL_BREAK: "PDL",
  PDH_BREAK: "PDH",
};

function rank(rows: Row[]) {
  // Both sides sort by mv descending -- it's already signed so the favourable
  // direction is positive on both boards (rise% for bull, fall% for bear).
  return [...rows].sort((a, b) => (b.mv ?? -Infinity) - (a.mv ?? -Infinity));
}

const fmtPct = (v: number | null | undefined, withSign = true) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : `${withSign && v > 0 ? "+" : ""}${v.toFixed(withSign ? 2 : 1)}`;

const fmt = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function Board({ title, rows, tint }: { title: string; rows: Row[]; tint: string }) {
  const ranked = rank(rows);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint }}>
          {title}
        </h2>
        <span className="text-[11px] text-white/35">{ranked.length} matches</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013]">
            <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Broke</th>
              <th className="px-3 py-2 text-right font-medium">Level → Spot</th>
              <th className="px-3 py-2 text-right font-medium">CE%chg</th>
              <th className="px-3 py-2 text-right font-medium">PE%chg</th>
              <th className="px-3 py-2 text-right font-medium">Move %</th>
              <th className="px-3 py-2 text-right font-medium">₹ Cr</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[12px] text-white/30">
                  No matches at this cut.
                </td>
              </tr>
            )}
            {ranked.map((r, i) => (
              <tr key={`${r.s}-${r.type}`} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
                <td className="px-3 py-1.5 tabular-nums text-white/30">{i + 1}</td>
                <td className="px-3 py-1.5 font-medium">
                  <a
                    href={buildTradingViewUrl(r.s, r.s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70"
                    style={{ color: "inherit" }}
                    title={`Open ${r.s} on TradingView`}
                  >
                    {r.s}
                  </a>
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className="rounded-sm px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide"
                    style={{ background: `${TYPE_TINT[r.type]}22`, color: TYPE_TINT[r.type] }}
                    title={
                      r.type === "RANGE_BREAK"
                        ? "Locked rule: clear + held, decided once at 10:00. Waiting for the true 09:15->10:00 range to break."
                        : "Prior-day level broken early (by 09:30). Sticky once the 1.5% band OI%chg confirms -- stays on the list even if a later cut would fail it."
                    }
                  >
                    {TYPE_LABEL[r.type]}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/45">
                  {r.brk ?? (r.type === "RANGE_BREAK" ? "waiting" : "--")}
                </td>
                <td
                  className="px-3 py-1.5 text-right tabular-nums text-white/50"
                  title={
                    r.type === "RANGE_BREAK"
                      ? "The true 09:15->10:00 range level, and where it's trading now"
                      : "The prior-day level that broke, and where it's trading now"
                  }
                >
                  {fmt(r.lv, 2)} → {fmt(r.sp, 2)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmtPct(r.ce_chg, false)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmtPct(r.pe_chg, false)}</td>
                <td
                  className="px-3 py-1.5 text-right font-semibold tabular-nums"
                  style={{ color: (r.mv ?? 0) > 0 ? tint : "rgba(255,255,255,0.35)" }}
                >
                  {fmtPct(r.mv)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/40">{fmt(r.cr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MargayClient({ snaps }: { snaps: Snap[] }) {
  const cuts = useMemo(() => {
    const seen = new Map<string, Snap>();
    for (const s of snaps) {
      const k = String(s.cut ?? s.time ?? "");
      if (k) seen.set(k, s);
    }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [snaps]);

  const [idx, setIdx] = useState<number | null>(null);
  const active = idx === null ? cuts.length - 1 : Math.min(idx, cuts.length - 1);
  const snap = cuts[active]?.[1];

  if (cuts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[14px] text-white/60">No cuts published for this date yet.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/35">
            MARGAY's decision cut is 10:00 -- RANGE_BREAK names only appear from
            then, PDL/PDH_BREAK names can appear as early as 09:20.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 px-4 pb-4 pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-white/35">Cut</span>
          <input
            type="range"
            min={0}
            max={cuts.length - 1}
            value={active}
            onChange={(e) => setIdx(Number(e.target.value))}
            className="h-1 w-56 cursor-pointer appearance-none rounded-full bg-white/10"
            style={{ accentColor: ACCENT }}
            aria-label="Select capture cut"
          />
          <span className="min-w-[52px] font-mono text-[13px] font-semibold tabular-nums" style={{ color: ACCENT }}>
            {cuts[active]?.[0]}
          </span>
          <span className="text-[11px] text-white/30">
            {active + 1} / {cuts.length}
          </span>
        </div>

        {idx !== null && active !== cuts.length - 1 && (
          <button
            onClick={() => setIdx(null)}
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/[0.05]"
          >
            Jump to latest
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <Board title="BULL · PDH / RANGE" rows={snap?.bull ?? []} tint="#22c55e" />
        <Board title="BEAR · PDL / RANGE" rows={snap?.bear ?? []} tint="#ef4444" />
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-white/25">
        Two locked patterns, all matches shown (not top-N), ranked by Move % from prior close.
        RANGE = clear+held decided once at 10:00, waiting for the true 09:15-10:00 range to
        break. PDL/PDH = prior-day level broken early (by 09:30), sticky once the 1.5% band
        OI%chg confirms -- stays on the list for the session even if a later cut would fail it.
      </p>
    </div>
  );
}
