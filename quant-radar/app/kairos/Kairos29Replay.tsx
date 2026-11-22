import replay from "./kairos29-replay.json";
import crReplay from "./kairos-cr-replay.json";
import styles from "./kairos.module.css";

type ReplayPick = {
  symbol: string;
  side: string;
  cut: string;
  entryTime: string;
  score: number;
  cashReference: number;
  mfe: number;
  mae: number;
  targetFirst: boolean;
  cleanRunner: boolean;
};

type CrReplayTrade = {
  symbol: string;
  contract: string;
  side: string;
  expiry: string;
  tier: number;
  lane: string;
  score: number;
  strikeType: string;
  lotSize: number;
  entryCut: string;
  exitCut: string;
  exitReason: string;
  entryLtp: number;
  fillEntry: number;
  exitLtp: number;
  fillExit: number;
  peakPct: number;
  retPct: number;
  capital: number;
  grossPnl: number;
  charges: number;
  netPnl: number;
  baNetPnl: number | null;
};

type CrReplaySession = {
  split: string;
  dte: number;
  netPnl: number;
  grossPnl: number;
  charges: number;
  trades: CrReplayTrade[];
};

const sessions: Record<string, { split: string; pick?: ReplayPick | null }> = replay.sessions;
const crSessions: Record<string, CrReplaySession> = (crReplay as unknown as { sessions: Record<string, CrReplaySession> }).sessions;
const crSummary = (crReplay as unknown as {
  summary: {
    sessions: number;
    trades: number;
    wins: number;
    winRatePct: number;
    profitFactor: number;
    grossPnl: number;
    charges: number;
    netPnl: number;
    maxDrawdown: number;
    greenDays: number;
  };
}).summary;
const splitLabels: Record<string, string> = {
  fit: "Fit period",
  october_validation: "October validation",
  november_replay: "November replay",
  dev: "DEV (Sep–Oct)",
  oos_november: "OOS November",
};
const formatPrice = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const fmtMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const tone = (n: number) => (n > 0 ? styles.positive : n < 0 ? styles.negative : styles.neutral);

export default function Kairos29Replay({ date }: { date: string }) {
  const session = sessions[date];
  const pick = session?.pick;
  return (
    <div className={styles.content}>
      <section className={styles.ledger} aria-labelledby="kairos29-replay-title">
        <div className={styles.sectionHeading}>
          <h2 id="kairos29-replay-title">Historical cash replay</h2>
          <span>{date} · IST{session ? ` · ${splitLabels[session.split] ?? session.split}` : ""}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col">SYMBOL</th><th scope="col">SIDE</th><th scope="col">CONFIRMATION CUT</th><th scope="col">MODELED ENTRY</th><th scope="col">CASH REFERENCE</th><th scope="col">SCORE / 100</th><th scope="col">MFE</th><th scope="col">MAE</th><th scope="col">TARGET FIRST</th><th scope="col">CLEAN 2% RUNNER</th></tr></thead>
            <tbody>{pick ? (
              <tr>
                <td className={styles.contract}>{pick.symbol}</td><td>{pick.side}</td>
                <td>{pick.cut}</td><td>{pick.entryTime}</td><td>{formatPrice.format(pick.cashReference)}</td>
                <td className={styles.scoreCell}>{(pick.score * 100).toFixed(1)}</td>
                <td>{pick.mfe.toFixed(2)}%</td><td>{pick.mae.toFixed(2)}%</td>
                <td>{pick.targetFirst ? "Yes" : "No"}</td><td>{pick.cleanRunner ? "Yes" : "No"}</td>
              </tr>
            ) : <tr><td colSpan={10} className={styles.emptyLedger}>{session ? "No qualifying pick on this date." : "No replay data for this date."}</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <p className={styles.aiNote}>This archived backtest uses the frozen fit-period model and reports underlying cash outcomes. The recorded entry time is modeled. Live paper fills use an option quote after scoring.</p>
    </div>
  );
}

export function KairosCrReplay({ date }: { date: string }) {
  const session = crSessions[date];
  const trades = session?.trades ?? [];
  return (
    <div className={styles.content}>
      <section className={styles.metrics} aria-label="Clean Runner replay summary">
        <div className={`${styles.metric} ${styles.totalMetric}`}>
          <div className={styles.metricLabel}>SESSION NET P&L <span>REPLAY</span></div>
          <div className={`${styles.metricValue} ${session ? tone(session.netPnl) : styles.neutral}`}>{session ? fmtMoney(session.netPnl) : "—"}</div>
          <div className={styles.metricNote}>{session ? `${trades.length} / 3 trades · charges ₹${Math.round(session.charges).toLocaleString("en-IN")}` : "No replay session"}</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>50-DAY NET P&L</div>
          <div className={`${styles.metricValue} ${tone(crSummary.netPnl)}`}>{fmtMoney(crSummary.netPnl)}</div>
          <div className={styles.metricNote}>{crSummary.trades} trades · {crSummary.greenDays}/{crSummary.sessions} green days</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>PROFIT FACTOR / WR</div>
          <div className={styles.metricValue}>{crSummary.profitFactor.toFixed(2)}</div>
          <div className={styles.metricNote}>{crSummary.winRatePct.toFixed(1)}% win rate ({crSummary.wins}/{crSummary.trades})</div>
        </div>
        <div className={styles.metric}>
          <div className={styles.metricLabel}>MAX DRAWDOWN</div>
          <div className={`${styles.metricValue} ${styles.negative}`}>{fmtMoney(crSummary.maxDrawdown)}</div>
          <div className={styles.metricNote}>1 lot ATM · SL −30% · BE +5% · Trail 25%</div>
        </div>
      </section>
      <section className={styles.ledger} aria-labelledby="kairos-cr-replay-title">
        <div className={styles.sectionHeading}>
          <h2 id="kairos-cr-replay-title">Historical option-LTP replay <span>{trades.length}</span></h2>
          <span>{date} · IST{session ? ` · ${splitLabels[session.split] ?? session.split} · DTE ${session.dte}` : ""}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">ENTRY → EXIT</th>
                <th scope="col">OPTION CONTRACT</th>
                <th scope="col">TIER / LANE</th>
                <th scope="col">BUY FILL</th>
                <th scope="col">SELL FILL</th>
                <th scope="col">LOT / CAP</th>
                <th scope="col">PEAK %</th>
                <th scope="col">EXIT REASON</th>
                <th scope="col">CHARGES</th>
                <th scope="col">NET P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.length > 0 ? trades.map((t) => (
                <tr key={`${t.symbol}-${t.entryCut}`}>
                  <td>{t.entryCut} → {t.exitCut}</td>
                  <td className={styles.contract}>{t.contract}<small>{t.side} · {t.expiry} · {t.strikeType}</small></td>
                  <td className={styles.scoreCell}>★T{t.tier} · {t.score.toFixed(1)}<small>{t.lane}</small></td>
                  <td>₹{t.fillEntry.toFixed(2)}</td>
                  <td>₹{t.fillExit.toFixed(2)}</td>
                  <td>{t.lotSize.toLocaleString("en-IN")}<small>₹{Math.round(t.capital).toLocaleString("en-IN")}</small></td>
                  <td>+{t.peakPct.toFixed(1)}%</td>
                  <td><span className={styles.reason}>{t.exitReason.replaceAll("_", " ")}</span></td>
                  <td>₹{Math.round(t.charges)}</td>
                  <td className={tone(t.netPnl)}>{fmtMoney(t.netPnl)}{t.baNetPnl !== null ? <small>Ask→Bid {fmtMoney(t.baNetPnl)}</small> : null}</td>
                </tr>
              )) : (
                <tr><td colSpan={10} className={styles.emptyLedger}>{session ? "No qualifying Clean-Runner trades on this date." : "No Clean-Runner replay data for this date (covered: 2026-09-07 to 2026-11-20)."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className={styles.aiNote}>Archived 50-session option-LTP replay using exact NSE lot sizes, 1% round-trip smart-limit slippage, and Indian NSE options statutory charges. Live forward-running begins 2026-11-23 using real-time Ask/Bid quotes on Ocelot 5-minute cuts.</p>
    </div>
  );
}
