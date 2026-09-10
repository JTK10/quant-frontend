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
  rd: number | null;         // ROLLING depth past that level, live every cut
  brk: string | null;        // cut the body break happened
  dp: number | null;         // break depth %, frozen at the break cut
  w: number | null;          // OI written into the move %, frozen at the break cut
  sig: string | null;        // MILD / GOOD / STRONG
  mv: number | null;         // %move from prior close, live every cut
  sp: number | null;         // spot
  cr: number | null;         // notional, Rs crore
  tgt: number | null;        // next strike building OI since 09:15
  tgt_pct: number | null;    // room to it, % from spot
  ob: boolean | null;        // morning order-block base, 09:15-10:00 pivot
  act?: number | null;       // % of this name's strikes whose OI moved today
  actrk?: number | null;     // that figure's percentile across the WHOLE universe
  net?: number | null;       // put build below spot minus call build above, cumulative
};

// The publisher sends two separate arrays. The board merges them into one list
// so both sides can be ranked against each other -- which side a row belongs to
// then has to travel WITH the row.
type MRow = Row & { side: Side };

type Snap = {
  cut?: string;
  time?: string;
  bull?: Row[];
  bear?: Row[];
  nb?: number;   // bear body breaks, before the publisher's miss cap
  nm?: number;   // bear near misses, before the cap
  nbb?: number;  // bull body breaks
  nmb?: number;  // bull near misses
  t0?: string | null;        // first cut the capture process handled today
  arm_last?: string | null;  // end of the arm window, from the service
  cov?: number | null;       // this cut's symbol coverage, 0-1
};

const ACCENT = "#2dd4bf";
const TINT: Record<Side, string> = { bull: "#22c55e", bear: "#ef4444" };

// The two sides do NOT share a gate. Bear: depth 0.5-1.5% AND written>5%.
// Bull: depth>0.8% and no OI condition at all -- on a PDH break every OI leg
// tested came back flat, so there is nothing to gate on. Not spelled out on
// the page (RK's call); it still drives depthColor and the Written column.
const GATE: Record<Side, { lo: number; hi: number | null; oi: boolean }> = {
  bear: { lo: 0.5, hi: 1.5, oi: true },
  bull: { lo: 0.8, hi: null, oi: false },
};

// The Armed / Near miss / All tabs were removed on request -- the board always
// shows the FULL list now. Armed is still visible per row: the accent bar, the
// row tint and the State column.

// OB = a same-side order block built by TODAY's 09:15-10:00 candles, with price
// clear of it. The pivot needs 10 bars to confirm, so nothing can be true
// before 10:05 -- a dash before then means "not decided yet", not "no".
type ObFilter = "ALL" | "OB";
type SideFilter = "ALL" | Side;

type SortKey = "w" | "dp" | "mv" | "tgt_pct" | "rd" | "act" | "net";

// A chain where almost no strike changes hands all day cannot be telling us
// anything. Measured over 9 sessions: in the bottom HALF of Act the correlation
// between any wall measure and the forward move is -0.003 -- noise. Above the
// 75th percentile it is +0.168. Keeping only actrk>75 took 724 names to 237 and
// the 60-min forward return from +0.013% to +0.141%, win 50% -> 55%.
const ACT_CUT = 75;

const fmtPct = (v: number | null | undefined, dp = 2, sign = false) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : `${sign && v > 0 ? "+" : ""}${v.toFixed(dp)}`;

function depthColor(v: number | null, side: Side) {
  if (v === null || v === undefined || Number.isNaN(v)) return "rgba(255,255,255,0.25)";
  const g = GATE[side];
  if (v <= g.lo) return "#f85149";
  if (g.hi !== null && v > g.hi) return "#f85149";
  return "#3fb950";
}

function SideChip({ side }: { side: Side }) {
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.06em]"
      style={{ background: `${TINT[side]}1f`, color: TINT[side] }}
    >
      {side === "bull" ? "BULL" : "BEAR"}
    </span>
  );
}

function ObCell({ v }: { v: boolean | null }) {
  if (v === null || v === undefined) return <span className="text-white/20">--</span>;
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide"
      style={
        v
          ? { background: "rgba(45,212,191,0.16)", color: "#2dd4bf" }
          : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }
      }
    >
      {v ? "OB" : "no"}
    </span>
  );
}

function Board({
  rows,
  obFilter,
  actOnly,
  sideFilter,
  sortBy,
  onSort,
}: {
  rows: MRow[];
  obFilter: ObFilter;
  actOnly: boolean;
  sideFilter: SideFilter;
  sortBy: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const ranked = useMemo(() => {
    let base = rows;
    if (sideFilter !== "ALL") base = base.filter((r) => r.side === sideFilter);
    if (obFilter === "OB") base = base.filter((r) => r.ob === true);
    if (actOnly) base = base.filter((r) => (r.actrk ?? 0) > ACT_CUT);
    return [...base].sort((a, b) => {
      if (a.st !== b.st) return a.st === "ARMED" ? -1 : 1;   // armed always first
      const av = a[sortBy];
      const bv = b[sortBy];
      // Both null subtracts to NaN and leaves the order implementation-defined,
      // which is common among the misses sorted by Tgt %. Compare explicitly.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv as number) - (av as number);
    });
  }, [rows, sortBy, obFilter, actOnly, sideFilter]);

  const SortTh = ({ k, label, title }: { k: SortKey; label: string; title?: string }) => (
    <th className="px-2 py-2 text-right font-medium">
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
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0 z-10 bg-[#101013]">
          <tr className="text-[9.5px] uppercase tracking-[0.08em] text-white/40">
            <th className="px-2 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Side</th>
            <th className="px-2 py-2 text-left font-medium">Symbol</th>
            <th className="px-2 py-2 text-right font-medium">Broke</th>
            <SortTh
              k="rd"
              label="RD"
              title="Rolling depth -- how far past the level the name is AT THIS CUT, recomputed every cut. Negative means it has slipped back inside. Depth beside it stays frozen at the break candle. This is the one column that is directly comparable across the two sides."
            />
            <SortTh k="dp" label="Depth" title="How far the break candle CLOSED through the level." />
            <SortTh
              k="w"
              label="Written"
              title="BEAR: put OI written INTO the fall at the 3 strikes below spot, vs the 09:15 open -- gate is >5%. BULL: call OI above spot vs the 09:15 open, shown for information only, it does NOT gate that side. Rows are dimmed where the number does not gate."
            />
            <SortTh k="tgt_pct" label="Tgt %" />
            <SortTh k="mv" label="Move %" />
            <SortTh
              k="act"
              label="Act"
              title="Share of this name's option strikes whose OI has actually moved today, shown as its percentile across all 210. Below the median the chain carries no signal at all; above 75 is where every OI measure we tested has its edge. A dead chain is a reason to skip the row, not to take the other side."
            />
            <SortTh
              k="net"
              label="Net"
              title="Put OI built BELOW spot minus call OI built ABOVE it, cumulative since 09:15. Positive = more support than resistance. Shown for observation only -- across 237 filtered names it measured FLAT (corr +0.004), so it gates nothing."
            />
            <th
              className="px-2 py-2 text-center font-medium"
              title="A same-side order block built by today's 09:15-10:00 candles, with price clear of it. The pivot needs 8 bars to confirm, so this cannot be true before 10:05."
            >
              OB
            </th>
            <th className="px-2 py-2 text-left font-medium">State</th>
          </tr>
        </thead>
        <tbody>
          {ranked.length === 0 && (
            <tr>
              <td colSpan={13} className="px-3 py-8 text-center text-[12px] text-white/30">
                {actOnly
                  ? "Nothing above the activity cut at this filter."
                  : obFilter === "OB"
                    ? "Nothing with an OB base at this cut."
                    : "No rows at this cut."}
              </td>
            </tr>
          )}
          {ranked.map((r, i) => {
            const on = r.st === "ARMED";
            const gate = GATE[r.side];
            const tint = TINT[r.side];
            return (
              <tr
                key={`${r.side}-${r.s}-${r.brk}`}
                className="border-t border-white/[0.05] hover:bg-white/[0.03]"
                style={on ? { background: `${ACCENT}12`, boxShadow: `inset 2px 0 0 ${tint}` } : undefined}
              >
                <td className="px-2 py-1.5 tabular-nums text-white/30">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <SideChip side={r.side} />
                </td>
                <td
                  className="px-2 py-1.5 font-medium"
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
                <td className="px-2 py-1.5 text-right tabular-nums text-white/45">{r.brk ?? "--"}</td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={{ color: r.rd == null ? undefined : r.rd < 0 ? "#8a8a93" : depthColor(r.rd, r.side) }}
                  title={r.lv == null ? undefined : `Level ${r.lv}`}
                >
                  {r.rd == null ? "--" : `${r.rd.toFixed(2)}%`}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={{ color: depthColor(r.dp, r.side) }}
                  title="Frozen at the break cut. This is the entry decision, not a running readout."
                >
                  {fmtPct(r.dp)}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={{
                    color: !gate.oi
                      ? "rgba(255,255,255,0.3)"
                      : on
                        ? "#3fb950"
                        : "rgba(255,255,255,0.4)",
                  }}
                  title={
                    gate.oi
                      ? undefined
                      : "Bull side has no working OI gate -- shown for information only."
                  }
                >
                  {fmtPct(r.w, 2, true)}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
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
                  className="px-2 py-1.5 text-right font-semibold tabular-nums"
                  style={{ color: (r.mv ?? 0) > 0 ? tint : "rgba(255,255,255,0.35)" }}
                  title="Move from prior close in this row's own favour. Live every cut."
                >
                  {fmtPct(r.mv, 2, true)}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums"
                  style={{
                    color:
                      r.act == null
                        ? "rgba(255,255,255,0.25)"
                        : (r.actrk ?? 0) > ACT_CUT
                          ? "#3fb950"
                          : (r.actrk ?? 0) < 50
                            ? "#f85149"
                            : "rgba(255,255,255,0.55)",
                  }}
                  title={
                    r.act == null
                      ? "No baseline yet -- needs a second cut."
                      : `${r.act.toFixed(1)}% of strikes have traded today, ${r.actrk ?? "--"}th percentile of the universe.`
                  }
                >
                  {r.act == null ? "--" : (r.actrk ?? "--")}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums text-white/50"
                  title="Support built below spot minus resistance built above, since 09:15. Observation only."
                >
                  {fmtPct(r.net, 1, true)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <ObCell v={r.ob} />
                </td>
                <td
                  className="px-2 py-1.5 text-[10.5px]"
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
  const [obFilter, setObFilter] = useState<ObFilter>("ALL");
  const [actOnly, setActOnly] = useState(false);
  const [sideFilter, setSideFilter] = useState<SideFilter>("ALL");
  // RD is the default now the two sides share a table: it is the only column
  // that means the same thing on both, so the opening order is honest. Written
  // used to be the default and does not gate the bull rows at all.
  const [sortBy, setSortBy] = useState<SortKey>("rd");

  const active = idx === null ? cuts.length - 1 : Math.min(idx, cuts.length - 1);
  const snap = cuts[active]?.[1];

  const merged = useMemo<MRow[]>(() => {
    const bull = (snap?.bull ?? []).map((r) => ({ ...r, side: "bull" as Side }));
    const bear = (snap?.bear ?? []).map((r) => ({ ...r, side: "bear" as Side }));
    return [...bull, ...bear];
  }, [snap]);

  const nArmed = merged.filter((r) => r.st === "ARMED");
  const nBreaks = (snap?.nbb ?? (snap?.bull ?? []).length) + (snap?.nb ?? (snap?.bear ?? []).length);

  if (cuts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[14px] text-white/60">No cuts published for this date yet.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-white/35">
            NEOFELIS arms between 09:20 and 09:50. Membership freezes after that --
            the board cannot gain a name later in the session.
          </p>
        </div>
      </div>
    );
  }

  const Chip = ({ v, label, title }: { v: SideFilter; label: string; title: string }) => (
    <button
      onClick={() => setSideFilter(v)}
      className="rounded-md border px-2 py-0.5 transition"
      title={title}
      style={
        sideFilter === v
          ? {
              borderColor: v === "ALL" ? ACCENT : TINT[v],
              color: v === "ALL" ? ACCENT : TINT[v],
              background: `${v === "ALL" ? ACCENT : TINT[v]}18`,
            }
          : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }
      }
    >
      {label}
    </button>
  );

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

        <span className="text-[11px] tabular-nums text-white/45">
          {nBreaks} breaks → <span style={{ color: ACCENT }}>{nArmed.length} armed</span>
          <span className="text-white/25">
            {" "}({nArmed.filter((r) => r.side === "bull").length} bull /{" "}
            {nArmed.filter((r) => r.side === "bear").length} bear)
          </span>
        </span>

        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-white/45">
          <Chip v="ALL" label="Both" title="Show both sides in one ranked list." />
          <Chip v="bull" label="Bull" title="PDH breaks only." />
          <Chip v="bear" label="Bear" title="PDL breaks only." />
          <span className="mx-1 h-3 w-px bg-white/10" />
          <button
            onClick={() => setObFilter(obFilter === "OB" ? "ALL" : "OB")}
            className="rounded-md border px-2 py-0.5 transition"
            title="Show only names with a morning order-block base (09:15-10:00 pivot, price clear of it). Nothing qualifies before 10:05."
            style={
              obFilter === "OB"
                ? { borderColor: ACCENT, color: ACCENT, background: `${ACCENT}18` }
                : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }
            }
          >
            OB only
          </button>
          <button
            onClick={() => setActOnly(!actOnly)}
            className="rounded-md border px-2 py-0.5 transition"
            title={`Keep only names whose chain is genuinely trading -- activity above the ${ACT_CUT}th percentile of the universe. Below the median, no OI measure we have tested has any relationship to the forward move.`}
            style={
              actOnly
                ? { borderColor: ACCENT, color: ACCENT, background: `${ACCENT}18` }
                : { borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }
            }
          >
            Active only
          </button>
        </span>
      </div>

      {(() => {
        // An empty board after a late start looks exactly like a quiet session.
        // The service publishes the first cut it handled today so the page can
        // tell those apart instead of rendering a confident blank.
        const t0 = snap?.t0;
        const armLast = snap?.arm_last ?? "09:50";
        const cov = snap?.cov;
        const missedAll = !!t0 && t0 > armLast;
        const missedPart = !!t0 && !missedAll && t0 > "09:20";
        const thin = typeof cov === "number" && cov < 0.98;
        if (!missedAll && !missedPart && !thin) return null;
        return (
          <div
            className="rounded-md px-3 py-2 text-[11.5px] leading-relaxed"
            style={{
              background: missedAll ? "rgba(248,81,73,0.10)" : "rgba(210,153,34,0.10)",
              border: `1px solid ${missedAll ? "#f85149" : "#d29922"}55`,
              color: missedAll ? "#f85149" : "#d29922",
            }}
          >
            {missedAll && (
              <>Capture started at {t0}, after the {armLast} arm window closed. No name
              could arm today &mdash; an empty board here means the window was missed,
              not that nothing qualified.</>
            )}
            {missedPart && (
              <>Capture started at {t0}, inside the 09:20&ndash;{armLast} arm window.
              Names that broke before {t0} could not be seen, so this board is
              incomplete.</>
            )}
            {thin && (
              <>{missedAll || missedPart ? " " : ""}Coverage at this cut is{" "}
              {Math.round((cov as number) * 100)}% of the universe &mdash; names missing
              from the feed are absent from the board and from the break counts.</>
            )}
          </div>
        );
      })()}

      <Board
        rows={merged}
        obFilter={obFilter}
        actOnly={actOnly}
        sideFilter={sideFilter}
        sortBy={sortBy}
        onSort={setSortBy}
      />
    </div>
  );
}
