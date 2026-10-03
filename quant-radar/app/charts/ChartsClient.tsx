"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, X, ExternalLink, PanelRightClose, PanelRightOpen, Layers3, List, Grid2X2, Square, Columns2 } from "lucide-react";
import { findChartSymbols, resolveChartSymbol } from "./chartSymbols";
import LiveCandleChart, { type Timeframe, type ChartBar } from "./LiveCandleChart";
import { useOIData } from "./useOIData";
import type { OIData, OISnapshot } from "./oiTypes";
import { buildTradingViewUrl, getTodayIstDate } from "@/utils/backend";
import { CHART_WATCHLIST_STORAGE_KEY, CHART_WATCHLIST_UPDATED_EVENT, getStoredChartWatchlist, readChartWatchlist, writeChartWatchlist } from "@/utils/chartWatchlist";
import "./charts.css";
import NIFTY_REPLAY_DATES from "./niftyReplayDates.json";

const DEFAULTS = ["RELIANCE", "NIFTY 50", "HDFCBANK", "INDIA VIX"];
const REPLAY_TIMES = Array.from({length:75},(_,i)=>{const m=560+i*5;return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;});
const EMPTY_HISTORY: ChartBar[] = [];
const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "1D"];
type Layout = 1 | 2 | 4;
type Panel = { symbol: string; timeframe: Timeframe };
const price = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const oi = (v: number) => Math.abs(v) >= 10000000 ? `${(v / 10000000).toFixed(2)} Cr` : Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(2)} L` : price(v);
function filterOIDate(data: OIData | null, choice: string): OIData | null {
  if (!data) return null;
  const available = [...data.intraday, ...data.previous].map(s => s.date).sort().reverse();
  const selectedDate = choice === "latest" ? available[0] : choice;
  return {...data, intraday:data.intraday.filter(s=>s.date === selectedDate), previous:data.previous.filter(s=>s.date === selectedDate)};
}

function LevelCard({ snap, previous = false }: { snap: OISnapshot; previous?: boolean }) {
  return <section className="oi-session"><div className="oi-session-title"><b>{previous ? snap.date : "Intraday"}</b><span>{snap.cut} IST{snap.degraded ? " · Partial" : ""}</span></div><div className="oi-expiry">Expiry {snap.expiry} · Spot ₹{price(snap.spot)}</div>{([['resistance', 'CE resistance'], ['support', 'PE support']] as const).map(([key, label]) => <div className={`oi-wall-group ${key}`} key={key}><small>{label}</small>{snap[key].length ? snap[key].map((wall, i) => <div className="oi-wall" key={wall[0]}><b>{i + 1}. ₹{price(wall[0])}</b><span>{oi(wall[1])} OI</span><em title="Change from provider previous-session OI">{wall[2] == null ? "—" : `${wall[2] >= 0 ? "+" : ""}${oi(wall[2])}`}</em></div>) : <p>No nearby wall</p>}</div>)}</section>;
}
function WorkspacePanel({ panel, streamUrl, date, showPrevious, compact, onQuote, cut, oiDate }: { oiDate: string; cut: string; panel: Panel; streamUrl: string; date: string; showPrevious: boolean; compact: boolean; onQuote: (symbol: string, value: number) => void }) {
  const { data, loading, error } = useOIData(panel.symbol, date);
  const [history, setHistory] = useState<{key:string; bars:ChartBar[]}>({key:"",bars:EMPTY_HISTORY});
  const historyKey = panel.symbol + "|" + date;
  const bars = history.key === historyKey ? history.bars : EMPTY_HISTORY;
  useEffect(() => { const controller = new AbortController();
    if (panel.symbol === "NIFTY 50" && NIFTY_REPLAY_DATES.includes(date)) fetch('/api/chart-history?symbol='+encodeURIComponent(panel.symbol)+'&date='+date, {signal:controller.signal}).then(r=>r.ok ? r.json() : Promise.reject()).then(r=>{if(!controller.signal.aborted)setHistory({key:historyKey,bars:r.bars ?? EMPTY_HISTORY});}).catch(()=>{});
    return ()=>controller.abort();
  }, [panel.symbol, date, historyKey]);
  const asOf = panel.symbol === "NIFTY 50" && NIFTY_REPLAY_DATES.includes(date) ? Date.parse(date+'T'+cut+':00+05:30')/1000 : undefined;
  const filtered = useMemo(() => filterOIDate(data,oiDate), [data,oiDate]);
  const latest = filtered?.intraday.filter(s => !asOf || s.time <= asOf).at(-1) ?? filtered?.previous[0];
  return <><div className="chart-panel-heading"><strong>{panel.symbol}</strong><span>NSE · {panel.timeframe}</span><span className="oi-freshness">{loading ? "Loading OI…" : latest ? `OI ${latest.date} · ${latest.cut}${latest.degraded ? " · Partial" : ""}` : error ? "OI unavailable" : "No OI coverage"}</span></div><div className="chart-canvas"><LiveCandleChart symbol={panel.symbol} streamUrl={streamUrl} timeframe={panel.timeframe} compact={compact} initialBars={bars} asOf={asOf} oiData={showPrevious ? filtered : null} showPreviousOI={showPrevious} sessionDate={date} onQuote={onQuote} /></div></>;
}
function OIDetails({ symbol, date, cut, oiDate }: { oiDate: string; symbol: string; date: string; cut: string }) {
  const { data: allData, loading, error } = useOIData(symbol, date);
  const data = filterOIDate(allData,oiDate);
  return <div className="oi-details"><div className="sidebar-heading"><Layers3 size={15}/><b>OI support / resistance</b></div><p className="oi-intro">Largest PE OI below the previous snapshot’s spot · Largest CE OI above it. Two levels per side. Nifty uses the fixed 200-point nearby window; equities use 6%.</p>{loading && !data ? <div className="chart-empty">Loading previous option positions…</div> : <>{error && <p className="oi-error">{error}</p>}{data?.intraday.filter(s => s.cut <= cut).slice(-1).map(s => <LevelCard key={s.cut} snap={s}/>)}{data?.previous.length ? data.previous.map(s => <LevelCard key={s.date} snap={s} previous/>) : <div className="chart-empty">No previous-session OI available for {symbol} before {date}.</div>}</>}<p className="oi-footnote">Solid purple: previous PE support. Solid orange: previous CE resistance. Nifty intraday lines change only at each available snapshot. Replay candles stop at the selected cut. Previous levels use only earlier sessions. Expired contracts remain in historical details only. OI zones are potential support/resistance. Δ OI uses the provider’s previous-session baseline.</p></div>;
}
export default function ChartsClient({ streamUrl, initialSymbol, initialDate }: { streamUrl: string; initialSymbol?: string; initialDate?: string }) {
  const initial = resolveChartSymbol(initialSymbol ?? "")?.symbol ?? "RELIANCE";
  const [layout, setLayout] = useState<Layout>(1);
  const [active, setActive] = useState(0);
  const [panels, setPanels] = useState<Panel[]>(() => DEFAULTS.map((symbol, i) => ({ symbol: i ? symbol : initial, timeframe: "5m" })));
  const [draft, setDraft] = useState(initial);
  const [searching, setSearching] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [tab, setTab] = useState<"watchlist" | "oi">("oi");
  const [watchlist, setWatchlist] = useState(DEFAULTS);
  const [adding, setAdding] = useState(false);
  const [wlDraft, setWlDraft] = useState("");
  const [date, setDate] = useState(() => initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : getTodayIstDate());
  const [cut, setCut] = useState("09:20");
  const [showPrevious, setShowPrevious] = useState(true);
  const [oiChoice, setOiChoice] = useState({key:"",date:"latest"});
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const selected = panels[active];
  const selectionKey = selected.symbol + "|" + date;
  const oiDate = oiChoice.key === selectionKey ? oiChoice.date : "latest";
  const {data: selectedOI} = useOIData(selected.symbol,date);
  const oiDates = [...new Set([...(selectedOI?.intraday ?? []), ...(selectedOI?.previous ?? [])].map(s=>s.date))].sort().reverse();
  const matches = useMemo(() => findChartSymbols(draft).slice(0, 8), [draft]);
  const wlMatches = useMemo(() => findChartSymbols(wlDraft).slice(0, 8), [wlDraft]);
  const onQuote = useCallback((symbol: string, value: number) => setQuotes(q => q[symbol] === value ? q : { ...q, [symbol]: value }), []);
  useEffect(() => {
    const sync = () => setWatchlist(readChartWatchlist(DEFAULTS));
    const storage = (e: StorageEvent) => { if (e.key === CHART_WATCHLIST_STORAGE_KEY || e.key === null) sync(); };
    if (getStoredChartWatchlist() === null) writeChartWatchlist(DEFAULTS);
    sync(); window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync); window.addEventListener("storage", storage);
    return () => { window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);
  useEffect(() => {
    const symbol = resolveChartSymbol(initialSymbol ?? "")?.symbol ?? "RELIANCE";
    const frame = requestAnimationFrame(() => { setPanels(p => p.map((x, i) => i ? x : { ...x, symbol })); setActive(0); setDraft(symbol); });
    return () => cancelAnimationFrame(frame);
  }, [initialSymbol]);
  const changeSession = (value: string) => { if (value) { setDate(value); setCut("09:20"); } };
  const update = (patch: Partial<Panel>) => setPanels(p => p.map((x, i) => i === active ? { ...x, ...patch } : x));
  const choose = (symbol: string) => { update({ symbol }); setDraft(symbol); setSearching(false); };
  const saveWatchlist = (next: string[]) => { setWatchlist(next); writeChartWatchlist(next); };
  return <div className="charts-workspace">
    <header className="charts-toolbar"><form className="charts-search" onSubmit={e => { e.preventDefault(); const found = resolveChartSymbol(draft); if (found) choose(found.symbol); else setSearching(true); }}><Search size={16}/><input aria-label="Chart symbol" value={draft} onFocus={() => setSearching(true)} onBlur={() => setTimeout(() => setSearching(false), 150)} onChange={e => { setDraft(e.target.value.toUpperCase()); setSearching(true); }}/><small>NSE</small>{searching && <div className="chart-suggestions">{matches.length ? matches.map(m => <button type="button" key={m.symbol} onMouseDown={e => e.preventDefault()} onClick={() => choose(m.symbol)}><b>{m.symbol}</b><span>{m.name}</span></button>) : <p>No matching symbol</p>}</div>}</form><div className="chart-timeframes">{TIMEFRAMES.map(t => <button key={t} className={selected.timeframe === t ? "active" : ""} onClick={() => update({ timeframe: t })}>{t}</button>)}</div><div className="chart-layouts">{([1, 2, 4] as Layout[]).map(n => { const Icon = n === 1 ? Square : n === 2 ? Columns2 : Grid2X2; return <button key={n} title={`${n} chart${n > 1 ? 's' : ''}`} aria-label={`${n} chart layout`} className={layout === n ? "active" : ""} onClick={() => { setLayout(n); setActive(i => Math.min(i, n - 1)); }}><Icon size={16}/></button>; })}</div><a className="chart-tv" href={buildTradingViewUrl(selected.symbol, selected.symbol)} target="_blank" rel="noopener noreferrer" title="Open TradingView"><ExternalLink size={16}/></a><button className="chart-sidebar-toggle" aria-label="Toggle watchlist and OI panel" onClick={() => setRightOpen(!rightOpen)}>{rightOpen ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button></header>
    <div className="charts-indicatorbar"><span className="charts-workspace-label">CHART WORKSPACE</span><button className={showPrevious ? "active" : ""} onClick={() => setShowPrevious(!showPrevious)}><span className="line-key prior"/>OI lines</button><label>Session <input aria-label="Chart session" type="date" value={date} max={getTodayIstDate()} onInput={e => changeSession(e.currentTarget.value)} onChange={e => changeSession(e.target.value)}/></label>{selected.symbol === "NIFTY 50" && <label>Downloaded session <select aria-label="Downloaded Nifty session" value={NIFTY_REPLAY_DATES.includes(date) ? date : ""} onChange={e=>changeSession(e.target.value)}><option value="" disabled>Choose a session</option>{NIFTY_REPLAY_DATES.map(d=><option key={d} value={d}>{d}</option>)}</select></label>}<label>OI date <select aria-label="OI line date" value={oiDate} onChange={e=>setOiChoice({key:selectionKey,date:e.target.value})}><option value="latest">Latest available{oiDates[0] ? ` · ${oiDates[0]}` : ""}</option>{oiDates.map(d=><option key={d} value={d}>{d}</option>)}</select></label></div>
    {selected.symbol === "NIFTY 50" && NIFTY_REPLAY_DATES.includes(date) && <div className="charts-replaybar"><strong>Historical replay</strong><button aria-label="Previous replay candle" disabled={cut === REPLAY_TIMES[0]} onClick={()=>setCut(REPLAY_TIMES[Math.max(0,REPLAY_TIMES.indexOf(cut)-1)])}>◀</button><select aria-label="Historical replay time" value={cut} onChange={e=>setCut(e.target.value)}>{REPLAY_TIMES.map(t=><option key={t} value={t}>{t} IST{t === "15:30" ? " · EOD" : ""}</option>)}</select><button aria-label="Next replay candle" disabled={cut === REPLAY_TIMES.at(-1)} onClick={()=>setCut(REPLAY_TIMES[Math.min(74,REPLAY_TIMES.indexOf(cut)+1)])}>▶</button><input aria-label="Historical replay slider" type="range" min="0" max="74" value={REPLAY_TIMES.indexOf(cut)} onChange={e=>setCut(REPLAY_TIMES[Number(e.target.value)])}/><span>{REPLAY_TIMES.indexOf(cut)+1}/75 completed candles · later data hidden</span></div>}
    <div className="charts-body"><div className={`charts-grid layout-${layout}`}>{panels.slice(0, layout).map((panel, i) => <article key={i} className={`chart-panel ${active === i ? "selected" : ""}`} onClick={() => { setActive(i); if (active !== i) setDraft(panel.symbol); }}><WorkspacePanel panel={panel} oiDate={oiDate} cut={cut} streamUrl={streamUrl} date={date} showPrevious={showPrevious} compact={layout > 1} onQuote={onQuote}/></article>)}</div>{rightOpen && <aside className="charts-sidebar"><div className="charts-sidebar-tabs"><button className={tab === "watchlist" ? "active" : ""} onClick={() => setTab("watchlist")}><List size={14}/>Watchlist <small>{watchlist.length}</small></button><button className={tab === "oi" ? "active" : ""} onClick={() => setTab("oi")}><Layers3 size={14}/>OI levels</button></div>{tab === "oi" ? <OIDetails oiDate={oiDate} symbol={selected.symbol} date={date} cut={cut}/> : <><div className="watchlist-actions"><span>YOUR SYMBOLS</span><button onClick={() => setAdding(!adding)} title="Add symbol" aria-label="Add watchlist symbol"><Plus size={16}/></button></div>{adding && <div className="watchlist-search"><input placeholder="Search to add…" aria-label="Add watchlist symbol search" value={wlDraft} onChange={e => setWlDraft(e.target.value.toUpperCase())}/><div className="watchlist-matches">{wlMatches.map(m => <button key={m.symbol} onClick={() => { saveWatchlist([...new Set([...watchlist, m.symbol])]); setAdding(false); setWlDraft(""); }}>{m.symbol}<Plus size={12}/></button>)}</div></div>}<div className="watchlist-head"><span>Symbol</span><span>Last received</span></div><div className="watchlist-rows">{watchlist.map(s => <div key={s} className={`watchlist-row ${s === selected.symbol ? "active" : ""}`}><button onClick={() => choose(s)}><b>{s}</b><span>{quotes[s] ? price(quotes[s]) : "—"}</span></button><button aria-label={`Remove ${s} from watchlist`} onClick={() => saveWatchlist(watchlist.filter(x => x !== s))}><X size={13}/></button></div>)}{!watchlist.length && <p className="chart-empty">Add stocks here or with + on Rusty.</p>}</div><p className="oi-footnote">Prices appear when a symbol’s chart receives candles. Watchlist is shared with Rusty.</p></>}</aside>}</div><footer className="charts-footer"><span>5-minute source candles · NSE · IST</span><span>OI zones: PE support <i className="support-dot"/> CE resistance <i className="resistance-dot"/></span><span>Powered by TradingView Lightweight Charts™</span></footer>
  </div>;
}
