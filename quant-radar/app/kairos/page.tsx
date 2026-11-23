import { BrainCircuit, ChevronRight, ShieldCheck } from "lucide-react";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import KairosClient from "./KairosClient";
import Kairos29Replay, { KairosCrReplay } from "./Kairos29Replay";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl, fetchInternalApi } from "@/utils/internalApi";
import Link from "next/link";
import { compactKairosEvents, kairosSource, resolveKairosEngine, type KairosEngine, type KairosEvent } from "@/utils/kairos";
import styles from "./kairos.module.css";

export const dynamic = "force-dynamic";
const KAIROS29_LAUNCH_DATE = "2026-11-15";
const KAIROS_CR_LAUNCH_DATE = "2026-11-23";

async function getKairosEvents(dateStr: string, engine: KairosEngine) {
  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}&sources=${engine}`);
    const response = await fetchInternalApi(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Kairos route failed: ${response.status}`);
    const data: KairosEvent[] = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid Kairos response");
    // KAIROS rows: source:"kairos" -- option trades on the LYNX rank-1 pick.
    // kind: ENTRY (buy at ask) / MTM (60s mark at bid) / EXIT (sell at bid).
    // Each doc carries `mode`: "paper" or "live". The bot defaults to paper and
    // only places real orders when KAIROS_MODE=live is set on the VM, so the
    // badge below is read from the data rather than hardcoded -- a page that
    // says PAPER while the bot is armed would be the worst possible bug here.
    return {events: compactKairosEvents(data, engine), asOf: Date.now(), error: null};
  } catch (err) {
    console.error("Error fetching KAIROS events:", err);
    return {events: [] as KairosEvent[], asOf: Date.now(), error: "Unable to refresh this session. Previously received trades remain visible."};
  }
}

export default async function KairosPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const params = searchParams ? await searchParams : {};
  const engine = resolveKairosEngine(params.engine);
  const aurum = engine === "kairos10";
  const osprey = engine === "kairos29";
  const cr = engine === "kairos_cr";
  const rusty = engine === "kairos_rusty";
  const crReplay = cr && dateStr < KAIROS_CR_LAUNCH_DATE;
  const ospreyReplay = osprey && dateStr < KAIROS29_LAUNCH_DATE;
  const replay = ospreyReplay || crReplay;
  const {events, asOf, error} = replay
    ? {events: [] as KairosEvent[], asOf: 0, error: null}
    : await getKairosEvents(dateStr, engine);
  const live = events.some((e) => kairosSource(e) === engine && e.mode === "live");

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.core}><BrainCircuit size={25} strokeWidth={1.5} /></div>
          <div><div className={styles.eyebrow}>{cr ? "CLEAN RUNNER · 3 TRADES/DAY · 1 LOT ATM PAPER" : osprey ? "POWERED BY OSPREY · PAPER EXECUTION" : aurum ? "POWERED BY AURUM · AI PAPER EXECUTION" : engine === "kairos9" ? "IRBIS RICH MODEL · SNAPSHOT PAPER" : rusty ? "RUSTY OI EXECUTION" : engine === "kairos2" ? "AI POWERED EXECUTION" : "LYNX OPTIONS ENGINE"}</div><h1>Kairos <span>{cr ? "Clean Runner" : osprey ? "29" : aurum ? "10" : engine === "kairos9" ? "9" : rusty ? "Rusty" : engine === "kairos2" ? "2.0" : "Classic"}</span></h1></div>
          <span className={styles.mode}><ShieldCheck size={12} />{replay ? "REPLAY" : live ? "LIVE" : "PAPER"}</span>
        </div>
        <div className={styles.controls}><DatePicker />{!replay && <AutoRefresh interval={60000} />}</div>
      </header>
      <div className={styles.toolbar}>
      <nav className={styles.engineTabs} aria-label="Kairos engine">
        {([['kairos_cr','Clean Runner'],['kairos29','Kairos 29'],['kairos10','Kairos 10'],['kairos9','Kairos 9'],['kairos2','Kairos 2.0'],['kairos_rusty','Rusty'],['kairos','Kairos']] as const).map(([value,label]) => <Link key={value}
          href={`/kairos?engine=${value}&date=${dateStr}`} aria-current={engine === value ? "page" : undefined}
          prefetch={value === "kairos29" ? false : undefined}
          className={engine === value ? styles.selectedTab : styles.tab}>{(value === "kairos_cr" || value === "kairos29" || value === "kairos10" || value === "kairos2") && <BrainCircuit size={13} />}{value === "kairos" ? "Classic" : label}</Link>)}
      </nav>
      <div className={styles.pipeline}>{cr ? <><span>★T1/★T2 breakout</span><ChevronRight size={11}/><span>1 lot ATM (5m cuts)</span><ChevronRight size={11}/><span>SL −30% · BE +5% · Trail 25%</span></> : osprey ? <><span>Osprey confirmation</span><ChevronRight size={11}/><span>Completed cash candle</span><ChevronRight size={11}/><span>Kairos paper execution</span></> : aurum ? <><span>Aurum + pullback</span><ChevronRight size={11}/><span>AI selection</span><ChevronRight size={11}/><span>Kairos paper execution</span></> : engine === "kairos9" ? <><span>Irbis candidates</span><ChevronRight size={11}/><span>Observed 5m quotes</span><ChevronRight size={11}/><span>Paper · exit ML off</span></> : rusty ? <><span>Rusty OI</span><ChevronRight size={11}/><span>Confirmed entry</span><ChevronRight size={11}/><span>Paper execution</span></> : engine === "kairos2" ? <><span>Pallas signals</span><ChevronRight size={11}/><span>AI selection</span><ChevronRight size={11}/><span>Paper execution</span></> : <span>Lynx rank-1 · options execution</span>}</div>
      </div>
      {crReplay ? <KairosCrReplay date={dateStr} /> : ospreyReplay ? <Kairos29Replay date={dateStr} /> : <KairosClient events={events} engine={engine} dateStr={dateStr} asOf={asOf} feedError={error} />}
    </div>
  );
}

export const metadata = { title: "Kairos | Quant Radar" };
