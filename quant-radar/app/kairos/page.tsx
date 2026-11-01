import { BrainCircuit, ChevronRight, ShieldCheck } from "lucide-react";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import KairosClient from "./KairosClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";
import { getInternalApiUrl, fetchInternalApi } from "@/utils/internalApi";
import Link from "next/link";
import { compactKairosEvents, kairosSource, resolveKairosEngine, type KairosEngine, type KairosEvent } from "@/utils/kairos";
import styles from "./kairos.module.css";

export const dynamic = "force-dynamic";

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
  const rusty = engine === "kairos_rusty";
  const {events, asOf, error} = await getKairosEvents(dateStr, engine);
  const live = events.some((e) => kairosSource(e) === engine && e.mode === "live");

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.core}><BrainCircuit size={25} strokeWidth={1.5} /></div>
          <div><div className={styles.eyebrow}>{aurum ? "POWERED BY AURUM · AI PAPER EXECUTION" : engine === "kairos9" ? "IRBIS RICH MODEL · SNAPSHOT PAPER" : rusty ? "RUSTY OI EXECUTION" : engine === "kairos2" ? "AI POWERED EXECUTION" : "LYNX OPTIONS ENGINE"}</div><h1>Kairos <span>{aurum ? "10" : engine === "kairos9" ? "9" : rusty ? "Rusty" : engine === "kairos2" ? "2.0" : "Classic"}</span></h1></div>
          <span className={styles.mode}><ShieldCheck size={12} />{live ? "LIVE" : "PAPER"}</span>
        </div>
        <div className={styles.controls}><DatePicker /><AutoRefresh interval={60000} /></div>
      </header>
      <div className={styles.toolbar}>
      <nav className={styles.engineTabs} aria-label="Kairos engine">
        {([['kairos10','Kairos 10'],['kairos9','Kairos 9'],['kairos2','Kairos 2.0'],['kairos_rusty','Rusty'],['kairos','Kairos']] as const).map(([value,label]) => <Link key={value}
          href={`/kairos?engine=${value}&date=${dateStr}`} aria-current={engine === value ? "page" : undefined}
          className={engine === value ? styles.selectedTab : styles.tab}>{(value === "kairos10" || value === "kairos2") && <BrainCircuit size={13} />}{value === "kairos" ? "Classic" : label}</Link>)}
      </nav>
      <div className={styles.pipeline}>{aurum ? <><span>Aurum + pullback</span><ChevronRight size={11}/><span>AI selection</span><ChevronRight size={11}/><span>Kairos paper execution</span></> : engine === "kairos9" ? <><span>Irbis candidates</span><ChevronRight size={11}/><span>Observed 5m quotes</span><ChevronRight size={11}/><span>Paper · exit ML off</span></> : rusty ? <><span>Rusty OI</span><ChevronRight size={11}/><span>Confirmed entry</span><ChevronRight size={11}/><span>Paper execution</span></> : engine === "kairos2" ? <><span>Pallas signals</span><ChevronRight size={11}/><span>AI selection</span><ChevronRight size={11}/><span>Paper execution</span></> : <span>Lynx rank-1 · options execution</span>}</div>
      </div>
      <KairosClient events={events} engine={engine} dateStr={dateStr} asOf={asOf} feedError={error} />
    </div>
  );
}
