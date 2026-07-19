"use client";

import React, { useMemo } from "react";

const ACCENT = "#22d3ee";

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}
function pnlColor(v: any): string {
  const n = num(v);
  if (n === null) return "#9ca3af";
  return n >= 0 ? "#10b981" : "#ef4444";
}

export default function FableClient({ events }: { events: any[] }) {
  const { open, closed, realized, unrealized } = useMemo(() => {
    const bySid = new Map<string, { entry?: any; mtm?: any; exit?: any }>();
    for (const e of events) {
      const sid = e.signal_id || e.name;
      if (!bySid.has(sid)) bySid.set(sid, {});
      const g = bySid.get(sid)!;
      if (e.kind === "ENTRY") {
        if (!g.entry || (e.ts || 0) > (g.entry.ts || 0)) g.entry = e;
      } else if (e.kind === "MTM") {
        if (!g.mtm || (e.ts || 0) > (g.mtm.ts || 0)) g.mtm = e;
      } else if (e.kind === "EXIT") {
        if (!g.exit || (e.ts || 0) > (g.exit.ts || 0)) g.exit = e;
      }
    }
    const open: any[] = [];
    const closed: any[] = [];
    let realized = 0;
    let unrealized = 0;
    for (const [sid, g] of bySid) {
      if (g.exit) {
        closed.push({ sid, ...g });
        realized += num(g.exit.pnl) ?? 0;
      } else if (g.entry) {
        open.push({ sid, ...g });
        unrealized += num(g.mtm?.pnl) ?? 0;
      }
    }
    open.sort((a, b) => String(a.entry?.time || "").localeCompare(String(b.entry?.time || "")));
    closed.sort((a, b) => String(a.exit?.time || "").localeCompare(String(b.exit?.time || "")));
    return { open, closed, realized, unrealized };
  }, [events]);

  const total = realized + unrealized;

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6">
      {/* PnL summary strip */}
      <div className="my-4 grid grid-cols-3 gap-3">
        {[
          ["REALIZED", realized],
          ["UNREALIZED (MTM)", unrealized],
          ["DAY TOTAL", total],
        ].map(([label, v]) => (
          <div
            key={String(label)}
            className="rounded-xl border p-4"
            style={{ borderColor: "#ffffff14", background: `linear-gradient(180deg, ${ACCENT}08, transparent)` }}
          >
            <div className="font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">{label}</div>
            <div className="mt-1 font-mono text-2xl font-semibold" style={{ color: pnlColor(v) }}>
              {(num(v) ?? 0) >= 0 ? "+" : ""}
              {fmt(v, 0)}
            </div>
          </div>
        ))}
      </div>

      {/* Open positions */}
      <div className="mb-2 font-mono text-[11px] tracking-[0.22em] text-[#9ca3af]">
        OPEN POSITIONS ({open.length}) — marked at bid, 1 lot each
      </div>
      <div className="mb-6 overflow-x-auto rounded-xl border" style={{ borderColor: "#ffffff14" }}>
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr style={{ background: "#0d0d10" }}>
              {["ENTRY TIME", "OPTION", "ENTRY (ASK)", "MARK (BID)", "UNREAL PnL", "U-TARGET", "U-STOP", "LOT"].map((h) => (
                <th key={h} className="border-b border-[#ffffff14] px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-[#9ca3af]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {open.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center font-mono text-xs text-[#6b7280]">
                  No open paper positions.
                </td>
              </tr>
            )}
            {open.map((p) => (
              <tr key={p.sid} className="hover:bg-[#ffffff06]">
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">
                  {String(p.entry?.time || "").slice(0, 5)}
                </td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs font-semibold text-white">
                  {p.entry?.name}
                </td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">{fmt(p.entry?.entry)}</td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs" style={{ color: ACCENT }}>
                  {fmt(p.mtm?.entry)}
                </td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs font-semibold" style={{ color: pnlColor(p.mtm?.pnl) }}>
                  {p.mtm ? `${(num(p.mtm.pnl) ?? 0) >= 0 ? "+" : ""}${fmt(p.mtm.pnl, 0)}` : "…"}
                </td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#10b981]">{fmt(p.entry?.u_target)}</td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#ef4444]">{fmt(p.entry?.u_stop)}</td>
                <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#9ca3af]">{fmt(p.entry?.lot, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Closed trades */}
      <div className="mb-2 font-mono text-[11px] tracking-[0.22em] text-[#9ca3af]">
        CLOSED TRADES ({closed.length})
      </div>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#ffffff14" }}>
        <table className="w-full border-separate border-spacing-0 text-left">
          <thead>
            <tr style={{ background: "#0d0d10" }}>
              {["EXIT TIME", "OPTION", "ENTRY", "EXIT", "REASON", "LOT", "PnL"].map((h) => (
                <th key={h} className="border-b border-[#ffffff14] px-3 py-2 font-mono text-[10px] tracking-[0.16em] text-[#9ca3af]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {closed.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center font-mono text-xs text-[#6b7280]">
                  No closed paper trades yet today.
                </td>
              </tr>
            )}
            {closed.map((p) => {
              const reason = p.exit?.reason || "";
              const rColor = reason === "TARGET" ? "#10b981" : reason === "STOP" ? "#ef4444" : "#9ca3af";
              return (
                <tr key={p.sid} className="hover:bg-[#ffffff06]">
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">
                    {String(p.exit?.time || "").slice(0, 5)}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs font-semibold text-white">
                    {p.exit?.name}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">{fmt(p.exit?.entry_fill)}</td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]">{fmt(p.exit?.entry)}</td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs" style={{ color: rColor }}>
                    {reason}
                  </td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#9ca3af]">{fmt(p.exit?.lot, 0)}</td>
                  <td className="border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs font-semibold" style={{ color: pnlColor(p.exit?.pnl) }}>
                    {(num(p.exit?.pnl) ?? 0) >= 0 ? "+" : ""}
                    {fmt(p.exit?.pnl, 0)}
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
