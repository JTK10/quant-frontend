"use client";

import React, { useMemo } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

const ACCENT = "#a78bfa";
const HEAD_BG = "rgb(39, 39, 42)";
const HEAD_FG = "rgb(161, 161, 170)";
const GLASS = "rgba(20, 20, 24, 0.45)";
const LONG_BG = "rgba(0, 34, 23, 0.45)";
const SHORT_BG = "rgba(34, 9, 0, 0.45)";
const PILL_G_BG = "rgb(185, 227, 168)";
const PILL_G_FG = "rgb(70, 100, 46)";
const PILL_R_BG = "rgb(251, 168, 168)";
const PILL_R_FG = "rgb(179, 21, 12)";

// LYNX only counts cuts inside this window toward selection. Later cuts are
// published so the desk can watch, but they must not move the pick -- extending
// the decision window to 11:30 measurably degraded the result (MFE/MAE 2.19 ->
// 1.65). The page marks the difference so a late leader is never mistaken for
// a selected one.
const SCORE_FROM = "09:45";
const SCORE_TO = "11:00";

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}
function sgn(v: any, d = 2): string {
  const n = num(v);
  return n === null ? "—" : (n >= 0 ? "+" : "") + n.toFixed(d);
}

export default function LynxClient({ snaps }: { snaps: any[] }) {
  // Sort on ts first: it is numeric and always set by the publisher, whereas a
  // missing `cut` silently degrades a string sort into a no-op that leaves the
  // docs in whatever order the API returned (newest-first from ORDS), which
  // then makes the LAST element the EARLIEST cut. That is exactly what happened
  // on 2026-08-16 -- the page showed the 09:45 snapshot as "latest" and drew the
  // persistence trail backwards. `cut` remains the tiebreak.
  //
  // Deduped by `cut`, newest ts winning. The ORDS handler upserts on cut, so a
  // republish of a session should not produce duplicates -- this is a guard,
  // not a fix for an observed bug. It matters because the failure mode is
  // silent and ugly: two docs for one cut draw that column twice, showing the
  // same name against two different counts for the same minute, and this sort
  // has already produced one subtle ordering bug (2026-08-16).
  const ordered = useMemo(() => {
    const best = new Map<string, any>();
    for (const s of snaps) {
      const k = String(s?.cut ?? "");
      const cur = best.get(k);
      if (!cur || (Number(s?.ts) || 0) >= (Number(cur?.ts) || 0)) best.set(k, s);
    }
    return Array.from(best.values()).sort((a, b) => {
      const ta = Number(a?.ts) || 0;
      const tb = Number(b?.ts) || 0;
      if (ta !== tb) return ta - tb;
      return String(a?.cut ?? "").localeCompare(String(b?.cut ?? ""));
    });
  }, [snaps]);
  const latest = ordered.length ? ordered[ordered.length - 1] : null;
  const rows: any[] = latest?.rows || [];

  // The gated shortlist, split in two. `pool` carries every name the gate has
  // admitted this session with its detail columns; `rows` (top 3 only) remains
  // the fallback for snapshots published before `pool` existed.
  //
  // RANKED vs EARLY is the split that matters, and it is not cosmetic.
  // Selection counts only cuts inside 09:45-11:00, so a name gated at 09:30
  // carries n_top3 = 0 -- it is NOT a pick. But it is the earliest evidence
  // available, roughly fifteen minutes before the first ranked board exists.
  // Listed together the early names read as failed picks, which is the
  // opposite of what they are.
  const pool = useMemo(() => {
    const src: any[] =
      (latest?.pool && latest.pool.length ? latest.pool : latest?.rows) || [];
    const all = src.map((r: any) => ({ ...r, n: num(r.n_top3) ?? 0 }));
    const byRank = (a: any, b: any) =>
      b.n - a.n ||
      (num(a.best_rank) ?? 99) - (num(b.best_rank) ?? 99) ||
      String(a.sym).localeCompare(String(b.sym));
    const byFirst = (a: any, b: any) =>
      String(a.first ?? "~").localeCompare(String(b.first ?? "~")) ||
      (num(a.rank) ?? 99) - (num(b.rank) ?? 99);
    return {
      ranked: all.filter((r) => r.n > 0).sort(byRank),
      early: all.filter((r) => r.n === 0).sort(byFirst),
    };
  }, [latest]);

  if (!latest) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        <div className="text-center">
          <div className="text-sm tracking-widest uppercase">No LYNX snapshots</div>
          <div className="mt-2 text-xs text-zinc-600">
            LYNX scans 09:30–11:30 IST. Selection window {SCORE_FROM}–{SCORE_TO}.
          </div>
        </div>
      </div>
    );
  }

  // Trust the publisher's own `scoring` flag rather than recomputing the window
  // from local constants. Two copies of the same rule in two repos only agree
  // until one changes -- and that implicit-sync assumption is exactly what
  // produced tonight's earlier bugs (the missing sig_date, the dropped
  // whitelist fields). The constants remain only as a fallback for docs
  // published before the flag existed.
  const inWindow =
    typeof latest.scoring === "boolean"
      ? latest.scoring
      : latest.cut >= SCORE_FROM && latest.cut <= SCORE_TO;

  return (
    <div className="h-full overflow-auto px-4 pb-10 pt-3">
      {latest.replay === true && (
        <div className="mb-3 rounded border border-amber-500/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          <span className="font-semibold">REPLAY</span> — this session was reconstructed
          from the futures master after the fact, not published live. The scoring, gate
          and persistence are the deployed ones and each cut saw only the bars that
          existed then, but the live Upstox fetch is not reproduced. Do not read this as
          a live track record.
        </div>
      )}

      {latest.stale && (
        <div className="mb-3 rounded border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          <span className="font-semibold">STALE CONFIG</span> — levels were built from
          session {latest.config_session}. LYNX is publishing but this is{" "}
          <span className="font-semibold">not actionable</span>.
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span className="rounded px-2 py-1" style={{ background: HEAD_BG, color: HEAD_FG }}>
          CUT <span className="text-white">{latest.cut}</span>
        </span>
        <span className="rounded px-2 py-1" style={{ background: HEAD_BG, color: HEAD_FG }}>
          UNIVERSE <span className="text-white">{latest.universe}</span>
        </span>
        <span className="rounded px-2 py-1" style={{ background: HEAD_BG, color: HEAD_FG }}>
          PAST PD LEVEL <span className="text-white">{latest.gated}</span>
        </span>
        <span
          className="rounded px-2 py-1"
          style={{
            background: inWindow ? "rgba(167,139,250,0.15)" : HEAD_BG,
            color: inWindow ? ACCENT : HEAD_FG,
          }}
        >
          {inWindow ? "SCORING" : `DISPLAY ONLY (window ${SCORE_FROM}–${SCORE_TO})`}
        </span>
        <span className="rounded px-2 py-1" style={{ background: HEAD_BG, color: HEAD_FG }}>
          LEVELS FROM <span className="text-white">{latest.config_session}</span>
        </span>
      </div>

      {/* A doc exists but no board yet. This is the normal state from 09:30
          until the first scoring cut at 09:45, and again on a quiet morning
          when nothing has travelled 1% past yesterday's extreme. Without a
          line here the page shows populated header chips above an empty grid,
          which on a first live morning reads as broken rather than as early. */}
      {rows.length === 0 && (
        <div className="rounded border border-white/10 bg-white/[0.02] px-3 py-6 text-center">
          <div className="text-xs text-zinc-400">No names past the PD gate yet</div>
          <div className="mt-1 text-[11px] text-zinc-600">
            The leaderboard builds from {SCORE_FROM}. Early in the session few names
            have travelled far enough beyond yesterday&apos;s high or low to be ranked.
          </div>
        </div>
      )}

      {/* ---- the leaderboard ------------------------------------------- */}
      <div className="grid gap-3 md:grid-cols-3">
        {rows.map((r: any, i: number) => {
          const isLong = r.side === "LONG";
          return (
            <a
              key={r.sym}
              href={buildTradingViewUrl(r.sym)}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg border border-white/10 p-3 transition hover:border-white/25"
              style={{ background: isLong ? LONG_BG : SHORT_BG }}
            >
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold" style={{ color: ACCENT }}>
                    #{i + 1}
                  </span>
                  <span className="text-lg font-semibold tracking-wide">{r.sym}</span>
                </div>
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-bold"
                  style={{
                    background: isLong ? PILL_G_BG : PILL_R_BG,
                    color: isLong ? PILL_G_FG : PILL_R_FG,
                  }}
                >
                  {r.side}
                </span>
              </div>

              <div className="mt-1 text-2xl font-light tabular-nums">{fmt(r.px, 2)}</div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <Stat label="TOP-3 HITS" value={`${r.n_top3}`} accent />
                <Stat label="MEAN RANK" value={fmt(r.mean_rank, 2)} />
                <Stat label="PAST PD" value={`${sgn(r.pd_dist, 2)}%`} accent />
                <Stat label="MOVE" value={`${sgn(r.mv, 2)}%`} />
                <Stat label="RVOL" value={fmt(r.rvol, 2)} />
                <Stat label="C3 × ATR" value={fmt(r.c3_x, 2)} />
                <Stat label="ATR3" value={`${fmt(r.atr3, 2)}%`} />
                <Stat label="CUTS SEEN" value={`${r.n_cuts ?? "—"}`} />
              </div>
            </a>
          );
        })}
      </div>

      {/* ---- the gated shortlist, with detail ------------------------- */}
      <PoolTable
        title={`Ranked — held a top-3 slot (${pool.ranked.length})`}
        rows={pool.ranked}
        showCount
      />
      <PoolTable
        title={`Early gate — cleared the level, not yet ranked (${pool.early.length})`}
        rows={pool.early}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="tabular-nums" style={accent ? { color: ACCENT } : undefined}>
        {value}
      </span>
    </div>
  );
}

function PoolTable({
  title,
  rows,
  showCount,
}: {
  title: string;
  rows: any[];
  showCount?: boolean;
}) {
  if (!rows.length) return null;
  // vol_ahead is the share of the 20-session hl2 volume profile sitting ahead
  // of price in the trade direction -- the same construction skeleton_scan
  // uses, so this is the number the rest of the stack means by "volume ahead".
  // Near zero is the interesting state: nothing left overhead to absorb a move.
  const ahead = (v: number | null) =>
    v === null ? "—" : `${(v * 100).toFixed(1)}%`;
  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
        {title}
      </div>
      <div
        className="overflow-x-auto rounded-lg border border-white/10"
        style={{ background: GLASS }}
      >
        <table className="w-full text-[11px] tabular-nums">
          <thead>
            <tr style={{ background: HEAD_BG, color: HEAD_FG }}>
              <th className="sticky left-0 px-2 py-1.5 text-left" style={{ background: HEAD_BG }}>
                NAME
              </th>
              {["SIDE", "PRICE", "MOVE%", "PAST PD%", "RVOL", "dPOC%", "AHEAD", "ATR3", "FIRST"].map(
                (h) => (
                  <th key={h} className="px-2 py-1.5 text-right font-normal">
                    {h}
                  </th>
                ),
              )}
              {showCount && <th className="px-2 py-1.5 text-right font-normal">TOP-3</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const va = num(r.vol_ahead);
              return (
                <tr
                  key={r.sym}
                  className="border-t border-white/5"
                  // a name that has fallen back inside the prior day's range is
                  // still listed -- it stopped qualifying, it did not stop
                  // mattering -- but it must not read as live
                  style={{ opacity: r.live === false ? 0.45 : 1 }}
                >
                  <td
                    className="sticky left-0 px-2 py-1.5 font-medium"
                    style={{ background: r.side === "LONG" ? LONG_BG : SHORT_BG }}
                  >
                    <a
                      href={buildTradingViewUrl(r.sym)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: ACCENT }}
                    >
                      {r.sym}
                    </a>
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{r.side}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(r.px, 2)}</td>
                  <td className="px-2 py-1.5 text-right" style={{ color: ACCENT }}>
                    {fmt(r.mv, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{fmt(r.pd_dist, 2)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(r.rvol, 2)}</td>
                  <td className="px-2 py-1.5 text-right">{sgn(r.dpoc, 2)}</td>
                  <td
                    className="px-2 py-1.5 text-right"
                    style={va !== null && va <= 0.1 ? { color: ACCENT } : undefined}
                  >
                    {ahead(va)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{fmt(r.atr3, 2)}</td>
                  <td className="px-2 py-1.5 text-right text-zinc-400">{r.first ?? "—"}</td>
                  {showCount && (
                    <td className="px-2 py-1.5 text-right" style={{ color: ACCENT }}>
                      {r.n}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
