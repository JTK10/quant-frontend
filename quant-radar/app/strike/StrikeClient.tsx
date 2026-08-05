"use client";

import React, { useMemo, useState } from "react";

const ACCENT = "#f59e0b";

const TIER_COLOR: Record<string, string> = {
  BEST: "#10b981",
  OK: "#22d3ee",
  WEAK: "#9ca3af",
  FAILED: "#ef4444",
  UNKNOWN: "#6b7280",
};

function num(v: any): number | null {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(v: any, d = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toFixed(d);
}
function inr(v: any): string {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function pnlColor(v: any): string {
  const n = num(v);
  if (n === null) return "#9ca3af";
  return n >= 0 ? "#10b981" : "#ef4444";
}

export default function StrikeClient({
  picks,
  trades,
  dateStr,
}: {
  picks: any[];
  trades: any[];
  dateStr: string;
}) {
  const [sel, setSel] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // Order the list so the setups worth looking at surface first: BEST, then OK,
  // then WEAK, and FAILED last -- a failed break is shown, not hidden, but it
  // should never be the first thing you see.
  const rank: Record<string, number> = { BEST: 0, OK: 1, WEAK: 2, UNKNOWN: 3, FAILED: 4 };
  const rows = useMemo(() => {
    const f = q.trim().toLowerCase();
    return picks
      .filter((p) => !f || String(p.underlying || p.name || "").toLowerCase().includes(f))
      .sort((a, b) => {
        const r = (rank[a.tier] ?? 9) - (rank[b.tier] ?? 9);
        if (r !== 0) return r;
        return (num(b.moved_pct) ?? 0) - (num(a.moved_pct) ?? 0);
      });
  }, [picks, q]);

  const active = useMemo(
    () => rows.find((p) => (p.underlying || p.name) === sel) || null,
    [rows, sel]
  );

  const { open, closed, realized, unrealized } = useMemo(() => {
    const bySid = new Map<string, { entry?: any; mtm?: any; exit?: any }>();
    for (const e of trades) {
      const sid = e.signal_id || e.name;
      if (!bySid.has(sid)) bySid.set(sid, {});
      const g = bySid.get(sid)!;
      const slot = e.kind === "ENTRY" ? "entry" : e.kind === "MTM" ? "mtm" : e.kind === "EXIT" ? "exit" : null;
      if (!slot) continue;
      if (!(g as any)[slot] || (e.ts || 0) > ((g as any)[slot].ts || 0)) (g as any)[slot] = e;
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
    return { open, closed, realized, unrealized };
  }, [trades]);

  async function takeTrade() {
    if (!active) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/strike-enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          underlying: active.underlying || active.name,
          side: active.side,
          opt_key: active.opt_key,
          opt_symbol: active.opt_symbol,
          strike: active.strike,
          expiry: active.expiry,
          lot: active.lot,
          otm_pct: active.otm_pct,
          ref_prem: active.prem,
          date: dateStr,
        }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(
        r.ok
          ? `Requested ${active.opt_symbol || active.strike}. The bot fills at the live ask on its next 30s pass.`
          : `Failed: ${j.error || r.status}`
      );
    } catch (e: any) {
      setMsg(`Failed: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const total = realized + unrealized;
  const th =
    "border-b border-[#ffffff14] px-3 py-2 text-left font-mono text-[10px] tracking-[0.18em] text-[#6b7280]";
  const td = "border-b border-[#ffffff0a] px-3 py-2 font-mono text-xs text-[#d1d5db]";

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6">
      {/* P&L strip */}
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
              {inr(v)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* left: the universe */}
        <div className="rounded-xl border border-[#ffffff14]">
          <div className="flex items-center justify-between gap-3 border-b border-[#ffffff14] px-3 py-2">
            <div className="font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
              PICKS · {rows.length}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filter stock…"
              className="w-48 rounded-md border border-[#ffffff14] bg-[#0A0A0B] px-2 py-1 font-mono text-xs text-white outline-none focus:border-[#ffffff33]"
            />
          </div>
          <div className="max-h-[52vh] overflow-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-[#0A0A0B]">
                <tr>
                  {["STOCK", "SIDE", "SPOT", "MOVED", "STRIKE", "OTM%", "PREM", "COST/LOT", "TIER"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className={td} colSpan={9}>
                      No picks published for {dateStr}. The scanner runs 09:30–15:20 IST.
                    </td>
                  </tr>
                )}
                {rows.map((p) => {
                  const key = p.underlying || p.name;
                  const on = key === sel;
                  return (
                    <tr
                      key={key}
                      onClick={() => setSel(key)}
                      className="cursor-pointer hover:bg-[#ffffff08]"
                      style={on ? { background: `${ACCENT}14` } : undefined}
                    >
                      <td className={td} style={{ color: "#fff" }}>{key}</td>
                      <td className={td} style={{ color: p.side === "LONG" ? "#10b981" : "#ef4444" }}>
                        {p.side}
                      </td>
                      <td className={td}>{fmt(p.spot)}</td>
                      <td className={td} style={{ color: pnlColor(p.moved_pct) }}>
                        {(num(p.moved_pct) ?? 0) >= 0 ? "+" : ""}
                        {fmt(p.moved_pct)}%
                      </td>
                      <td className={td} style={{ color: "#fff" }}>{inr(p.strike)}</td>
                      <td className={td}>{fmt(p.otm_pct)}</td>
                      <td className={td}>{fmt(p.prem)}</td>
                      <td className={td}>{inr(p.cost_lot)}</td>
                      <td className={td} style={{ color: TIER_COLOR[p.tier] || "#9ca3af" }}>
                        {p.tier}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* right: the selected pick */}
        <div className="rounded-xl border border-[#ffffff14] p-4">
          <div className="font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">SELECTED</div>
          {!active && (
            <div className="mt-3 font-mono text-xs text-[#6b7280]">
              Pick a stock on the left to see the strike, what it costs, and to take a paper trade.
            </div>
          )}
          {active && (
            <>
              <div className="mt-2 font-mono text-xl font-semibold text-white">
                {active.underlying || active.name}
              </div>
              <div className="font-mono text-sm" style={{ color: active.side === "LONG" ? "#10b981" : "#ef4444" }}>
                {active.side} · {active.side === "LONG" ? "CE" : "PE"}
              </div>

              <div className="mt-4 rounded-lg border border-[#ffffff14] p-3">
                <div className="font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">BUY</div>
                <div className="font-mono text-2xl font-semibold" style={{ color: ACCENT }}>
                  {inr(active.strike)} {active.side === "LONG" ? "CE" : "PE"}
                </div>
                <div className="mt-1 font-mono text-xs text-[#9ca3af]">
                  {active.opt_symbol || `exp ${active.expiry}`}
                </div>
              </div>

              <div className="mt-3 space-y-1.5 font-mono text-xs">
                {[
                  ["spot", fmt(active.spot)],
                  ["moved from open", `${(num(active.moved_pct) ?? 0) >= 0 ? "+" : ""}${fmt(active.moved_pct)}%`],
                  ["OTM", `${fmt(active.otm_pct)}%`],
                  ["premium (ask)", fmt(active.prem)],
                  ["lot", inr(active.lot)],
                  ["cost / lot", `₹${inr(active.cost_lot)}`],
                  ["expiry", String(active.expiry ?? "—")],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between">
                    <span className="text-[#6b7280]">{k}</span>
                    <span className="text-[#d1d5db]">{v}</span>
                  </div>
                ))}
              </div>

              <div
                className="mt-3 rounded-lg border p-2.5"
                style={{ borderColor: `${TIER_COLOR[active.tier] || "#9ca3af"}44` }}
              >
                <div className="font-mono text-xs font-semibold" style={{ color: TIER_COLOR[active.tier] || "#9ca3af" }}>
                  {active.tier}
                </div>
                <div className="mt-0.5 font-mono text-[11px] leading-snug text-[#9ca3af]">
                  {active.tier_note}
                </div>
              </div>

              <div className="mt-2 font-mono text-[11px] leading-snug text-[#6b7280]">
                {active.why} · exits at +50% / −30% premium, 60-min time stop, or 15:25
              </div>

              <button
                onClick={takeTrade}
                disabled={busy}
                className="mt-4 w-full rounded-lg py-2.5 font-mono text-sm font-semibold text-black disabled:opacity-50"
                style={{ background: ACCENT }}
              >
                {busy ? "SENDING…" : "TAKE PAPER TRADE"}
              </button>
              {msg && <div className="mt-2 font-mono text-[11px] text-[#9ca3af]">{msg}</div>}
            </>
          )}
        </div>
      </div>

      {/* open positions */}
      <div className="mt-5 rounded-xl border border-[#ffffff14]">
        <div className="border-b border-[#ffffff14] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
          OPEN · {open.length}
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>{["TIME", "OPTION", "FILL", "MARK", "P&L", "LOT"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {open.length === 0 && (
              <tr><td className={td} colSpan={6}>No open paper positions.</td></tr>
            )}
            {open.map((p) => (
              <tr key={p.sid}>
                <td className={td}>{String(p.entry?.time || "").slice(0, 5)}</td>
                <td className={td} style={{ color: "#fff" }}>{p.entry?.name}</td>
                <td className={td}>{fmt(p.entry?.entry)}</td>
                <td className={td}>{fmt(p.mtm?.entry)}</td>
                <td className={td} style={{ color: pnlColor(p.mtm?.pnl) }}>
                  {p.mtm ? `${(num(p.mtm.pnl) ?? 0) >= 0 ? "+" : ""}${inr(p.mtm.pnl)}` : "…"}
                </td>
                <td className={td}>{inr(p.entry?.lot)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* closed */}
      <div className="mt-4 rounded-xl border border-[#ffffff14]">
        <div className="border-b border-[#ffffff14] px-3 py-2 font-mono text-[10px] tracking-[0.22em] text-[#6b7280]">
          CLOSED · {closed.length}
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>{["TIME", "OPTION", "FILL", "EXIT", "P&L", "REASON"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {closed.length === 0 && (
              <tr><td className={td} colSpan={6}>Nothing closed yet.</td></tr>
            )}
            {closed.map((p) => (
              <tr key={p.sid}>
                <td className={td}>{String(p.exit?.time || "").slice(0, 5)}</td>
                <td className={td} style={{ color: "#fff" }}>{p.exit?.name}</td>
                <td className={td}>{fmt(p.exit?.entry_fill)}</td>
                <td className={td}>{fmt(p.exit?.entry)}</td>
                <td className={td} style={{ color: pnlColor(p.exit?.pnl) }}>
                  {(num(p.exit?.pnl) ?? 0) >= 0 ? "+" : ""}
                  {inr(p.exit?.pnl)}
                </td>
                <td className={td}>{p.exit?.reason || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
