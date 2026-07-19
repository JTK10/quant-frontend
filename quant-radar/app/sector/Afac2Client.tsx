"use client";

import React, { useMemo, useState } from "react";
import { buildTradingViewUrl } from "@/utils/backend";

const ACCENT = "#fce205";

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 1): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}

export default function Afac2Client({ snaps }: { snaps: any[] }) {
  // snapshots arrive one per 5-min cycle; use the latest, keep history for the trend
  const ordered = useMemo(
    () => [...snaps].sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))),
    [snaps]
  );
  const latest = ordered.length ? ordered[ordered.length - 1] : null;
  const rows: any[] = latest?.rows || [];
  const sectors: any[] = latest?.sectors || [];

  // score trend per stock across today's snapshots (for the Δ column)
  const prevScores = useMemo(() => {
    const m = new Map<string, number>();
    if (ordered.length >= 4) {
      const prev = ordered[ordered.length - 4]; // ~15 min ago
      for (const r of prev?.rows || []) m.set(r.n, num(r.score) ?? 0);
    }
    return m;
  }, [ordered]);

  const [secFilter, setSecFilter] = useState<string | null>(null);
  const shown = secFilter ? rows.filter((r) => r.sec === secFilter) : rows;

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6">
      <div className="my-3 font-mono text-[10px] tracking-[0.18em] text-[#6b7280]">
        AS OF {String(latest?.time || "--:--").slice(0, 5)} — score only rises; steady climbers = clean trends.
        Leaderboard is descriptive: entries remain SERVAL&apos;s job.
      </div>

      {/* sector cards */}
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        {sectors.slice(0, 12).map((s) => {
          const active = secFilter === s.sec;
          return (
            <button
              key={s.sec}
              type="button"
              onClick={() => setSecFilter(active ? null : s.sec)}
              className="rounded-xl border p-3 text-left transition-all"
              style={{
                borderColor: active ? `${ACCENT}66` : "#ffffff14",
                background: active ? `${ACCENT}10` : "linear-gradient(180deg, #ffffff06, transparent)",
              }}
            >
              <div className="truncate font-mono text-[9px] tracking-[0.14em] text-[#9ca3af]">
                {String(s.sec).replace(/^NIFTY_/, "").replace(/_/g, " ")}
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-mono text-lg font-semibold" style={{ color: ACCENT }}>
                  {fmt(s.avg)}
                </span>
                <span className="font-mono text-[9px] text-[#6b7280]">
                  {s.long_n}/{s.n} <span style={{ color: "#10b981" }}>▲</span>
                </span>
              </div>
              <div className="truncate font-mono text-[9px] text-[#6b7280]">★ {s.top}</div>
            </button>
          );
        })}
      </div>

      {/* stock leaderboard */}
      <div className="mb-2 flex items-center gap-3">
        <span className="font-mono text-[11px] tracking-[0.22em] text-[#9ca3af]">
          TOP MOVERS BY AFAC.2 {secFilter ? `— ${secFilter}` : ""}
        </span>
        {secFilter && (
          <button
            type="button"
            onClick={() => setSecFilter(null)}
            className="rounded border border-[#ffffff20] px-2 py-0.5 font-mono text-[9px] text-[#9ca3af] hover:text-white"
          >
            CLEAR
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#ffffff14" }}>
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr style={{ background: "#0d0d10" }}>
              {["#", "STOCK", "SIDE", "AFAC.2", "Δ15M", "CHG%", "RVOL", "PRICE", "SECTOR"].map((h) => (
                <th key={h} className="border-b border-[#ffffff14] px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-[#9ca3af]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center font-mono text-xs text-[#6b7280]">
                  No AFAC.2 data yet — snapshots publish every 5 min from ~09:45 IST.
                </td>
              </tr>
            )}
            {shown.map((r, i) => {
              const sideColor = r.side === "LONG" ? "#10b981" : "#ef4444";
              const delta = prevScores.has(r.n) ? (num(r.score) ?? 0) - (prevScores.get(r.n) ?? 0) : null;
              return (
                <tr key={r.n} className="transition-colors hover:bg-[#ffffff06]">
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#6b7280]">{i + 1}</td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs font-semibold">
                    <a
                      href={buildTradingViewUrl(r.n, r.n)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white transition-colors hover:underline"
                      style={{ textDecorationColor: ACCENT }}
                    >
                      {r.n}
                    </a>
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs" style={{ color: sideColor }}>
                    {r.side}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-sm font-semibold" style={{ color: ACCENT }}>
                    {fmt(r.score)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs" style={{ color: delta !== null && delta > 0 ? "#10b981" : "#6b7280" }}>
                    {delta === null ? "—" : `+${fmt(delta)}`}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs" style={{ color: (num(r.chg) ?? 0) >= 0 ? "#10b981" : "#ef4444" }}>
                    {fmt(r.chg, 2)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">{fmt(r.rvol, 2)}</td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">{fmt(r.px, 2)}</td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-[10px] text-[#6b7280]">
                    {String(r.sec || "").replace(/^NIFTY_/, "").replace(/_/g, " ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
