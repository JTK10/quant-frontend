import replay from "./kairos29-replay.json";
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

const sessions: Record<string, { split: string; pick?: ReplayPick | null }> = replay.sessions;
const splitLabels: Record<string, string> = {
  fit: "Fit period",
  october_validation: "October validation",
  november_replay: "November replay",
};
const formatPrice = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

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
