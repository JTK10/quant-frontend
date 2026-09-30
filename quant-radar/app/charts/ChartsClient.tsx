"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, X, ExternalLink, PanelRightClose, PanelRightOpen, Layers3, List, Grid2X2, Square, Columns2 } from "lucide-react";
import { findChartSymbols, resolveChartSymbol } from "./chartSymbols";
import LiveCandleChart, { type Timeframe } from "./LiveCandleChart";
import { useOIData } from "./useOIData";
import type { OISnapshot } from "./oiTypes";
import { buildTradingViewUrl, getTodayIstDate } from "@/utils/backend";
import { CHART_WATCHLIST_STORAGE_KEY, CHART_WATCHLIST_UPDATED_EVENT, getStoredChartWatchlist, readChartWatchlist, writeChartWatchlist } from "@/utils/chartWatchlist";
import "./charts.css";

const DEFAULTS = ["RELIANCE", "NIFTY 50", "HDFCBANK", "INDIA VIX"];
const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "1D"];
type Layout = 1 | 2 | 4;
type Panel = { symbol: string; timeframe: Timeframe };
const price = (v: number) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const oi = (v: number) => Math.abs(v) >= 10000000 ? `${(v / 10000000).toFixed(2)} Cr` : Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(2)} L` : price(v);

function LevelCard({ snap, previous = false }: { snap: OISnapshot; previous?: boolean }) {
  return <section className="oi-session"><div className="oi-session-title"><b>{previous ? snap.date : "Intraday"}</b><span>{snap.cut} IST{snap.degraded ? " · Partial" : ""}</span></div><div className="oi-expiry">Expiry {snap.expiry} · Spot ₹{price(snap.spot)}</div>{([['resistance', 'CE resistance'], ['support', 'PE support']] as const).map(([key, label]) => <div className={`oi-wall-group ${key}`} key={key}><small>{label}</small>{snap[key].length ? snap[key].map((wall, i) => <div className="oi-wall" key={wall[0]}><b>{i + 1}. ₹{price(wall[0])}</b><span>{oi(wall[1])} OI</span><em title="Change from provider previous-session OI">{wall[2] == null ? "—" : `${wall[2] >= 0 ? "+" : ""}${oi(wall[2])}`}</em></div>) : <p>No wall within 6% of spot</p>}</div>)}</section>;
}
function WorkspacePanel({ panel, streamUrl, date, showOI, showPrevious, compact, onQuote }: { panel: Panel; streamUrl: string; date: string; showOI: boolean; showPrevious: boolean; compact: boolean; onQuote: (symbol: string, value: number) => void }) {
  const { data, loading, error } = useOIData(panel.symbol, date);
  const latest = data?.intraday.at(-1);
  return <><div className="chart-panel-heading"><strong>{panel.symbol}</strong><span>NSE · {panel.timeframe}</span><span className="oi-freshness">{loading ? "Loading OI…" : latest ? `OI ${latest.cut}${latest.degraded ? " · Partial" : ""}` : error ? "OI unavailable" : "No OI coverage"}</span></div><div className="chart-canvas"><LiveCandleChart symbol={panel.symbol} streamUrl={streamUrl} timeframe={panel.timeframe} compact={compact} oiData={data} showOI={showOI} showPreviousOI={showPrevious} sessionDate={date} onQuote={onQuote} /></div></>;
}
function OIDetails({ symbol, date }: { symbol: string; date: string }) {
  const { data, loading, error } = useOIData(symbol, date);
  const latest = data?.intraday.at(-1);
  return <div className="oi-details"><div className="sidebar-heading"><Layers3 size={15}/><b>OI price zones</b></div><p className="oi-intro">Largest PE OI below spot · Largest CE OI above spot. Two levels per side within 6% of price.</p>{loading && !data ? <div className="chart-empty">Loading option positions…</div> : <>{error && <p className="oi-error">{error}</p>}{latest ? <LevelCard snap={latest}/> : <div className="chart-empty">No strike OI available for {symbol} on {date}.</div>}<div className="oi-history-label">Previous sessions</div>{data?.previous.length ? data.previous.map(s => <LevelCard key={s.date} snap={s} previous/>) : <p className="oi-intro">No previous-session OI available.</p>}</>}<p className="oi-footnote">Solid: intraday OI as observed. Dashed: previous-session levels. OI zones are potential support/resistance. Δ OI uses the provider’s previous-session baseline. Expiries are labelled separately.</p></div>;
}
export default function ChartsClient({ streamUrl, initialSymbol }: { streamUrl: string; initialSymbol?: string }) {
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
  const [date, setDate] = useState(getTodayIstDate);
  const [showOI, setShowOI] = useState(true);
  const [showPrevious, setShowPrevious] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const selected = panels[active];
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
  const update = (patch: Partial<Panel>) => setPanels(p => p.map((x, i) => i === active ? { ...x, ...patch } : x));
  const choose = (symbol: string) => { update({ symbol }); setDraft(symbol); setSearching(false); };
  const saveWatchlist = (next: string[]) => { setWatchlist(next); writeChartWatchlist(next); };
  return <div className="charts-workspace">
    <header className="charts-toolbar"><form className="charts-search" onSubmit={e => { e.preventDefault(); const found = resolveChartSymbol(draft); if (found) choose(found.symbol); else setSearching(true); }}><Search size={16}/><input aria-label="Chart symbol" value={draft} onFocus={() => setSearching(true)} onBlur={() => setTimeout(() => setSearching(false), 150)} onChange={e => { setDraft(e.target.value.toUpperCase()); setSearching(true); }}/><small>NSE</small>{searching && <div className="chart-suggestions">{matches.length ? matches.map(m => <button type="button" key={m.symbol} onMouseDown={e => e.preventDefault()} onClick={() => choose(m.symbol)}><b>{m.symbol}</b><span>{m.name}</span></button>) : <p>No matching symbol</p>}</div>}</form><div className="chart-timeframes">{TIMEFRAMES.map(t => <button key={t} className={selected.timeframe === t ? "active" : ""} onClick={() => update({ timeframe: t })}>{t}</button>)}</div><div className="chart-layouts">{([1, 2, 4] as Layout[]).map(n => { const Icon = n === 1 ? Square : n === 2 ? Columns2 : Grid2X2; return <button key={n} title={`${n} chart${n > 1 ? 's' : ''}`} aria-label={`${n} chart layout`} className={layout === n ? "active" : ""} onClick={() => { setLayout(n); setActive(i => Math.min(i, n - 1)); }}><Icon size={16}/></button>; })}</div><a className="chart-tv" href={buildTradingViewUrl(selected.symbol, selected.symbol)} target="_blank" rel="noopener noreferrer" title="Open TradingView"><ExternalLink size={16}/></a><button className="chart-sidebar-toggle" aria-label="Toggle watchlist and OI panel" onClick={() => setRightOpen(!rightOpen)}>{rightOpen ? <PanelRightClose size={18}/> : <PanelRightOpen size={18}/>}</button></header>
    <div className="charts-indicatorbar"><span className="charts-workspace-label">CHART WORKSPACE</span><button className={showOI ? "active" : ""} onClick={() => setShowOI(!showOI)}><span className="line-key today"/>Intraday OI</button><button className={showPrevious ? "active" : ""} onClick={() => setShowPrevious(!showPrevious)}><span className="line-key prior"/>Previous OI</button><label>Session <input aria-label="Chart session" type="date" value={date} max={getTodayIstDate()} onChange={e => { if (e.target.value) setDate(e.target.value); }}/></label></div>
    <div className="charts-body"><div className={`charts-grid layout-${layout}`}>{panels.slice(0, layout).map((panel, i) => <article key={i} className={`chart-panel ${active === i ? "selected" : ""}`} onClick={() => { setActive(i); if (active !== i) setDraft(panel.symbol); }}><WorkspacePanel panel={panel} streamUrl={streamUrl} date={date} showOI={showOI} showPrevious={showPrevious} compact={layout > 1} onQuote={onQuote}/></article>)}</div>{rightOpen && <aside className="charts-sidebar"><div className="charts-sidebar-tabs"><button className={tab === "watchlist" ? "active" : ""} onClick={() => setTab("watchlist")}><List size={14}/>Watchlist <small>{watchlist.length}</small></button><button className={tab === "oi" ? "active" : ""} onClick={() => setTab("oi")}><Layers3 size={14}/>OI levels</button></div>{tab === "oi" ? <OIDetails symbol={selected.symbol} date={date}/> : <><div className="watchlist-actions"><span>YOUR SYMBOLS</span><button onClick={() => setAdding(!adding)} title="Add symbol" aria-label="Add watchlist symbol"><Plus size={16}/></button></div>{adding && <div className="watchlist-search"><input placeholder="Search to add…" aria-label="Add watchlist symbol search" value={wlDraft} onChange={e => setWlDraft(e.target.value.toUpperCase())}/><div className="watchlist-matches">{wlMatches.map(m => <button key={m.symbol} onClick={() => { saveWatchlist([...new Set([...watchlist, m.symbol])]); setAdding(false); setWlDraft(""); }}>{m.symbol}<Plus size={12}/></button>)}</div></div>}<div className="watchlist-head"><span>Symbol</span><span>Last received</span></div><div className="watchlist-rows">{watchlist.map(s => <div key={s} className={`watchlist-row ${s === selected.symbol ? "active" : ""}`}><button onClick={() => choose(s)}><b>{s}</b><span>{quotes[s] ? price(quotes[s]) : "—"}</span></button><button aria-label={`Remove ${s} from watchlist`} onClick={() => saveWatchlist(watchlist.filter(x => x !== s))}><X size={13}/></button></div>)}{!watchlist.length && <p className="chart-empty">Add stocks here or with + on Rusty.</p>}</div><p className="oi-footnote">Prices appear when a symbol’s chart receives candles. Watchlist is shared with Rusty and Jaguar.</p></>}</aside>}</div><footer className="charts-footer"><span>5-minute source candles · NSE · IST</span><span>OI zones: PE support <i className="support-dot"/> CE resistance <i className="resistance-dot"/></span><span>Powered by TradingView Lightweight Charts™</span></footer>
  </div>;
}
