"use client";

import { useEffect, useMemo, useState } from "react";
import { kairosNumber, kairosSummary, type KairosEngine, type KairosEvent } from "@/utils/kairos";

const ACCENT = "#22d3ee";
const fmt = (v: unknown, d = 2) => { const n = kairosNumber(v); return n === null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits:d, maximumFractionDigits:d }); };
const text = (v: unknown) => v === undefined || v === null || v === "" ? "—" : String(v);
const color = (v: unknown) => (kairosNumber(v) ?? 0) >= 0 ? "#10b981" : "#ef4444";
const money = (v: unknown) => { const n = kairosNumber(v); return n === null ? "—" : `${n >= 0 ? "+" : ""}₹${fmt(n,0)}`; };
const ai = (v: unknown) => { const n = kairosNumber(v); return n !== null && n >= 0 && n <= 1 ? `${fmt(n*100,1)}%` : "—"; };
const time = (v: unknown) => String(v ?? "").slice(0,8) || "—";
const cell = "border-b border-[#ffffff0a] px-3 py-3 font-mono text-xs text-[#d1d5db] whitespace-nowrap";
const heading = "border-b border-[#ffffff14] px-3 py-2.5 font-mono text-[10px] tracking-[0.12em] text-[#9ca3af] whitespace-nowrap";

export default function KairosClient({ events, engine, dateStr, asOf }: { events: KairosEvent[]; engine: KairosEngine; dateStr: string; asOf: number }) {
  const [now, setNow] = useState(asOf);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const { open, closed, realized, unrealized, health, skips } = useMemo(() => kairosSummary(events,engine), [events,engine]);
  const v2 = engine === "kairos2";
  const healthTime = kairosNumber(health?.ts);
  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kolkata", year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
  const late = dateStr === today && healthTime !== null && now/1000 - healthTime > (kairosNumber(health?.heartbeat_seconds) ?? 900) + 120;
  const healthClock = healthTime === null ? "" : new Intl.DateTimeFormat("en-IN", {timeZone:"Asia/Kolkata", hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(healthTime*1000));
  const columns = v2 ? ["ENTRY", "OPTION", "AI", "BUY (ASK)", "MARK (BID)", "QTY / LOTS", "CAPITAL", "STOP", "PAPER P&L"] : ["ENTRY", "OPTION", "BUY (ASK)", "MARK (BID)", "PAPER P&L", "U-TARGET", "U-STOP", "QTY"];
  return <div className="min-h-0 flex-1 overflow-auto px-3 pb-10 md:px-6">
    {v2 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/5 px-3 py-2.5 text-xs">
      <span className={late || health?.data_error || health?.publish_error ? "text-amber-300" : "text-cyan-200"}>{late ? "Service heartbeat overdue" : text(health?.status ?? (dateStr === today ? "Waiting for service heartbeat" : "Historical session"))}</span>
      <span className="font-mono text-[10px] text-slate-400">AI ≥70 · ₹30,000 · 1 trade/day{healthClock ? ` · Updated ${healthClock} IST` : ""}</span>
    </div>}
    <div className="my-4 grid grid-cols-3 gap-2 md:gap-3">
      {[["REALIZED",realized],["OPEN P&L",unrealized],["DAY TOTAL",realized+unrealized]].map(([label,v]) => <div key={String(label)} className="rounded-xl border border-white/10 p-3 md:p-4" style={{background:`linear-gradient(180deg, ${ACCENT}08, transparent)`}}>
        <div className="font-mono text-[10px] tracking-[0.15em] text-slate-500">{String(label)}</div>
        <div className="mt-1 font-mono text-lg font-semibold md:text-2xl" style={{color:color(v)}}>{money(v)}</div>
      </div>)}
    </div>
    <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.12em] text-slate-400"><span>OPEN POSITIONS ({open.length})</span><span>QUOTED FILLS · BEFORE CHARGES</span></div>
    <div className="mb-6 overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-separate border-spacing-0 text-left"><thead><tr className="bg-[#0d0d10]">{columns.map(h => <th className={heading} key={h}>{h}</th>)}</tr></thead>
      <tbody>{!open.length && <tr><td colSpan={columns.length} className={`${cell} py-8 text-center text-slate-500`}>No open {v2 ? "Kairos 2.0 " : ""}positions.</td></tr>}
        {open.map(p => { const e=p.entry!, mark=p.mtm ?? e; return <tr key={p.sid} className="hover:bg-white/[.025]">
          <td className={cell} title={text(e.entry_at)}>{time(e.time)}</td>
          <td className={`${cell} font-semibold text-white`}>{text(e.name)}<div className="mt-1 text-[10px] font-normal text-slate-500">{text(e.side)} · {text(e.expiry)}</div></td>
          {v2 && <td className={`${cell} text-cyan-300`}>{ai(e.ai_score)}</td>}
          <td className={cell}>{fmt(e.entry)}</td><td className={cell} title={text(p.mtm?.quote_at)}>{fmt(p.mtm?.entry)}</td>
          {v2 ? <><td className={cell}>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td><td className={cell}>₹{fmt(e.capital_used,0)}</td><td className={cell}>{fmt(mark.stop_premium)}<div className="mt-1 text-[10px] text-slate-500">{fmt(mark.stop_pct,0)}%</div></td><td className={cell} style={{color:color(p.mtm?.pnl)}}>{p.mtm ? money(p.mtm.pnl) : "—"}</td></> : <><td className={cell} style={{color:color(p.mtm?.pnl)}}>{p.mtm ? money(p.mtm.pnl) : "—"}</td><td className={cell}>{fmt(e.u_target)}</td><td className={cell}>{fmt(e.u_stop)}</td><td className={cell}>{fmt(e.lot,0)}</td></>}
        </tr>; })}
      </tbody></table>
    </div>
    <div className="mb-2 font-mono text-[10px] tracking-[0.12em] text-slate-400">CLOSED TRADES ({closed.length})</div>
    <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full border-separate border-spacing-0 text-left"><thead><tr className="bg-[#0d0d10]">{(v2 ? ["ENTRY → EXIT", "OPTION", "AI", "BUY", "SELL", "QTY / LOTS", "REASON", "PAPER P&L"] : ["EXIT", "OPTION", "BUY", "SELL", "REASON", "QTY", "PAPER P&L"]).map(h => <th key={h} className={heading}>{h}</th>)}</tr></thead>
      <tbody>{!closed.length && <tr><td colSpan={v2 ? 8 : 7} className={`${cell} py-8 text-center text-slate-500`}>No closed {v2 ? "Kairos 2.0 " : ""}trades this session.</td></tr>}
        {closed.map(p => {const e=p.exit!;return <tr key={p.sid} className="hover:bg-white/[.025]">
          <td className={cell} title={text(e.exit_at)}>{v2 ? `${time(p.entry?.time)} → ` : ""}{time(e.time)}</td><td className={`${cell} font-semibold text-white`}>{text(e.name)}</td>{v2 && <td className={`${cell} text-cyan-300`}>{ai(e.ai_score)}</td>}
          <td className={cell}>{fmt(e.entry_fill)}</td><td className={cell}>{fmt(e.entry)}</td>{v2 && <td className={cell}>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td>}
          <td className={cell}>{text(e.reason).replaceAll("_"," ")}</td>{!v2 && <td className={cell}>{fmt(e.lot,0)}</td>}<td className={cell} style={{color:color(e.pnl)}}>{money(e.pnl)}</td>
        </tr>;})}
      </tbody></table></div>
    {v2 && skips.length > 0 && <details className="mt-4 rounded-xl border border-white/10 p-3 text-xs text-slate-400"><summary className="cursor-pointer">Skipped entries ({skips.length})</summary><ul className="mt-3 space-y-2">{skips.map((s,i) => <li key={String(s.Doc_ID ?? i)}>{time(s.time)} · {text(s.name)} · {text(s.reason)}</li>)}</ul></details>}
  </div>;
}
