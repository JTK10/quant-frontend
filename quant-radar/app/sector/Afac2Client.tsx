"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";
import SectorBarChart from "./SectorBarChart";

const ACCENT = "#fce205";
const GLASS_POS = "rgba(0, 34, 23, 0.45)";
const GLASS_NEG = "rgba(34, 9, 0, 0.45)";
const GLASS_NEU = "rgba(20, 20, 24, 0.45)";
const GREEN = "#26a69a";
const RED = "#ef5350";

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

  const [secFilter, setSecFilter] = useState<string | null>(null);

  // group leaderboard rows into EVERY sector they belong to (multi-membership)
  const cards = useMemo(() => {
    const bySec = new Map<string, any[]>();
    for (const r of rows) {
      const tags: string[] = Array.isArray(r.secs) && r.secs.length ? r.secs : ["OTHER"];
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

  const shownCards = secFilter ? cards.filter((c) => c.sec === secFilter) : cards;

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6" style={{ background: "#000" }}>
      <div className="my-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
          AS OF {String(latest?.time || "--:--").slice(0, 5)} IST
        </span>
        <span className="font-mono text-[10px] tracking-[0.14em] text-[#4b5563]">
          Bar = signed net sector strength. Card score = AFAC.2 &quot;safest mover&quot; quality (always rises). Entries remain SERVAL&apos;s job.
        </span>
      </div>

      {cards.length === 0 ? (
        <div className="mt-16 text-center font-mono text-xs text-[#6b7280]">
          No AFAC.2 data for this date — snapshots publish every 5 min from ~09:45 IST.
        </div>
      ) : (
        <>
          <SectorBarChart
            sectors={sectors.map((s) => ({ sec: s.sec, net: num(s.net) ?? 0, n: s.n }))}
            onSelect={setSecFilter}
            selected={secFilter}
          />

          {secFilter && (
            <div className="mt-3 flex items-center gap-2">
              <span className="font-mono text-[11px] tracking-[0.18em] text-white">
                {secFilter.replace(/^NIFTY_/, "").replace(/_/g, " ")}
              </span>
              <button
                type="button"
                onClick={() => setSecFilter(null)}
                className="rounded border border-[#ffffff20] px-2 py-0.5 font-mono text-[9px] text-[#9ca3af] hover:text-white"
              >
                CLEAR
              </button>
            </div>
          )}

          {/* glass sector cards, 2-col like tradefinder detail view */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {shownCards.map((card) => {
              const upFrac = card.n > 0 ? card.long_n / card.n : 0.5;
              const glass = upFrac >= 0.6 ? GLASS_POS : upFrac <= 0.4 ? GLASS_NEG : GLASS_NEU;
              const upN = card.long_n;
              const dnN = card.n - card.long_n;
              return (
                <div
                  key={card.sec}
                  className="max-h-[70vh] overflow-y-auto px-4 pb-3 pt-3"
                  style={{
                    background: glass,
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 12,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
                  }}
                >
                  {/* header: sector + net score + breadth */}
                  <div className="sticky top-0 z-10 -mx-4 -mt-3 mb-1 px-4 pt-3" style={{ background: glass, backdropFilter: "blur(10px)" }}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold tracking-wide text-white" style={{ fontSize: 15 }}>
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
                    <div className="mb-2 font-mono text-[10px] text-[#9ca3af]">
                      <span style={{ color: GREEN }}>
                        {upN} stocks ({fmt((upN / Math.max(card.n, 1)) * 100, 0)}% Up)
                      </span>
                      <span className="mx-2 text-[#4b5563]">|</span>
                      <span style={{ color: RED }}>
                        {dnN} stocks ({fmt((dnN / Math.max(card.n, 1)) * 100, 0)}% Down)
                      </span>
                    </div>
                  </div>

                  {/* stock rows -- ALL gated stocks in this sector */}
                  <table className="w-full border-separate" style={{ borderSpacing: "0 4px" }}>
                    <thead>
                      <tr>
                        {["SYMBOL", "CHG %", "AFAC.2", "Δ15M", "SIGNAL"].map((h, hi) => (
                          <th
                            key={h}
                            className={`font-mono text-[9px] tracking-[0.16em] text-[#6b7280] ${hi === 0 ? "text-left" : "text-right"}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {card.stocks.map((r: any) => {
                        const long = r.side === "LONG";
                        const delta = prevScores.has(r.n) ? (num(r.score) ?? 0) - (prevScores.get(r.n) ?? 0) : null;
                        return (
                          <tr key={r.n}>
                            <td>
                              <a
                                href={buildTradingViewUrl(r.n, r.n)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block rounded-full px-3 py-1 font-bold transition-transform hover:scale-[1.03]"
                                style={{
                                  fontSize: 13,
                                  background: long ? "rgb(185,227,168)" : "rgb(251,168,168)",
                                  color: "#111",
                                }}
                              >
                                {r.n}
                              </a>
                            </td>
                            <td className="text-right font-mono text-xs" style={{ color: (num(r.chg) ?? 0) >= 0 ? GREEN : RED }}>
                              {(num(r.chg) ?? 0) >= 0 ? "+" : ""}
                              {fmt(r.chg, 2)}
                            </td>
                            <td className="text-right font-mono text-sm font-bold" style={{ color: ACCENT }}>
                              {fmt(r.score, 0)}
                            </td>
                            <td className="text-right font-mono text-[11px]" style={{ color: delta && delta > 0 ? GREEN : "#6b7280" }}>
                              {delta === null ? "—" : `+${fmt(delta, 0)}`}
                            </td>
                            <td className="text-right">
                              <span
                                className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em]"
                                style={{
                                  color: long ? GREEN : RED,
                                  border: `1px solid ${long ? GREEN : RED}55`,
                                  background: `${long ? GREEN : RED}14`,
                                }}
                              >
                                {long ? "LONG ▲" : "SHORT ▼"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
