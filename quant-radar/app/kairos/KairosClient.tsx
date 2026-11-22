"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, BrainCircuit, Check, CircleDot, Clock3, Crosshair, ShieldCheck, Wallet } from "lucide-react";
import { kairosNumber, kairosSummary, updateKairosFeed, type KairosEngine, type KairosEvent } from "@/utils/kairos";
import styles from "./kairos.module.css";

const fmt = (v: unknown, d = 2) => { const n = kairosNumber(v); return n === null ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }); };
const text = (v: unknown) => v === undefined || v === null || v === "" ? "—" : String(v);
const money = (v: unknown) => { const n = kairosNumber(v); return n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${fmt(Math.abs(n), 0)}`; };
const ai = (v: unknown) => { const n = kairosNumber(v); return n !== null && n >= 0 && n <= 1 ? `${fmt(n * 100, 1)}%` : "—"; };
const time = (v: unknown) => String(v ?? "").slice(0, 8) || "—";
const tone = (v: unknown) => { const n = kairosNumber(v); return n === null || n === 0 ? styles.neutral : n > 0 ? styles.positive : styles.negative; };
function Detail({ label, children }: { label: string; children: ReactNode }) { return <div className={styles.detail}><dt>{label}</dt><dd>{children}</dd></div>; }

export default function KairosClient({ events, engine, dateStr, asOf, feedError = null }: { events: KairosEvent[]; engine: KairosEngine; dateStr: string; asOf: number; feedError?: string | null }) {
  const feedKey = `${engine}|${dateStr}`;
  const incoming = { key: feedKey, asOf, events, error: feedError };
  const [feed, setFeed] = useState(() => updateKairosFeed(null, incoming, engine));
  // A server refresh may fail while a paper position is open. Retain the last
  // same-session ledger, but reset it immediately when date/source changes.
  let activeFeed = feed;
  if (feed.key !== feedKey || feed.asOf !== asOf || feed.error !== feedError) {
    activeFeed = updateKairosFeed(feed, incoming, engine);
    setFeed(activeFeed);
  }
  const [now, setNow] = useState(asOf);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(timer); }, []);
  const { open, closed, realized, unrealized, health, skips } = useMemo(() => kairosSummary(activeFeed.events, engine), [activeFeed.events, engine]);
  const aurum = engine === "kairos10";
  const osprey = engine === "kairos29";
  const cr = engine === "kairos_cr";
  const ninth = engine === "kairos9";
  const rusty = engine === "kairos_rusty";
  const v2 = engine !== "kairos";
  const decisionDetails = ninth || aurum || osprey || cr;
  const healthTime = kairosNumber(health?.ts);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const late = dateStr === today && healthTime !== null && now / 1000 - healthTime > (kairosNumber(health?.heartbeat_seconds) ?? 900) + 120;
  const healthClock = healthTime === null ? "" : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(healthTime * 1000));
  const warning = Boolean(activeFeed.error) || late || Boolean(health?.data_error || health?.publish_error || (decisionDetails && health?.last_error));
  const lastFailure = decisionDetails && health?.last_failure && typeof health.last_failure === "object" ? health.last_failure as KairosEvent : undefined;
  const lastDecision = decisionDetails && health?.last_decision && typeof health.last_decision === "object" ? health.last_decision as KairosEvent : undefined;
  const lastSkip = decisionDetails ? [...skips].sort((a,b)=>(kairosNumber(b.ts)??0)-(kairosNumber(a.ts)??0))[0] : undefined;
  const status = late ? "Service heartbeat overdue" : text(health?.status ?? (dateStr === today ? "Waiting for service heartbeat" : "Historical session"));
  const featured = open[0] ?? closed[0], entry = featured?.entry, exit = featured?.exit, mark = featured?.mtm;
  const score = kairosNumber(entry?.ai_score ?? exit?.ai_score), validScore = score !== null && score >= 0 && score <= 1;
  const tradePnl = exit?.pnl ?? mark?.pnl;
  const usedCapital = open.reduce((sum, p) => sum + (kairosNumber(p.entry?.capital_used) ?? 0), 0);
  const slotsUsed = open.length + closed.length;
  const crMaxTrades = kairosNumber(health?.max_trades) ?? 3;
  const selectionValue = (e?: KairosEvent) => cr ? `★T${text(e?.cr_tier)} · ${fmt(e?.cr_score, 1)}` : rusty ? `${fmt(e?.rusty_pct)}%` : aurum || osprey ? `${fmt((kairosNumber(e?.ai_score) ?? NaN) * 100,1)} / 100` : ai(e?.ai_score);
  const modelThreshold = kairosNumber(health?.score_threshold) ?? (osprey ? 0.28 : 0.30);
  const columns = cr
    ? ["ENTRY", "OPTION", "TIER / SCORE", "BUY / ASK", "MARK / BID", "QTY / LOTS", "STATE / PEAK", "STOP", "NET P&L"]
    : v2 ? ["ENTRY", "OPTION", rusty ? "RUSTY OI" : "AI SCORE", "BUY / ASK", "MARK / BID", "QTY / LOTS", "CAPITAL", "STOP", "PAPER P&L"] : ["ENTRY", "OPTION", "BUY / ASK", "MARK / BID", "PAPER P&L", "U-TARGET", "U-STOP", "QTY"];
  return <div className={styles.content}>
    {activeFeed.error && <div className={`${styles.health} ${styles.healthWarning}`} role="alert">{activeFeed.error}</div>}
    {v2 && <div className={`${styles.health} ${warning ? styles.healthWarning : ""}`} role="status"><span><Activity size={14}/><i/>{status}</span><span className={styles.timestamp}>{healthClock ? `Heartbeat ${healthClock} IST` : "Heartbeat unavailable"}<span className={styles.healthDate}>{dateStr}</span></span></div>}
    <section className={styles.metrics} style={!v2 ? {gridTemplateColumns:"repeat(3,minmax(0,1fr))"} : undefined} aria-label="Session performance">
      <div className={`${styles.metric} ${styles.totalMetric}`}><div className={styles.metricLabel}><Activity size={13}/> SESSION P&L <span>{cr ? "NET" : "GROSS"}</span></div><div className={`${styles.metricValue} ${tone(realized+unrealized)}`}>{money(realized+unrealized)}</div><div className={styles.metricNote}>{cr ? "Realized + open (after NSE charges)" : "Realized + open positions"}</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}><Check size={13}/> REALIZED</div><div className={`${styles.metricValue} ${tone(realized)}`}>{money(realized)}</div><div className={styles.metricNote}>{closed.length} closed {closed.length === 1 ? "trade" : "trades"}</div></div>
      <div className={styles.metric}><div className={styles.metricLabel}><CircleDot size={13}/> OPEN P&L</div><div className={`${styles.metricValue} ${tone(unrealized)}`}>{money(unrealized)}</div><div className={styles.metricNote}>{open.length} active {open.length === 1 ? "position" : "positions"}</div></div>
      {v2 && <div className={styles.metric}><div className={styles.metricLabel}><Wallet size={13}/> {cr ? "DAILY SLOTS" : "PAPER BUDGET"}</div><div className={styles.metricValue}>{cr ? `${slotsUsed} / ${crMaxTrades}` : "₹30,000"}</div><div className={styles.metricNote}>₹{fmt(usedCapital,0)} in open positions{cr ? " · 1 lot/trade" : ""}</div></div>}
    </section>
    <div className={styles.focusGrid} style={!v2 ? {gridTemplateColumns:"1fr"} : undefined}>
      <section className={styles.panel} aria-label="Trade overview">
        <div className={styles.panelHeading}><span><Crosshair size={15}/>{open.length ? "Active position" : featured ? "Latest execution" : "Trade monitor"}</span><span className={styles.stateChip}>{open.length ? (cr ? text(mark?.cr_state ?? entry?.cr_state ?? "OPEN") : "OPEN") : featured ? "CLOSED" : "STANDBY"}</span></div>
        {featured ? <>
          <div className={styles.positionTitle}><div><div className={styles.eyebrow}>{text(entry?.side ?? exit?.side)} · OPTION CONTRACT</div><h2>{text(entry?.name ?? exit?.name)}</h2><p>{entry?.expiry ? `Expiry ${text(entry.expiry)} · ` : ""}{exit ? text(exit.reason).replaceAll("_"," ").toLowerCase() : "Monitoring quoted bid and premium stop"}</p></div><div className={`${styles.positionPnl} ${tone(tradePnl)}`}>{money(tradePnl)}<span>{exit ? (cr ? "REALIZED NET" : "REALIZED P&L") : (cr ? "OPEN NET" : "OPEN P&L")}</span></div></div>
          <dl className={styles.tradeDetails}><Detail label="ENTRY / ASK">₹{fmt(entry?.entry ?? exit?.entry_fill)}</Detail><Detail label={exit ? "EXIT / BID" : "MARK / BID"}>₹{fmt(exit?.entry ?? mark?.entry)}</Detail><Detail label={v2 ? "PREMIUM STOP" : "UNDERLYING STOP"}>{fmt(v2 ? (mark?.stop_premium ?? exit?.stop_premium ?? entry?.stop_premium) : entry?.u_stop)}</Detail><Detail label={v2 ? "QUANTITY / LOTS" : "QUANTITY"}>{v2 ? `${fmt(entry?.quantity ?? exit?.quantity,0)} / ${fmt(entry?.lots ?? exit?.lots,0)}` : fmt(entry?.lot ?? exit?.lot,0)}</Detail></dl>
          <div className={styles.executionTimeline}><span><span className={styles.timelineDot}/>Entered <b title={text(entry?.entry_at)}>{time(entry?.time)} IST</b></span><span className={styles.timelineLine}/><span><span className={`${styles.timelineDot} ${exit ? styles.closedDot : ""}`}/>{exit ? <>Exited <b title={text(exit.exit_at)}>{time(exit.time)} IST</b></> : <b>Position open</b>}</span></div>
          {mark?.quote_at != null && !exit && <p className={styles.quoteNote}>Latest quote: {text(mark.quote_at)}</p>}
        </> : <div className={styles.standby}><div className={styles.standbyIcon}><Crosshair size={29} strokeWidth={1.2}/></div><h2>No position this session</h2><p>{cr ? "Waiting for ★T1 or ★T2 Clean-Runner breakout signals (09:20–10:35 IST) with liquid ATM options (DTE ≥ 2, spread ≤ 5%)." : osprey ? "Waiting for an Osprey confirmation, a completed next cash candle, and sufficient option quote depth." : aurum ? "Waiting for an Aurum pullback confirmation, qualifying AI score and executable option depth. Entry window 09:45–11:00 IST." : ninth ? "Waiting for a fresh Irbis candidate, measured option quotes and an exact T+5 capture. Paper simulation only." : rusty ? "Waiting for a fresh Rusty confirmed-entry label with a completed cash candle and executable option depth." : v2 ? "Waiting for a fresh, confirmed Pallas signal that meets the AI selection and execution checks." : "Entries appear here when the Kairos engine publishes a trade."}</p><span>No qualifying signal means no trade.</span></div>}
      </section>
      {cr && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label="Clean Runner execution policy">
        <div className={styles.panelHeading}><span><BrainCircuit size={16}/>Clean Runner Bot</span><span className={styles.aiBadge}>3 TRADES · 1 LOT ATM</span></div>
        <dl className={styles.tradeDetails}>
          <Detail label="SLOTS USED">{slotsUsed} / {crMaxTrades}</Detail>
          <Detail label="EXPIRY / DTE">{health?.expiry ? `${text(health.expiry)} (${text(health.dte)}d)` : "—"}</Detail>
          <Detail label="DAILY BREAKER">{health?.breaker_hit ? "TRIPPED (−₹18,000)" : "OK (−₹18,000 cap)"}</Detail>
          <Detail label="LAST 5M CUT">{text(health?.last_cut || "Pre-market")}</Detail>
        </dl>
        <div className={styles.rules}>
          <span><ShieldCheck size={13}/>★T1 & ★T2 only · 09:20–10:35 IST · chronological (tier → score)</span>
          <span><Crosshair size={13}/>1 lot ATM · DTE ≥ 2 · vol ≥ 1 lot · spread ≤ 5% · cap ≤ ₹45k/lot</span>
          <span><Activity size={13}/>SL −30% · BE at +30% → +5% floor · Trail at +60% → −25% off peak</span>
          <span><Clock3 size={13}/>Mandatory 15:15 IST EOD square-off · live Ask/Bid + NSE charges</span>
        </div>
        <p className={styles.aiNote}>Evaluated strictly on completed 5-minute Ocelot cuts (zero lookahead). Shadow Cash-PD (0.7%) logged in metadata only.</p>
        {lastDecision && <p className={styles.aiNote}>Latest decision {text(lastDecision.symbol)} · {text(lastDecision.cut)}: {text(lastDecision.reason)}</p>}
        {lastSkip && <p className={styles.aiNote}>Latest skip {text(lastSkip.name)} · {time(lastSkip.time)} IST: {text(lastSkip.reason)}</p>}
      </section>}
      {rusty && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label="Rusty selection">
        <div className={styles.panelHeading}><span><Activity size={16}/>Rusty selection</span><span className={styles.aiBadge}>OI CONFIRMED</span></div>
        <dl className={styles.tradeDetails}><Detail label="RUSTY OI CHANGE">{entry ? `${fmt(entry.rusty_pct)}%` : "—"}</Detail><Detail label="RUSTY RANK">{fmt(entry?.rusty_rank, 0)}</Detail><Detail label="CE OI CHANGE">{entry ? `${fmt(entry.ce_pct)}%` : "—"}</Detail><Detail label="PE OI CHANGE">{entry ? `${fmt(entry.pe_pct)}%` : "—"}</Detail><Detail label="CLASSIFICATION">{text(entry?.flow_label ?? entry?.flow_type)}</Detail><Detail label="CASH CANDLE">{text(entry?.candle_tier)} · {text(entry?.c_time)}</Detail></dl>
        <div className={styles.rules}><span><ShieldCheck size={13}/>Confirmed entry · high conviction · PDH/PDL break</span><span><Crosshair size={13}/>Solid / Marubozu completed cash candle</span><span><Activity size={13}/>Same-cut priority: strongest absolute Rusty OI change</span><span><ShieldCheck size={13}/>Whole lots · ₹30,000 · initial stop −15% · step trailing</span><span><Clock3 size={13}/>1 entry / day · time exit 11:30 IST</span></div>
      </section>}
      {ninth && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label="Kairos9 selection">
        <div className={styles.panelHeading}><span><BrainCircuit size={16}/>Kairos9 research model</span><span className={styles.aiBadge}>PAPER · SNAPSHOTS</span></div>
        <dl className={styles.tradeDetails}><Detail label="MODEL OUTPUT">{ai(entry?.ai_score)}</Detail><Detail label="RANKING SCORE">{fmt(entry?.selection_score,3)}</Detail></dl>
        <div className={styles.rules}><span><ShieldCheck size={13}/>Whole lots · ₹35,000 premium budget · fees extra</span><span><Crosshair size={13}/>Initial stop −10% · two-bar profit trail</span><span><Clock3 size={13}/>1 entry / day · 45-minute stagnancy · 15:20 squareoff</span></div>
        <p className={styles.aiNote}>Five-minute observed quotes. Exit ML disabled. Feature spread remains imputed. Model output is uncalibrated; this is not validated live execution.</p>
        <p className={styles.aiNote}>Entries: {text(health?.daily_entries)} · Metadata attempts: {text(health?.metadata_attempts)}{lastDecision ? ` · Latest decision ${text(lastDecision.symbol)} ${text(lastDecision.cut)}: ${text(lastDecision.reason)}` : ""}</p>
        {lastSkip && <p className={styles.aiNote}>Latest skip {text(lastSkip.name)} · {time(lastSkip.time)} IST: {text(lastSkip.reason)}</p>}
        {lastFailure && <p className={styles.aiNote}>Last failure {text(lastFailure.symbol)} · {text(lastFailure.cut)}: {text(lastFailure.reason)}</p>}
      </section>}
      {(aurum || osprey) && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label={osprey ? "Kairos 29 Osprey model selection" : "Kairos 10 Aurum AI selection"}>
        <div className={styles.panelHeading}><span><BrainCircuit size={16}/>{osprey ? "Kairos 29" : "Kairos 10"}</span><span className={styles.aiBadge}>{osprey ? "POWERED BY OSPREY" : "POWERED BY AURUM"}</span></div>
        <div className={styles.scoreArea}><div className={styles.scoreRing}><svg viewBox="0 0 110 110" aria-hidden="true"><circle className={styles.ringTrack} cx="55" cy="55" r="46"/><circle className={styles.ringValue} cx="55" cy="55" r="46" pathLength="100" strokeDasharray={`${validScore ? score*100 : 0} 100`}/></svg><div><strong>{validScore ? fmt(score*100,1) : "—"}</strong><span>AI SCORE / 100</span></div></div><div className={styles.scoreDescription}>
          <span className={styles.eyebrow}>{featured ? "SELECTED TRADE" : "ENTRY REQUIREMENT"}</span>
          <h3>{osprey ? (featured ? "Osprey-confirmed execution" : "Confirm, then wait for the next cash candle") : (featured ? "Aurum-confirmed execution" : "Pullback, then confirmation")}</h3>
          <p>{osprey ? "For candidates at the same cut, price tier takes priority, followed by model score." : featured ? "Model score recorded at confirmation." : "First eligible trade. No daily fallback."}</p>
          <span className={styles.threshold}>Minimum score <b>{fmt(modelThreshold*100,0)} / 100</b></span>
        </div></div>
        <div className={styles.rules}><span><ShieldCheck size={13}/>Whole lots · ₹30,000 budget · one-lot buffer to ₹35,000</span><span><Crosshair size={13}/>Initial stop −10% · Kairos stepped trailing</span><span><Clock3 size={13}/>{osprey ? "1 entry / day · scheduled cuts 09:40–11:00 IST" : "1 entry / day · entries 09:45–11:00 IST"}</span><span><Activity size={13}/>45-minute stagnancy · 11:30 nonrunner exit · runners to 15:29</span></div>
        <p className={styles.aiNote}>{osprey ? "The model scores completed inputs. Paper entry requires a quote received after scoring, within 90 seconds of the scheduled cut. P&L is before charges." : "AI score is a learned ranking, not a win probability. Paper fills use quoted bid/ask depth. P&L is before charges."}</p>
        {lastDecision && <p className={styles.aiNote}>Latest decision {text(lastDecision.symbol)} · {text(lastDecision.cut)}: {text(lastDecision.reason)}</p>}
        {lastSkip && <p className={styles.aiNote}>Latest skip {text(lastSkip.name)} · {time(lastSkip.time)} IST: {text(lastSkip.reason)}</p>}
        {lastFailure && <p className={styles.aiNote}>Last failure {text(lastFailure.symbol)} · {text(lastFailure.cut)}: {text(lastFailure.reason)}</p>}
      </section>}
      {v2 && !rusty && !decisionDetails && <section className={`${styles.panel} ${styles.aiPanel}`} aria-label="AI selection">
        <div className={styles.panelHeading}><span><BrainCircuit size={16}/>AI selection</span><span className={styles.aiBadge}>PALLAS AI</span></div>
        <div className={styles.scoreArea}><div className={styles.scoreRing}><svg viewBox="0 0 110 110" aria-hidden="true"><circle className={styles.ringTrack} cx="55" cy="55" r="46"/><circle className={styles.ringValue} cx="55" cy="55" r="46" pathLength="100" strokeDasharray={`${validScore ? score*100 : 0} 100`}/></svg><div><strong>{ai(score)}</strong><span>SELECTION SCORE</span></div></div><div className={styles.scoreDescription}><span className={styles.eyebrow}>{featured ? "SELECTED TRADE" : "ENTRY REQUIREMENT"}</span><h3>{featured ? "AI-filtered execution" : "Quality over quantity"}</h3><p>{featured ? "Score recorded at entry." : "First eligible signal of the day."}</p><span className={styles.threshold}>Minimum score <b>70%</b></span></div></div>
        <div className={styles.rules}><span><ShieldCheck size={13}/>Whole lots · ₹30,000 budget</span><span><Crosshair size={13}/>Initial stop −15% · step trailing</span><span><Clock3 size={13}/>1 entry / day · time exit 11:30 IST</span></div><p className={styles.aiNote}>AI score is a model ranking, not a win probability.</p>
      </section>}
    </div>
    {open.length > 0 && <section className={styles.ledger}><div className={styles.sectionHeading}><h2>Open positions <span>{open.length}</span></h2><span>QUOTED BID / ASK</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{columns.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{open.map(p=>{const e=p.entry!, m=p.mtm ?? e;return <tr key={p.sid}><td title={text(e.entry_at)}>{time(e.time)}</td><td className={styles.contract}>{text(e.name)}<small>{text(e.side)} · {text(e.expiry)}</small></td>{v2 && <td className={styles.scoreCell}>{selectionValue(e)}</td>}<td>{fmt(e.entry)}</td><td title={text(p.mtm?.quote_at)}>{fmt(p.mtm?.entry)}</td>{cr ? <><td>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td><td>{text(m.cr_state ?? "OPEN")}<small>Peak +{fmt(m.peak_gain_pct,1)}%</small></td><td>{fmt(m.stop_premium)}<small>{fmt(m.stop_pct,0)}%</small></td><td className={tone(p.mtm?.pnl)}>{p.mtm ? money(p.mtm.pnl) : "—"}</td></> : v2 ? <><td>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td><td>₹{fmt(e.capital_used,0)}</td><td>{fmt(m.stop_premium)}<small>{fmt(m.stop_pct,0)}%</small></td><td className={tone(p.mtm?.pnl)}>{p.mtm ? money(p.mtm.pnl) : "—"}</td></> : <><td className={tone(p.mtm?.pnl)}>{p.mtm ? money(p.mtm.pnl) : "—"}</td><td>{fmt(e.u_target)}</td><td>{fmt(e.u_stop)}</td><td>{fmt(e.lot,0)}</td></>}</tr>;})}</tbody></table></div></section>}
    <section className={styles.ledger}><div className={styles.sectionHeading}><h2>Execution history <span>{closed.length}</span></h2><span>{dateStr} · IST</span></div><div className={styles.tableWrap}><table className={styles.table}><thead><tr>{(cr ? ["ENTRY → EXIT","OPTION CONTRACT","TIER / SCORE","BUY / ASK","SELL / BID","CHARGES","EXIT REASON","NET P&L"] : v2 ? ["ENTRY → EXIT","OPTION CONTRACT",rusty ? "RUSTY OI" : "AI SCORE","BUY / ASK","SELL / BID","QTY / LOTS","EXIT REASON","PAPER P&L"] : ["EXIT","OPTION CONTRACT","BUY / ASK","SELL / BID","EXIT REASON","QTY","PAPER P&L"]).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{!closed.length && <tr><td colSpan={v2 ? 8 : 7} className={styles.emptyLedger}>No completed trades this session.</td></tr>}{closed.map(p=>{const e=p.exit!;return <tr key={p.sid}><td title={text(e.exit_at)}>{v2 ? `${time(p.entry?.time)} → ` : ""}{time(e.time)}</td><td className={styles.contract}>{text(e.name)}</td>{v2 && <td className={styles.scoreCell}><span>{selectionValue({...e,ai_score:e.ai_score ?? p.entry?.ai_score,cr_tier:e.cr_tier ?? p.entry?.cr_tier,cr_score:e.cr_score ?? p.entry?.cr_score})}</span></td>}<td>{fmt(e.entry_fill)}</td><td>{fmt(e.entry)}</td>{cr ? <td>₹{fmt(e.charges,0)}</td> : v2 ? <td>{fmt(e.quantity,0)} / {fmt(e.lots,0)}</td> : null}<td><span className={styles.reason}>{text(e.reason).replaceAll("_"," ")}</span></td>{!v2 && <td>{fmt(e.lot,0)}</td>}<td className={tone(e.pnl)}>{money(e.pnl)}</td></tr>;})}</tbody></table></div></section>
    {v2 && skips.length>0 && <details className={styles.skips}><summary>Skipped entries <span>{skips.length}</span></summary><ul>{skips.map((s,i)=><li key={String(s.Doc_ID ?? i)}><b>{time(s.time)}</b> · {text(s.name)} · {text(s.reason)}</li>)}</ul></details>}
    <footer className={styles.footer}><ShieldCheck size={12}/><span>{cr ? "Live Ask/Bid fills · net P&L after NSE charges · paper simulation" : `Quoted fills · gross P&L before charges${v2 ? " · paper simulation" : ""}`}</span><span>ALL TIMES IST</span></footer>
  </div>;
}
