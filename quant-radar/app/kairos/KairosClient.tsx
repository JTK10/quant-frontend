"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, BrainCircuit, Check, CircleDot, Clock3, Crosshair, ShieldCheck, Wallet } from "lucide-react";
import { kairosNumber, kairosSummary, type KairosEngine, type KairosEvent } from "@/utils/kairos";
import styles from "./kairos.module.css";

const fmt = (v: unknown, d = 2) => { const n = kairosNumber(v); return n === null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const text = (v: unknown) => v === undefined || v === null || v === "" ? "—" : String(v);
const money = (v: unknown) => { const n = kairosNumber(v); return n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${fmt(Math.abs(n), 0)}`; };
const ai = (v: unknown) => { const n = kairosNumber(v); return n !== null && n >= 0 && n <= 1 ? `${fmt(n * 100, 1)}%` : "—"; };
const time = (v: unknown) => String(v ?? "").slice(0, 8) || "—";
const tone = (v: unknown) => { const n = kairosNumber(v); return n === null || n === 0 ? styles.neutral : n > 0 ? styles.positive : styles.negative; };
function Detail({ label, children }: { label: string; children: ReactNode }) { return <div className={styles.detail}><dt>{label}</dt><dd>{children}</dd></div>; }

export default function KairosClient({ events, engine, dateStr, asOf }: { events: KairosEvent[]; engine: KairosEngine; dateStr: string; asOf: number }) {
  const [now, setNow] = useState(asOf);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(timer); }, []);
  const { open, closed, realized, unrealized, health, skips } = useMemo(() => kairosSummary(events, engine), [events, engine]);
  const rusty = engine === "kairos_rusty";
  const v2 = engine !== "kairos";
  const healthTime = kairosNumber(health?.ts);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const late = dateStr === today && healthTime !== null && now / 1000 - healthTime > (kairosNumber(health?.heartbeat_seconds) ?? 900) + 120;
  const healthClock = healthTime === null ? "" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(healthTime * 1000));
  const warning = late || Boolean(health?.data_error || health?.publish_error);
  const status = late ? "Service heartbeat overdue" : text(health?.status ?? (dateStr === today ? "Waiting for service heartbeat" : "Historical session"));
  const featured = open[0] ?? closed[0], entry = featured?.entry, exit = featured?.exit, mark = featured?.mtm;
  const score = kairosNumber(entry?.ai_score ?? exit?.ai_score), validScore = score !== null && score >= 0 && score <= 1;
  const tradePnl = exit?.pnl ?? mark?.pnl;
  const usedCapital = open.reduce((sum, p) => sum + (kairosNumber(p.entry?.capital_used) ?? 0), 0);
  const selectionValue = (e?: KairosEvent) => rusty ? `${fmt(e?.rusty_pct)}%` : ai(e?.ai_score);
  const columns = v2 ? ["ENTRY", "OPTION", rusty ? "RUSTY OI" : "AI SCORE", "BUY / ASK", "MARK / BID", "QTY / LOTS", "CAPITAL", "STOP", "PAPER P&L"] : ["ENTRY", "OPTION", "BUY / ASK", "MARK / BID", "PAPER P&L", "U-TARGET", "U-STOP", "QTY"];
  return <div className={styles.content}>
    {v2 && <div className={`${styles.health} ${warning ? styles.healthWarning : ""}`} role="status"><span><Activity size={14}/><i/>{status}</span><span className={styles.timestamp}>{healthClock ? `Heartbeat ${healthClock} IST` : "Heartbeat unavailable"}<span className={styles.healthDate}>{dateStr}</span></span></div>}
    <section className={styles.metrics} style={!v2 ? {gridTemplateColumns:"repeat(3,minmax(0,1fr))"} : undefined} aria-label="Session performance">
      <div className={`${styles.metric} ${styles.totalMetric}`}><div className={styles.metricLabel}><Activity size={13}/> SESSION P&L <span>GROSS</span></div><div className={`${styles.metricValue} ${tone(realized+unrealized)}`}>{money(realized+unrealized)}</div><div className={styles.metricNote}>Realized + open positions</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}><Check size={13}/> REALIZED</div><div className={`${styles.metricValue} ${tone(realized)}`}>{money(realized)}</div><div className={styles.metricNote}>{closed.length} closed {closed.length === 1 ? "trade" : "trades"}</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}><CircleDot size={13}/> OPEN P&L</div><div className={`${styles.metricValue} ${tone(unrealized)}`}>{money(unrealized)}</div><div className={styles.metricNote}>{open.length} active {open.length === 1 ? "position" : "positions"}</div></div>
      {v2 && <div className={styles.metric}><div className={styles.metricLabel}><Wallet size={13}/> PAPER BUDGET</div><div className={styles.metricValue}>₹30,000</div><div className={styles.metricNote}>₹{fmt(usedCapital,0)} in open positions</div></div>}
    </section>
    <div className={styles.focusGrid} style={!v2 ? {gridTemplateColumns:"1fr"} : undefined}>
      <section className={styles.panel} aria-label="Trade overview">
        <div className={styles.panelHeading}><span><Crosshair size={15}/>{open.length ? "Active position" : featured ? "Latest execution" : "Trade monitor"}</span><span className={styles.stateChip}>{open.length ? "OPEN" : featured ? "CLOSED" : "STANDBY"}</span></div>
        {featured ? <>
          <div className={styles.positionTitle}><div><div className={styles.eyebrow}>{text(entry?.side ?? exit?.side)} · OPTION CONTRACT</div><h2>{text(entry?.name ?? exit?.name)}</h2><p>{entry?.expiry ? `Expiry ${text(entry.expiry)} · ` : ""}{exit ? text(exit.reason).replaceAll("_"," ").toLowerCase() : "Monitoring quoted bid and premium stop"}</p></div><div className={`${styles.positionPnl} ${tone(tradePnl)}`}>{money(tradePnl)}<span>{exit ? "REALIZED P&L" : "OPEN P&L"}</span></div></div>
          <dl className={styles.tradeDetails}><Detail label="ENTRY / ASK">₹{fmt(entry?.entry ?? exit?.entry_fill)}</Detail><Detail label={exit ? "EXIT / BID" : "MARK / BID"}>₹{fmt(exit?.entry ?? mark?.entry)}</Detail><Detail label={v2 ? "PREMIUM STOP" : "UNDERLYING STOP"}>{fmt(v2 ? (mark?.stop_premium ?? exit?.stop_premium ?? entry?.stop_premium) : entry?.u_stop)}</Detail><Detail label={v2 ? "QUANTITY / LOTS" : "QUANTITY"}>{v2 ? `${fmt(entry?.quantity ?? exit?.quantity,0)} / ${fmt(entry?.lots ?? exit?.lots,0)}` : fmt(entry?.lot ?? exit?.lot,0)}</Detail></dl>
          <div className={styles.executionTimeline}><span><span className={styles.timelineDot}/>Entered <b title={text(entry?.entry_at)}>{time(entry?.time)} IST</b></span><span className={styles.timelineLine}/><span><span className={`${styles.timelineDot} ${exit ? styles.closedDot : ""}`}/>{exit ? <>Exited <b title={text(exit.exit_at)}>{time(exit.time)} IST</b></> : <b>Position open</b>}</span></div>
          {mark?.quote_at != null && !exit && <p className={styles.quoteNote}>Latest quote: {text(mark.quote_at)}</p>}
        </> : <div className={styles.standby}><div className={styles.standbyIcon}><Crosshair size={29} strokeWidth={1.2}/></div><h2>No position this session</h2><p>{rusty ? "Waiting for a fresh Rusty confirmed-entry label with a completed cash candle and executable option depth." : v2 ? "Waiting for a fresh, confirmed Pallas signal that meets the AI selection and execution checks." : "Entries appear here when the Kairos engine publishes a trade."}</p><span>No qualifying signal means no trade.</span></div>}
      </section>
      {rusty && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label="Rusty selection">
        <div className={styles.panelHeading}><span><Activity size={16}/>Rusty selection</span><span className={styles.aiBadge}>OI CONFIRMED</span></div>
        <dl className={styles.tradeDetails}><Detail label="RUSTY OI CHANGE">{entry ? `${fmt(entry.rusty_pct)}%` : "—"}</Detail><Detail label="RUSTY RANK">{fmt(entry?.rusty_rank, 0)}</Detail><Detail label="CE OI CHANGE">{entry ? `${fmt(entry.ce_pct)}%` : "—"}</Detail><Detail label="PE OI CHANGE">{entry ? `${fmt(entry.pe_pct)}%` : "—"}</Detail><Detail label="CLASSIFICATION">{text(entry?.flow_label ?? entry?.flow_type)}</Detail><Detail label="CASH CANDLE">{text(entry?.candle_tier)} · {text(entry?.c_time)}</Detail></dl>
        <div className={styles.rules}><span><ShieldCheck size={13}/>Confirmed entry · high conviction · PDH/PDL break</span><span><Crosshair size={13}/>Solid / Marubozu completed cash candle</span><span><Activity size={13}/>Same-cut priority: strongest absolute Rusty OI change</span><span><ShieldCheck size={13}/>Whole lots · ₹30,000 · initial stop −15% · step trailing</span><span><Clock3 size={13}/>1 entry / day · time exit 11:30 IST</span></div>
      </section>}
      {v2 && !rusty && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label="AI selection">
        <div className={styles.panelHeading}><span><BrainCircuit size={16}/>AI selection</span><span className={styles.aiBadge}>PALLAS AI</span></div>
        <div className={styles.scoreArea}><div className={styles.scoreRing}><svg viewBox="0 0 110 110" aria-hidden="true"><circle className={styles.ringTrack} cx="55" cy="55" r="46"/><circle className={styles.ringValue} cx="55" cy="55" r="46" pathLength="100" strokeDasharray={`${validScore ? score*100 : 0} 100`}/></svg><div><strong>{ai(score)}</strong><span>SELECTION SCORE</span></div></div><div className={styles.scoreDescription}><span className={styles.eyebrow}>{featured ? "SELECTED TRADE" : "ENTRY REQUIREMENT"}</span><h3>{featured ? "AI-filtered execution" : "Quality over quantity"}</h3><p>{featured ? "Score recorded at entry." : "First eligible signal of the day."}</p><span className={styles.threshold}>Minimum score <b>70%</b></span></div></div>
        <div className={styles.rules}><span><ShieldCheck size={13}/>Whole lots · ₹30,000 budget</span><span><Crosshair size={13}/>Initial stop −15% · step trailing</span><span><Clock3 size={13}/>1 entry / day · time exit 11:30 IST</span></div><p className={styles.aiNote}>AI score is a model ranking, not a win probability.</p>
      </section>}
    </div>
    {open.length > 0 && <section className={styles.ledger}><div className={styles.sectionHeading}><h2>Open positions <span>{open.length}</span></h2><span>QUOTED BID / ASK</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{open.map(p=>{const e=p.entry!, m=p.mtm ?? e;return <tr key={p.sid}><td title={text(e.entry_at)}>{time(e.time)}</td><td className={styles.contract}>{text(e.name)}<small>{text(e.side)} · {text(e.expiry)}</small></td>{v2 && <td className={styles.scoreCell}>{selectionValue(e)}</td>}<td>{fmt(e.entry)}</td><td title={text(p.mtm?.quote_at)}>{fmt(p.mtm?.entry)}</td>{v2 ? <><td>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td><td>₹{fmt(e.capital_used,0)}</td><td>{fmt(m.stop_premium)}<small>{fmt(m.stop_pct,0)}%</small></td><td className={tone(p.mtm?.pnl)}>{p.mtm ? money(p.mtm.pnl) : "—"}</td></> : <><td className={tone(p.mtm?.pnl)}>{p.mtm ? money(p.mtm.pnl) : "—"}</td><td>{fmt(e.u_target)}</td><td>{fmt(e.u_stop)}</td><td>{fmt(e.lot,0)}</td></>}</tr>;})}</tbody></table></div></section>}
    <section className={styles.ledger}><div className={styles.sectionHeading}><h2>Execution history <span>{closed.length}</span></h2><span>{dateStr} · IST</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{(v2 ? ["ENTRY → EXIT","OPTION CONTRACT",rusty ? "RUSTY OI" : "AI SCORE","BUY / ASK","SELL / BID","QTY / LOTS","EXIT REASON","PAPER P&L"] : ["EXIT","OPTION CONTRACT","BUY / ASK","SELL / BID","EXIT REASON","QTY","PAPER P&L"]).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{!closed.length && <tr><td colSpan={v2 ? 8 : 7} className={styles.emptyLedger}>No completed trades this session.</td></tr>}{closed.map(p=>{const e=p.exit!;return <tr key={p.sid}><td title={text(e.exit_at)}>{v2 ? `${time(p.entry?.time)} → ` : ""}{time(e.time)}</td><td className={styles.contract}>{text(e.name)}</td>{v2 && <td className={styles.scoreCell}><span>{rusty ? selectionValue(e) : ai(e.ai_score ?? p.entry?.ai_score)}</span></td>}<td>{fmt(e.entry_fill)}</td><td>{fmt(e.entry)}</td>{v2 && <td>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td>}<td><span className={styles.reason}>{text(e.reason).replaceAll("_"," ")}</span></td>{!v2 && <td>{fmt(e.lot,0)}</td>}<td className={tone(e.pnl)}>{money(e.pnl)}</td></tr>;})}</tbody></table></div></section>
    {v2 && skips.length>0 && <details className={styles.skips}><summary>Skipped entries <span>{skips.length}</span></summary><ul>{skips.map((s,i)=><li key={String(s.Doc_ID ?? i)}><b>{time(s.time)}</b> · {text(s.name)} · {text(s.reason)}</li>)}</ul></details>}
    <footer className={styles.footer}><ShieldCheck size={12}/><span>Quoted fills · gross P&L before charges{v2 ? " · paper simulation" : ""}</span><span>ALL TIMES IST</span></footer>
  </div>;
}
