"use client";

import { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

type State = "ARMED" | "MISS";
type Side = "bull" | "bear";

type Row = {
  s: string;                 // symbol
  st: State;
  why: string | null;        // reject reason, MISS only
  lv: number | null;         // prior-day low (bear) / high (bull)
  brk: string | null;        // cut the body break happened
  dp: number | null;         // break depth %, frozen at the break cut
  w: number | null;          // OI written into the move %, frozen at the break cut
  sig: string | null;        // MILD / GOOD / STRONG
  mv: number | null;         // %move from prior close, live every cut
  sp: number | null;         // spot
  cr: number | null;         // notional, Rs crore
  tgt: number | null;        // next strike building OI since 09:15
  tgt_pct: number | null;    // room to it, % from spot
};

type Snap = {
  cut?: string;
  time?: string;
  bull?: Row[];
  bear?: Row[];
  nb?: number;   // bear body breaks, before the publisher's miss cap
  nm?: number;   // bear near misses, before the cap
  nbb?: number;  // bull body breaks
  nmb?: number;  // bull near misses
};

const ACCENT = "#2dd4bf";

// The two sides do NOT share a gate, and the UI has to say so or the board
// lies about itself. Bear: depth 0.5-1.5% AND written>5%. Bull: depth>0.8%
// and no OI condition at all -- on a PDH break every OI leg tested came back
// flat, so there is nothing to gate on.
const GATE: Record<Side, { lo: number; hi: number | null; oi: boolean; note: string }> = {
  bear: {
    lo: 0.5,
    hi: 1.5,
    oi: true,
    note: "depth 0.5-1.5% AND put OI written below spot >5%",
  },
  bull: {
    lo: 0.8,
    hi: null,
    oi: false,
    note: "depth >0.8% only -- no OI gate, every leg tested was flat",
  },
};

type Tab = "ARMED" | "MISS" | "ALL";
const TABS: Tab[] = ["ARMED", "MISS", "ALL"];
const TAB_LABEL: Record<Tab, string> = { ARMED: "Armed", MISS: "Near miss", ALL: "All" };

type SortKey = "w" | "dp" | "mv" | "tgt_pct";

const fmtPct = (v: number | null | undefined, dp = 2, sign = false) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : `${sign && v > 0 ? "+" : ""}${v.toFixed(dp)}`;

const fmtNum = (v: number | null | undefined, dp = 2) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function depthColor(v: number | null, side: Side) {
  if (v === null || v === undefined || Number.isNaN(v)) return "rgba(255,255,255,0.25)";
  const g = GATE[side];
  if (v <= g.lo) return "#f85149";
  if (g.hi !== null && v > g.hi) return "#f85149";
  return "#3fb950";
}

function Board({
  side,
  rows,
  nBreaks,
  nMiss,
  tint,
  tab,
  sortBy,
  onSort,
}: {
  side: Side;
  rows: Row[];
  nBreaks: number;
  nMiss: number;
  tint: string;
  tab: Tab;
  sortBy: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const armed = rows.filter((r) => r.st === "ARMED");
  const miss = rows.filter((r) => r.st !== "ARMED");
  const gate = GATE[side];

  const ranked = useMemo(() => {
    const base = tab === "ARMED" ? armed : tab === "MISS" ? miss : rows;
    // Sorting the bull board by Written would rank it on a column that does
    // not gate it, so fall back to Depth there unless the user picks another.
    const key: SortKey = sortBy === "w" && !gate.oi ? "dp" : sortBy;
    return [...base].sort((a, b) => {
      if (tab === "ALL" && a.st !== b.st) return a.st === "ARMED" ? -1 : 1;
      return ((b[key] ?? -Infinity) as number) - ((a[key] ?? -Infinity) as number);
    });
  }, [rows, armed, miss, tab, sortBy, gate.oi]);

  const SortTh = ({ k, label, title }: { k: SortKey; label: string; title?: string }) => (
    <th className="px-2.5 py-2 text-right font-medium">
      <button
        onClick={() => onSort(k)}
        className="inline-flex items-center gap-1 uppercase tracking-[0.08em] transition hover:text-white"
        style={{ color: sortBy === k ? ACCENT : undefined }}
        title={title ?? `Sort by ${label}`}
      >
        {label}
        <span style={{ opacity: sortBy === k ? 1 : 0.25 }}>▼</span>
      </button>
    </th>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint }}>
          {side === "bear" ? "BEAR · PDL BODY BREAK" : "BULL · PDH BODY BREAK"}
        </h2>
        <span className="text-[11px] tabular-nums text-white/45">
          {nBreaks} breaks → <span style={{ color: ACCENT }}>{armed.length} armed</span>
        </span>
        {side === "bull" && (
          <span
            className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
            style={{ background: "#d2992222", color: "#d29922" }}
            title="19 of the 31 research names came from a single session (3-Sep). Watch it, do not size it."
          >
            OBSERVATION ONLY
          </span>
        )}
        <span className="text-[10px] text-white/25">{gate.note}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[#101013]">
            <tr className="text-[9.5px] uppercase tracking-[0.08em] text-white/40">
              <th className="px-2.5 py-2 text-left font-medium">#</th>
              <th className="px-2.5 py-2 text-left font-medium">Symbol</th>
              <th className="px-2.5 py-2 text-right font-medium">Broke</th>
              <th className="px-2.5 py-2 text-right font-medium">Level</th>
              <SortTh k="dp" label="Depth" title="How far the break candle CLOSED through the level." />
              <SortTh
                k="w"
                label="Written"
                title={
                  gate.oi
                    ? "Put OI written INTO the fall at the 3 strikes below spot, vs the 09:15 open. Gate is >5%."
                    : "Call OI above spot vs the 09:15 open. Shown for information -- it does NOT gate this board."
                }
              />
              <SortTh k="tgt_pct" label="Tgt %" />
              <SortTh k="mv" label="Move %" />
              <th className="px-2.5 py-2 text-left font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-[12px] text-white/30">
                  {tab === "ARMED" ? "Nothing armed at this cut." : "No rows at this cut."}
                </td>
              </tr>
            )}
            {ranked.map((r, i) => {
              const on = r.st === "ARMED";
              return (
                <tr
                  key={`${r.s}-${r.brk}`}
                  className="border-t border-white/[0.05] hover:bg-white/[0.03]"
                  style={on ? { background: `${ACCENT}12`, boxShadow: `inset 2px 0 0 ${ACCENT}` } : undefined}
                >
                  <td className="px-2.5 py-1.5 tabular-nums text-white/30">{i + 1}</td>
                  <td
                    className="px-2.5 py-1.5 font-medium"
                    style={{ color: on ? "#fff" : "rgba(255,255,255,0.55)" }}
                  >
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
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-white/45">{r.brk ?? "--"}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-white/60">{fmtNum(r.lv, 2)}</td>
                  <td
                    className="px-2.5 py-1.5 text-right tabular-nums"
                    style={{ color: on ? depthColor(r.dp, side) : "rgba(255,255,255,0.4)" }}
                    title="Frozen at the break cut. This is the entry decision, not a running readout."
                  >
                    {fmtPct(r.dp)}
                  </td>
                  <td
                    className="px-2.5 py-1.5 text-right tabular-nums"
                    style={{
                      color: !gate.oi
                        ? "rgba(255,255,255,0.3)"
                        : on
                          ? "#3fb950"
                          : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {fmtPct(r.w, 2, true)}
                  </td>
                  <td
                    className="px-2.5 py-1.5 text-right tabular-nums"
                    style={{
                      color:
                        r.tgt_pct === null || r.tgt_pct === undefined
                          ? "rgba(255,255,255,0.25)"
                          : r.tgt_pct >= 1.5
                            ? "#22c55e"
                            : r.tgt_pct <= 0.5
                              ? "#ef4444"
                              : "rgba(255,255,255,0.75)",
                    }}
                    title={
                      r.tgt === null || r.tgt === undefined
                        ? "No readable target"
                        : `Next strike building OI since 09:15: ${r.tgt}. This is the room before price meets it.`
                    }
                  >
                    {r.tgt_pct === null || r.tgt_pct === undefined ? "--" : `${r.tgt_pct.toFixed(2)}%`}
                  </td>
                  <td
                    className="px-2.5 py-1.5 text-right font-semibold tabular-nums"
                    style={{ color: (r.mv ?? 0) > 0 ? tint : "rgba(255,255,255,0.35)" }}
                    title="Move from prior close in this board's favour. Live every cut."
                  >
                    {fmtPct(r.mv, 2, true)}
                  </td>
                  <td
                    className="px-2.5 py-1.5 text-[10.5px]"
                    style={{ color: on ? ACCENT : "rgba(255,255,255,0.35)" }}
                  >
                    {on ? `armed ${r.brk ?? ""}` : (r.why ?? "miss")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tab !== "ARMED" && nMiss > miss.length && (
        <p className="px-1 pt-1 text-[10px] text-white/25">
          near misses capped at {miss.length} of {nMiss}, ranked by {gate.oi ? "written" : "depth"}
        </p>
      )}
    </div>
  );
}

export default function NeofelisClient({ snaps }: { snaps: Snap[] }) {
  const cuts = useMemo(() => {
    const seen = new Map<string, Snap>();
    for (const s of snaps) {
      const k = String(s.cut ?? s.time ?? "");
      if (k) seen.set(k, s);
    }
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [snaps]);

  const [idx, setIdx] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("ARMED");
  const [sortBy, setSortBy] = useState<SortKey>("w");

  const active = idx === null ? cuts.length - 1 : Math.min(idx, cuts.length - 1);
  const snap = cuts[active]?.[1];
  const bear = snap?.bear ?? [];
  const bull = snap?.bull ?? [];

  if (cuts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[14px] text-white/60">No cuts published for this date yet.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/35">
            NEOFELIS arms between 09:20 and 09:50. Membership freezes after that --
            neither board can gain a name later in the session.
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

        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/45">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-md border px-2 py-0.5 transition"
              style={
                tab === t
                  ? { borderColor: ACCENT, color: ACCENT, background: `${ACCENT}18` }
                  : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }
              }
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <Board
          side="bull"
          rows={bull}
          nBreaks={snap?.nbb ?? bull.length}
          nMiss={snap?.nmb ?? bull.filter((r) => r.st !== "ARMED").length}
          tint="#22c55e"
          tab={tab}
          sortBy={sortBy}
          onSort={setSortBy}
        />
        <Board
          side="bear"
          rows={bear}
          nBreaks={snap?.nb ?? bear.length}
          nMiss={snap?.nm ?? bear.filter((r) => r.st !== "ARMED").length}
          tint="#ef4444"
          tab={tab}
          sortBy={sortBy}
          onSort={setSortBy}
        />
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-white/25">
        A name arms when a 5-min candle CLOSES through its prior-day level between 09:20 and 09:50.
        Membership FREEZES after 09:50: Depth and Written stay at their break-cut values because they
        are the entry decision, while Move % and Tgt % keep updating every cut. The two sides do not
        share a gate. BEAR needs depth 0.5-1.5% and put OI below spot up more than 5% -- 50% reach
        1.5%, 36% cleanly, over 6 sessions and n=14. BULL has no working OI leg (all four tested
        flat) so it gates on depth alone above 0.8% -- 39% reach against a 22% baseline, but 19 of
        its 31 names came from one session, which is why it is marked observation only. Near miss
        shows what the gates threw out and why: on the bear side a shallow break with strong writing
        is the worst cell on the board, not a close call. Forward test, not a settled edge.
      </p>
    </div>
  );
}
