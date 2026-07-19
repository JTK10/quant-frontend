"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";
import SectorBarChart from "./SectorBarChart";

const ACCENT = "#fce205";
const GLASS_POS = "rgba(0, 34, 23, 0.45)";
const GLASS_NEG = "rgba(34, 9, 0, 0.45)";
const GLASS_NEU = "rgba(20, 20, 24, 0.45)";
// exact tokens read off tradefinder.in/sector-scope
const PILL_GREEN_BG = "rgb(185, 227, 168)";
const PILL_GREEN_FG = "rgb(70, 100, 46)";
const PILL_RED_BG = "rgb(251, 168, 168)";
const PILL_RED_FG = "rgb(179, 21, 12)";
const HEAD_BG = "rgb(39, 39, 42)";
const HEAD_FG = "rgb(161, 161, 170)";

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 1): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}

export default function Afac2Client({ snaps }: { snaps: any[] }) {
  const ordered = useMemo(
    () => [...snaps].sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))),
    [snaps]
  );
  const latest = ordered.length ? ordered[ordered.length - 1] : null;
  const rows: any[] = latest?.rows || [];
  const sectors: any[] = latest?.sectors || [];

  const prevScores = useMemo(() => {
    const m = new Map<string, number>();
    if (ordered.length >= 4) {
      const prev = ordered[ordered.length - 4]; // ~15 min back
      for (const r of prev?.rows || []) m.set(r.n, num(r.score) ?? 0);
    }
    return m;
  }, [ordered]);

  // "selected" is only ever used to briefly highlight the clicked bar/card and
  // to scroll to it -- it never hides other sectors, every card always shows.
  const [selected, setSelected] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSelect = useCallback((sec: string | null) => {
    if (!sec) return;
    setSelected(sec);
    cardRefs.current.get(sec)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSelected(null), 1600);
  }, []);

  // group leaderboard rows into EVERY sector they belong to (multi-membership)
  const cards = useMemo(() => {
    const bySec = new Map<string, any[]>();
    for (const r of rows) {
      const tags: string[] = Array.isArray(r.secs)
        ? r.secs.length
          ? r.secs
          : ["OTHER"]
        : typeof r.secs === "string" && r.secs
        ? [r.secs]
        : ["OTHER"];
      for (const s of tags) {
        if (!bySec.has(s)) bySec.set(s, []);
        bySec.get(s)!.push(r);
      }
    }
    return sectors
      .filter((s) => bySec.has(s.sec))
      .map((s) => ({
        ...s,
        stocks: bySec.get(s.sec)!.sort((a, b) => (num(b.score) ?? 0) - (num(a.score) ?? 0)),
      }));
  }, [rows, sectors]);

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6" style={{ background: "#000" }}>
      {cards.length === 0 ? (
        <div className="mt-16 text-center font-mono text-xs text-[#6b7280]">
          No AFAC.2 data for this date — snapshots publish every 5 min from ~09:45 IST.
        </div>
      ) : (
        <>
          <div className="mt-3">
            <SectorBarChart
              sectors={sectors.map((s) => ({ sec: s.sec, net: num(s.net) ?? 0, n: s.n }))}
              onSelect={handleSelect}
              selected={selected}
            />
          </div>

          {/* glass sector cards, 2-col like tradefinder detail view -- ALWAYS all shown;
              clicking a bar above scrolls to + briefly highlights its card. */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {cards.map((card) => {
              const upFrac = card.n > 0 ? card.long_n / card.n : 0.5;
              const glass = upFrac >= 0.6 ? GLASS_POS : upFrac <= 0.4 ? GLASS_NEG : GLASS_NEU;
              const upN = card.long_n;
              const dnN = card.n - card.long_n;
              const upPct = card.n > 0 ? (upN / card.n) * 100 : 0;
              const dnPct = 100 - upPct;
              const isHighlighted = selected === card.sec;
              return (
                <div
                  key={card.sec}
                  ref={(el) => {
                    if (el) cardRefs.current.set(card.sec, el);
                    else cardRefs.current.delete(card.sec);
                  }}
                  className="overflow-hidden pb-2 transition-shadow duration-500"
                  style={{
                    background: glass,
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    border: isHighlighted ? `1px solid ${ACCENT}99` : "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 10,
                    boxShadow: isHighlighted
                      ? `0 0 0 3px ${ACCENT}33, 0 4px 24px rgba(0,0,0,0.35)`
                      : "0 4px 24px rgba(0,0,0,0.35)",
                    scrollMarginTop: 16,
                  }}
                >
                  {/* header: sector name (16px, regular weight, matches tradefinder) */}
                  <div className="flex items-center justify-between px-4 pt-3">
                    <span style={{ fontSize: 16, fontWeight: 400, color: "#fff" }}>
                      {String(card.sec).replace(/^NIFTY_/, "").replace(/_/g, " ")}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                      style={{ color: "#0A0A0B", background: ACCENT }}
                    >
                      {card.net >= 0 ? "+" : ""}
                      {fmt(card.net, 1)}
                    </span>
                  </div>

                  {/* gainer/loser proportion bar, mirrors tradefinder's slider gauge */}
                  <div className="px-4 pt-2">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#ffffff14" }}>
                      <div style={{ width: `${dnPct}%`, background: PILL_RED_FG }} />
                      <div style={{ width: `${upPct}%`, background: PILL_GREEN_FG }} />
                    </div>
                    <div className="mt-1 flex justify-between" style={{ fontSize: 10, fontWeight: 400, color: "#fff" }}>
                      <span>{dnN} stocks ({fmt(dnPct, 2)}% Down)</span>
                      <span>{upN} stocks ({fmt(upPct, 2)}% Up)</span>
                    </div>
                  </div>

                  {/* stock rows -- ALL gated stocks in this sector */}
                  <div className="mt-2 max-h-[60vh] overflow-y-auto">
                    <table className="w-full border-separate border-spacing-0">
                      <thead>
                        <tr>
                          {["Symbol", "", "Pre C", "%", "AFAC.2", "Signal"].map((h) => (
                            <th
                              key={h}
                              className="sticky top-0 z-10 text-left"
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: HEAD_FG,
                                background: HEAD_BG,
                                padding: "8px 10px",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {card.stocks.map((r: any) => {
                          const long = r.side === "LONG";
                          const chg = num(r.chg) ?? 0;
                          const delta = prevScores.has(r.n) ? (num(r.score) ?? 0) - (prevScores.get(r.n) ?? 0) : null;
                          return (
                            <tr key={r.n} className="transition-colors hover:bg-white/5">
                              <td style={{ padding: "7px 0 7px 10px" }}>
                                <a
                                  href={buildTradingViewUrl(r.n, r.n)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}
                                  className="hover:underline"
                                >
                                  {r.n}
                                </a>
                              </td>
                              <td />
                              <td style={{ fontSize: 15, fontWeight: 700, color: "#fff", padding: "7px 10px" }}>
                                {fmt(r.px, 2)}
                              </td>
                              <td style={{ padding: "7px 10px 7px 24px" }}>
                                <span
                                  className="inline-block rounded-full"
                                  style={{
                                    fontSize: 15,
                                    fontWeight: 700,
                                    padding: "7px 10px",
                                    borderRadius: 25,
                                    background: chg >= 0 ? PILL_GREEN_BG : PILL_RED_BG,
                                    color: chg >= 0 ? PILL_GREEN_FG : PILL_RED_FG,
                                  }}
                                >
                                  {chg >= 0 ? "+" : ""}
                                  {fmt(chg, 2)}
                                </span>
                              </td>
                              <td style={{ fontSize: 15, fontWeight: 700, color: "#fff", padding: "7px 10px" }}>
                                {fmt(r.score, 0)}
                                {delta !== null && delta > 0 && (
                                  <span className="ml-1 font-mono" style={{ fontSize: 10, fontWeight: 400, color: PILL_GREEN_FG }}>
                                    +{fmt(delta, 0)}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: "7px 10px" }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: long ? PILL_GREEN_FG : PILL_RED_FG }}>
                                  {long ? "▲" : "▼"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
