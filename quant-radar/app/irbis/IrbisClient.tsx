'use client';

import {useEffect, useMemo, useState} from 'react';
import {Check, ExternalLink, Plus, Radar, RefreshCw} from 'lucide-react';
import {addChartWatchlistSymbol, readChartWatchlist, CHART_WATCHLIST_UPDATED_EVENT} from '@/utils/chartWatchlist';
import {buildTradingViewUrl, getTodayIstDate} from '@/utils/backend';
import type {IrbisCandidate, IrbisResponse} from '@/utils/irbis';
import './irbis.css';

type ReplaySnapshot = {date: string; asof: string; cut: string; state: string; candidates: IrbisCandidate[]};
type ReplayData = {label: string; dates: string[]; snapshots: ReplaySnapshot[]};
const cuts = ['10:00', '10:05', '10:10', '10:15'];
const setupNames: Record<string, string> = {
  ITC: 'Bull coil release', ADANI: 'Bear continuation',
  TIINDIA: 'Bull wall reclaim', HDFC: 'Bear failed rebound',
};
const fmt = (v: number | null | undefined, digits = 2) =>
  typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-IN', {maximumFractionDigits: digits, minimumFractionDigits: digits}) : '—';
const signed = (v: number | null | undefined) => v == null ? '—' : `${v > 0 ? '+' : ''}${fmt(v)}%`;
const ist = (v: string | null | undefined) => v ? new Date(v).toLocaleTimeString('en-GB', {timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit'}) : '—';

export default function IrbisClient() {
  const [mode, setMode] = useState<'live'|'research'>('live');
  const [date, setDate] = useState(getTodayIstDate);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [replayCut, setReplayCut] = useState('10:15');
  const [data, setData] = useState<IrbisResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [watch, setWatch] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [updated, setUpdated] = useState(0);

  useEffect(() => {
    const sync = () => setWatch(readChartWatchlist()); sync();
    window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync); window.addEventListener('storage', sync);
    return () => {window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync); window.removeEventListener('storage', sync);};
  }, []);
  useEffect(() => {
    fetch('/data/irbis-research.json', {cache: 'force-cache'}).then(r => {
      if (!r.ok) throw new Error('Historical replay unavailable'); return r.json();
    }).then(setReplay).catch(() => {});
  }, []);
  useEffect(() => {
    if (!notice) return; const timer = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (mode !== 'live') return;
    const syncDate = () => {const today = getTodayIstDate(); if (today !== date) {setDate(today); setData(null);}};
    const timer = setInterval(syncDate, 5000); document.addEventListener('visibilitychange', syncDate);
    return () => {clearInterval(timer); document.removeEventListener('visibilitychange', syncDate);};
  }, [mode, date]);
  useEffect(() => {
    if (mode !== 'live') return;
    let disposed = false, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(`/api/irbis?date=${encodeURIComponent(date)}`, {cache: 'no-store', signal: controller.signal});
        if (response.status === 401) {window.location.assign('/login?next=%2Firbis'); return;}
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Scanner unavailable');
        if (!disposed) {setData(body); setError(''); setUpdated(Date.now());}
      } catch (e) {
        if (!disposed && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Scanner unavailable');
      } finally {
        if (!disposed) {setLoading(false); timer = setTimeout(load, 10000);}
      }
    };
    setLoading(true); setError(''); load();
    return () => {disposed = true; controller?.abort(); clearTimeout(timer);};
  }, [mode, date]);

  const research = useMemo(() => replay?.snapshots.find(s => s.date === date && s.cut === replayCut), [replay, date, replayCut]);
  const view = mode === 'live' ? data?.date === date ? data : null : research ? {
    date, asof: `${date}T${research.asof}:00+05:30`, state: research.state,
    status: 'Saved chronological October research replay', stale: false, cut: research.cut,
    decision_time: research.asof, oi_cut: research.cut === '10:00' ? null :
      cuts[Math.max(0, cuts.indexOf(research.cut) - 1)], issued_at: null, available_at: null,
    model_id: null, recovered: false, candidates: research.candidates, total_candidates: null,
  } satisfies IrbisResponse : null;
  const candidates = view?.candidates ?? [];
  const confirmed = candidates.filter(c => c.confirmed).length;
  const latestCut = view?.cut;
  const beforeOpen = mode === 'live' && !view && loading;
  const emptyText = mode === 'research' && !replay ? 'Historical replay is loading.' :
    mode === 'research' && !research ? 'No saved research snapshot for this cut.' :
    view?.state === 'HOLIDAY' || view?.state === 'CLOSED' ? view.status :
    view?.state === 'ERROR' ? view.status :
    view?.state === 'EMPTY' ? 'No candidates passed the morning screen.' :
    beforeOpen ? 'Loading the morning scanner…' :
    error ? 'Current Irbis rankings are unavailable.' :
    'Waiting for the 10:00 shortlist.';

  const switchMode = (next: 'live'|'research') => {
    setMode(next); setDate(next === 'live' ? getTodayIstDate() : replay?.dates.at(-1) ?? '2026-10-09');
    setError(''); setData(null);
  };
  const addWatch = (symbol: string) => {setWatch(addChartWatchlistSymbol(symbol)); setNotice(`${symbol} added to Charts watchlist`);};

  return <main className="irbis">
    <header className="irbis-hero">
      <div className="irbis-title"><div className="irbis-mark"><Radar size={26}/></div><div>
        <div className="irbis-eyebrow">MORNING SCANNER / NSE F&amp;O</div>
        <h1>Irbis <span>◈</span></h1>
        <p>Frozen 10:00 model shortlist. Directional VWAP and both-leg OI re-rank through 10:15.</p>
      </div></div>
      <div className="irbis-mode" role="group" aria-label="Scanner mode">
        <button type="button" className={mode === 'live' ? 'active' : ''} onClick={() => switchMode('live')}>Live session</button>
        <button type="button" className={mode === 'research' ? 'active' : ''} onClick={() => switchMode('research')}>Historical replay</button>
      </div>
    </header>

    <section className="irbis-overview" aria-label="Session overview">
      <div><span className="label">SESSION</span><strong>{date}</strong><small>{mode === 'live' ? 'Current India session' : 'October research'}</small></div>
      <div><span className="label">LATEST CUT</span><strong>{latestCut ?? '—'}</strong><small>{latestCut ? 'IST · morning window' : 'Awaiting capture'}</small></div>
      <div><span className="label">RANKED</span><strong>{candidates.length || '—'}</strong><small>{view?.total_candidates != null ? `${view.total_candidates} frozen candidates` : 'Up to five displayed'}</small></div>
      <div><span className="label">CONFIRMED NOW</span><strong className="mint">{confirmed}</strong><small>VWAP + directional OI</small></div>
    </section>

    <section className="irbis-workspace">
      <div className="irbis-main">
        <div className="irbis-panel-head"><div><div className="irbis-eyebrow">01 / CANDIDATE DESK</div><h2>Morning ranking</h2></div>
          {mode === 'research' ? <label className="irbis-select-label">Session <select aria-label="Research session" value={date} onChange={e => setDate(e.target.value)}>{(replay?.dates ?? [date]).map(d => <option key={d} value={d}>{d}</option>)}</select></label> : <span className="irbis-live-pill"><span/> Live feed</span>}
        </div>
        {mode === 'research' && <div className="irbis-cuts" role="group" aria-label="Research replay cut">{cuts.map(cut => <button type="button" key={cut} className={replayCut === cut ? 'active' : ''} onClick={() => setReplayCut(cut)}><small>{cut === '10:00' ? 'MODEL' : 'OI + VWAP'}</small>{cut}</button>)}</div>}
        <div className={`irbis-status ${error || view?.stale || view?.state === 'ERROR' ? 'warn' : ''}`} role="status">
          <span className="status-dot"/>
          {error ? `${error}${view ? ` · Showing last successful ${ist(view.available_at)} IST capture for ${date}` : ''}` : view?.status ?? (loading ? 'Loading scanner…' : emptyText)}
          {view?.recovered && !error ? ' · recovered capture' : ''}
        </div>
        <div className="irbis-table-wrap"><table className="irbis-table"><thead><tr>
          <th>Rank / Stock</th><th>Setup</th><th>Ranking score</th><th>Price / VWAP</th><th>CE / PE OI Δ</th><th>Coverage</th><th>Signal check</th><th aria-label="Actions"/>
        </tr></thead><tbody>{candidates.map(c => <tr key={c.symbol}>
          <td><div className="irbis-symbol"><b className="rank">{String(c.rank).padStart(2, '0')}</b><div><strong>{c.symbol}</strong><small>Base rank #{c.base_rank}</small></div></div></td>
          <td><span className={`irbis-side ${c.side.toLowerCase()}`}>{c.side}</span><small>{setupNames[c.setup] ?? c.setup}</small></td>
          <td><strong>{fmt(latestCut === '10:00' ? c.score : c.rerank_score ?? c.score, 3)}</strong><small>{latestCut === '10:00' ? 'Model rank' : 'OI re-rank'} · relative only</small></td>
          <td><strong>{c.price == null ? '—' : `₹${fmt(c.price)}`}</strong><small>VWAP {c.vwap == null ? '—' : `₹${fmt(c.vwap)}`}</small></td>
          <td><span className={c.ce_change_pct != null && c.ce_change_pct >= 0 ? 'positive' : 'negative'}>{signed(c.ce_change_pct)}</span><span className="divider"> / </span><span className={c.pe_change_pct != null && c.pe_change_pct >= 0 ? 'positive' : 'negative'}>{signed(c.pe_change_pct)}</span><small>Matched five-minute change</small></td>
          <td><strong>{c.coverage == null ? '—' : `${fmt(c.coverage * 100, 0)}%`}</strong><small>Both legs</small></td>
          <td><span className={`irbis-check ${c.confirmed ? 'yes' : ''}`}>{c.confirmed ? 'Confirmed' : latestCut === '10:00' ? 'Awaiting OI' : 'Watching'}</span><small>{c.confirmed ? 'VWAP + OI aligned' : 'No current confirmation'}</small></td>
          <td><div className="irbis-actions"><button type="button" title="Add to Charts watchlist" aria-label={`Add ${c.symbol} to Charts watchlist`} disabled={watch.includes(c.symbol)} onClick={() => addWatch(c.symbol)}>{watch.includes(c.symbol) ? <Check size={15}/> : <Plus size={15}/>}</button><a href={buildTradingViewUrl(c.symbol)} target="_blank" rel="noopener noreferrer" title="Open TradingView" aria-label={`Open ${c.symbol} on TradingView`}><ExternalLink size={15}/></a></div></td>
        </tr>)}</tbody></table>{!candidates.length && <div className="irbis-empty"><Radar size={24}/><strong>{emptyText}</strong><span>Rankings appear when an eligible scanner snapshot is available.</span></div>}</div>
        <div className="irbis-table-foot"><span>As of {mode === 'research' ? research?.asof ?? '—' : ist(view?.available_at)} IST · OI cut {view?.oi_cut ?? '—'}</span><span>Score is a ranking measure, not a win probability.</span></div>
      </div>
      <aside className="irbis-aside"><div className="irbis-eyebrow">02 / PROCESS</div><h2>Morning sequence</h2>
        <ol className="irbis-timeline"><li className={latestCut ? 'done' : ''}><b>10:00</b><div><strong>Shortlist frozen</strong><span>Structural model chooses the candidate pool.</span></div></li>
          {['10:05','10:10','10:15'].map((cut, index) => <li key={cut} className={latestCut && cuts.indexOf(latestCut) >= index + 1 ? 'done' : ''}><b>{cut}</b><div><strong>{index === 2 ? 'Final morning rank' : 'OI + VWAP re-rank'}</strong><span>{index === 2 ? 'Ranking stops updating after this cut.' : 'Same frozen pool, refreshed evidence.'}</span></div></li>)}</ol>
        <div className="irbis-note"><strong>Confirmation rule</strong><p>Price must hold the directional side of VWAP while CE and PE open-interest changes align with the side. A ranked candidate can remain unconfirmed.</p></div>
        <div className="irbis-note secondary"><strong>Scanner only</strong><p>Irbis does not place trades. Historical replay uses saved chronological research snapshots and is separate from the live feed.</p></div>
        {mode === 'live' && <div className="irbis-sync"><RefreshCw size={13}/> Refreshes every 10 seconds · last checked {updated ? ist(new Date(updated).toISOString()) : '—'} IST</div>}
      </aside>
    </section>
    <div className="irbis-toast" role="status">{notice}</div>
  </main>;
}
