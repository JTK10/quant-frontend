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
  const ordered = useMemo(
    () =>
      [...snaps].sort((a, b) => {
        const ta = Number(a?.ts) || 0;
        const tb = Number(b?.ts) || 0;
        if (ta !== tb) return ta - tb;
        return String(a?.cut ?? "").localeCompare(String(b?.cut ?? ""));
      }),
    [snaps]
  );
  const latest = ordered.length ? ordered[ordered.length - 1] : null;
  const rows: any[] = latest?.rows || [];

  // The persistence trail: for every name that ever reached the leaderboard,
  // its top-3 count at each published cut. This is what makes LYNX different
  // from a snapshot scanner -- a name that keeps reappearing is the signal --
  // so it gets its own strip rather than being buried in a tooltip.
  const trail = useMemo(() => {
    const names = new Set<string>();
    ordered.forEach((s) => (s.rows || []).forEach((r: any) => names.add(r.sym)));
    return Array.from(names).map((sym) => ({
      sym,
      side: ordered.flatMap((s) => s.rows || []).find((r: any) => r.sym === sym)?.side,
      series: ordered.map((s) => {
        const hit = (s.rows || []).find((r: any) => r.sym === sym);
        return { cut: s.cut, n: hit ? num(hit.n_top3) ?? 0 : null };
      }),
    }));
  }, [ordered]);

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

      {/* ---- persistence trail ------------------------------------------ */}
      <div className="mt-5">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-500">
          Rank persistence — top-3 count by cut
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/10" style={{ background: GLASS }}>
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr style={{ background: HEAD_BG, color: HEAD_FG }}>
                <th className="sticky left-0 px-2 py-1.5 text-left" style={{ background: HEAD_BG }}>
                  NAME
                </th>
                {ordered.map((s) => {
                  const scoring =
                    typeof s.scoring === "boolean"
                      ? s.scoring
                      : s.cut >= SCORE_FROM && s.cut <= SCORE_TO;
                  return (
                    <th
                      key={s.cut}
                      className="px-1.5 py-1.5 text-center font-normal"
                      style={{ color: scoring ? HEAD_FG : "rgb(90,90,98)" }}
                    >
                      {String(s.cut).slice(-5)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {trail.map((t) => (
                <tr key={t.sym} className="border-t border-white/5">
                  <td
                    className="sticky left-0 px-2 py-1.5 font-medium"
                    style={{ background: t.side === "LONG" ? LONG_BG : SHORT_BG }}
                  >
                    <a
                      href={buildTradingViewUrl(t.sym)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: ACCENT }}
                    >
                      {t.sym}
                    </a>
                  </td>
                  {t.series.map((p, i) => (
                    <td key={i} className="px-1.5 py-1.5 text-center">
                      {p.n === null ? (
                        <span className="text-zinc-700">·</span>
                      ) : (
                        <span style={{ color: ACCENT }}>{p.n}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
