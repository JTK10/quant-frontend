"use client";

import { useMemo, useState } from "react";

type Row = {
  s: string;            // symbol
  sp: number | null;    // spot
  d: number | null;     // % past prior-day level (high for bull, low for bear)
  brk: boolean | null;  // level already broken by this cut
  c: number;            // cover  -- options bought back behind price
  w: number;            // write  -- options sold behind price
  sq: number;           // flow score
  cr: number | null;    // notional, Rs crore
};

type Snap = {
  cut?: string;
  time?: string;
  n?: number;
  nq?: number;
  bull?: Row[];
  bear?: Row[];
};

const ACCENT = "#f97316";

/**
 * Ranking is by DISTANCE past the prior-day level, not by the flow score.
 *
 * On the ten confirmed winners, distance put 9 of 10 inside the top five while
 * the flow score managed 7, and averaging the two ranked worse than distance
 * alone. So `d` is the sort key and `sq` is a column.
 *
 * Rows with no cover (c === 0) are pure one-sided writing -- the shape that
 * topped the board on the two sessions that failed. They are shown, but marked,
 * because a name with both legs firing beat a higher-scoring name with none.
 */
function rank(rows: Row[], brokenOnly: boolean) {
  const list = brokenOnly ? rows.filter((r) => r.brk === true) : [...rows];
  return list.sort((a, b) => {
    const ad = a.d ?? -Infinity;
    const bd = b.d ?? -Infinity;
    if (bd !== ad) return bd - ad;
    return (b.sq ?? 0) - (a.sq ?? 0);
  });
}

const fmt = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function Board({
  title,
  rows,
  brokenOnly,
  tint,
}: {
  title: string;
  rows: Row[];
  brokenOnly: boolean;
  tint: string;
}) {
  const ranked = rank(rows, brokenOnly);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint }}>
          {title}
        </h2>
        <span className="text-[11px] text-white/35">
          {ranked.length} {brokenOnly ? "past level" : "names"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013]">
            <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Spot</th>
              <th className="px-3 py-2 text-right font-medium">Dist %</th>
              <th className="px-3 py-2 text-right font-medium">Cover</th>
              <th className="px-3 py-2 text-right font-medium">Write</th>
              <th className="px-3 py-2 text-right font-medium">SQ</th>
              <th className="px-3 py-2 text-right font-medium">₹ Cr</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[12px] text-white/30">
                  {brokenOnly
                    ? "No name has taken the prior-day level yet at this cut."
                    : "No rows in this cut."}
                </td>
              </tr>
            )}
            {ranked.map((r, i) => {
              const oneLegged = !r.c;
              return (
                <tr
                  key={r.s}
                  className="border-t border-white/[0.05] hover:bg-white/[0.03]"
                  style={oneLegged ? { opacity: 0.55 } : undefined}
                >
                  <td className="px-3 py-1.5 tabular-nums text-white/30">{i + 1}</td>
                  <td className="px-3 py-1.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {r.s}
                      {r.brk && (
                        <span
                          className="rounded-sm px-1 text-[9px] font-semibold tracking-wide"
                          style={{ background: `${tint}22`, color: tint }}
                        >
                          BRK
                        </span>
                      )}
                      {oneLegged && (
                        <span
                          className="rounded-sm bg-white/[0.06] px-1 text-[9px] tracking-wide text-white/40"
                          title="No cover leg — one-sided writing. This shape topped the boards on the sessions that failed."
                        >
                          1-LEG
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white/70">
                    {fmt(r.sp, 1)}
                  </td>
                  <td
                    className="px-3 py-1.5 text-right font-semibold tabular-nums"
                    style={{ color: (r.d ?? 0) > 0 ? tint : "rgba(255,255,255,0.35)" }}
                  >
                    {r.d === null || r.d === undefined ? "--" : `${r.d > 0 ? "+" : ""}${r.d.toFixed(2)}`}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white/55">{fmt(r.c)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white/55">{fmt(r.w)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white/80">
                    {r.sq?.toFixed(3)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white/40">{fmt(r.cr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function OcelotClient({ snaps }: { snaps: Snap[] }) {
  const cuts = useMemo(() => {
    const seen = new Map<string, Snap>();
    for (const s of snaps) {
      const k = String(s.cut ?? s.time ?? "");
      if (k) seen.set(k, s);
    }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [snaps]);

  const [idx, setIdx] = useState<number | null>(null);
  const [brokenOnly, setBrokenOnly] = useState(true);

  // Default to the newest cut, but don't pin it: once the user scrubs back the
  // selection must stay put even as auto-refresh appends new cuts.
  const active = idx === null ? cuts.length - 1 : Math.min(idx, cuts.length - 1);
  const snap = cuts[active]?.[1];

  if (cuts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[14px] text-white/60">No cuts published for this date yet.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/35">
            OCELOT captures every 5 minutes from 09:15 to 15:40. Before the first cut of a
            session there is nothing to show.
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
            className="h-1 w-56 cursor-pointer appearance-none rounded-full bg-white/10 accent-orange-500"
            aria-label="Select capture cut"
          />
          <span
            className="min-w-[52px] font-mono text-[13px] font-semibold tabular-nums"
            style={{ color: ACCENT }}
          >
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

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-white/55">
          <input
            type="checkbox"
            checked={brokenOnly}
            onChange={(e) => setBrokenOnly(e.target.checked)}
            className="accent-orange-500"
          />
          Only names past the prior-day level
        </label>

        <span className="text-[11px] text-white/30">
          {snap?.nq ?? "--"} of {snap?.n ?? "--"} above ₹50 Cr
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <Board title="BULL · CALL SIDE" rows={snap?.bull ?? []} brokenOnly={brokenOnly} tint="#22c55e" />
        <Board title="BEAR · PUT SIDE" rows={snap?.bear ?? []} brokenOnly={brokenOnly} tint="#ef4444" />
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-white/25">
        Ranked by distance past the prior-day level, not by SQ — on the confirmed winners
        distance ranked 9 of 10 inside the top five where SQ managed 7. Cover = options
        bought back behind price; write = options sold behind price. Rows marked 1-LEG have
        no cover leg.
      </p>
    </div>
  );
}
