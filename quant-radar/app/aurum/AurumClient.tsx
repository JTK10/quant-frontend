'use client';

import {useEffect, useMemo, useState} from 'react';
import {ArrowDownUp, ArrowDown, ArrowUp, Check, Download, ExternalLink, Gem, Plus, Search} from 'lucide-react';
import {buildTradingViewUrl} from '@/utils/backend';
import {addChartWatchlistSymbol, readChartWatchlist, CHART_WATCHLIST_STORAGE_KEY, CHART_WATCHLIST_UPDATED_EVENT} from '@/utils/chartWatchlist';
import {istSessionDate} from '@/utils/sessionPolling';
import {createAurumFeed, preserveAurumBoard, AURUM_CUTS, aurumRowsAtCut} from './feed';
import type {AurumResponse, AurumSignal} from './types';
import './aurum.css';

type SortKey = 'symbol' | 'signal_time' | 'entry' | 'ce_pct' | 'pe_pct' | 'oi_bias' | 'view' | 'bar_rvol' | 'cum_rvol' | 'pullback_confirmed';
const number = (n: number | null | undefined, digits = 2) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-IN', {minimumFractionDigits: digits, maximumFractionDigits: digits}) : '—';
const percent = (n: number | null | undefined) => typeof n === 'number' && Number.isFinite(n) ? `${n > 0 ? '+' : ''}${number(n)}%` : '—';
const clock = (value: string | null | undefined) => {
  if (!value) return '—';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-GB', {timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false});
};
const flow = (row: AurumSignal) => row.view?.trim() || 'Unavailable';

export default function AurumClient({initialDate}: {initialDate?: string}) {
  const [mode, setMode] = useState<'live' | 'history'>(initialDate ? 'history' : 'live');
  const [date, setDate] = useState(initialDate ?? istSessionDate);
  const [data, setData] = useState<AurumResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState('ALL');
  const [view, setView] = useState('ALL');
  const [pullback, setPullback] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('signal_time');
  const [descending, setDescending] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [cut, setCut] = useState('latest');
  const requestedDate = mode === 'history' ? date : null;

  useEffect(() => {
    const sync = () => setWatchlist(readChartWatchlist());
    const storage = (event: StorageEvent) => {if (event.key === null || event.key === CHART_WATCHLIST_STORAGE_KEY) sync();};
    sync(); window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync); window.addEventListener('storage', storage);
    return () => {window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync); window.removeEventListener('storage', storage);};
  }, []);
  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(''), 2500); return () => clearTimeout(timer);}, [notice]);
  useEffect(() => {
    const feed = createAurumFeed({date: requestedDate ?? istSessionDate(), live: mode === 'live', now: Date.now, hidden: () => document.hidden,
      setTimer: setTimeout, clearTimer: clearTimeout,
      read: async (session, signal) => {
        const response = await fetch(`/api/aurum?${new URLSearchParams({date: session})}`, {cache: 'default', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])});
        if (response.status === 401) {window.location.assign(`/login?next=${encodeURIComponent('/aurum')}`); throw new Error('Session expired');}
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Aurum feed unavailable');
        if (!body || body.source !== 'aurum' || body.date !== session || !Array.isArray(body.signals) || body.signals.length > 250 ||
          body.signals.some((row: AurumSignal) => !row || typeof row.symbol !== 'string' || !['BULL', 'BEAR'].includes(row.side))) throw new Error('Invalid Aurum session board');
        return body as AurumResponse;
      },
      onReset: session => {setDate(session); setData(null); setError(''); setLoading(true); setCut('latest');},
      onData: board => {setData(previous => preserveAurumBoard(previous, board)); setError('');},
      onError: message => setError(message), onSettled: () => setLoading(false),
    });
    document.addEventListener('visibilitychange', feed.visibility);
    return () => {feed.stop(); document.removeEventListener('visibilitychange', feed.visibility);};
  }, [requestedDate, mode]);

  const board = data?.date === date ? data : null;
  const rows = useMemo(() => aurumRowsAtCut(board,cut), [board,cut]);
  const historicalEnd = board?.mode==='historical'&&board?.coverage?.window_end ? board.coverage.window_end : '11:30';
  const cuts = AURUM_CUTS.filter(value=>value<=historicalEnd);
  const views = useMemo(() => [...new Set(rows.map(flow))].sort(), [rows]);
  const visible = useMemo(() => rows.filter(row => (side === 'ALL' || row.side === side) &&
    (view === 'ALL' || flow(row) === view) && (!pullback || row.pullback_confirmed === true) &&
    row.symbol.toUpperCase().includes(query.trim().toUpperCase())).sort((a, b) => {
      const x = sort === 'view' ? flow(a) : sort === 'entry' ? a.entry ?? a.reference_price : a[sort];
      const y = sort === 'view' ? flow(b) : sort === 'entry' ? b.entry ?? b.reference_price : b[sort];
      if (x == null) return y == null ? a.symbol.localeCompare(b.symbol) : 1;
      if (y == null) return -1;
      const compare = typeof x === 'number' && typeof y === 'number' ? x - y : typeof x === 'boolean' && typeof y === 'boolean' ? Number(x) - Number(y) : String(x).localeCompare(String(y));
      return (descending ? -compare : compare) || a.symbol.localeCompare(b.symbol);
    }), [rows, side, view, pullback, query, sort, descending]);
  const bulls = rows.filter(row => row.side === 'BULL').length;
  const bears = rows.filter(row => row.side === 'BEAR').length;
  const stale = !!error || !!board?.stale || board?.state === 'ERROR' || board?.status === 'ERROR';
  const statusText = board?.message || (board?.mode === 'historical' && board.status === 'READY' ? 'Saved Aurum v1 signals · exact Rusty fields at each signal time; unavailable values remain blank.' : board?.status);
  // Clear the old board at the selection event, before the new request starts.
  // The feed's rollover callback performs the equivalent reset for a new IST day.
  const selectDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || (mode === 'history' && date === value)) return;
    setData(null); setError(''); setLoading(true); setMode('history'); setDate(value); setView('ALL'); setCut('latest');
  };
  const live = () => {
    if (mode === 'live') return;
    setData(null); setError(''); setLoading(true); setDate(istSessionDate()); setMode('live'); setView('ALL'); setCut('latest');
  };
  const sortBy = (key: SortKey) => {if (sort === key) setDescending(value => !value); else {setSort(key); setDescending(!['symbol', 'signal_time', 'view'].includes(key));}};
  const heading = (key: SortKey, label: string, title?: string) => <th aria-sort={sort === key ? descending ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => sortBy(key)} title={title}>{label}{sort === key ? descending ? <ArrowDown size={10}/> : <ArrowUp size={10}/> : <ArrowDownUp size={10}/>}</button></th>;
  const exportCsv = () => {
    const columns: (keyof AurumSignal)[] = ['symbol', 'side', 'signal_time', 'entry_time', 'entry', 'reference_price', 'ce_pct', 'pe_pct', 'oi_bias', 'view', 'bar_rvol', 'cum_rvol', 'pullback_confirmed', 'rusty_status', 'rusty_cut', 'recovered', 'issued_at'];
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = '\ufeff' + [['date','selected_cut', ...columns].map(quote).join(','), ...visible.map(row => [date,cut, ...columns.map(key => row[key])].map(quote).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `aurum_${date}_${cut.replace(':','')}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="aurum" aria-label="Aurum scanner">
    <header className="aurum-header"><div className="aurum-brand"><div className="aurum-mark"><Gem size={24}/></div><div><div className="aurum-eyebrow">NSE F&amp;O · CONFIRMED EXPANSION</div><h1>Aurum <span>01</span></h1><p>Price structure · relative volume · option flow</p></div></div>
      <div className="aurum-session"><div className={`aurum-session-pill ${mode === 'live' ? 'live' : ''}`}><i/>{mode === 'live' ? 'TODAY · LATEST BOARD' : 'HISTORICAL SESSION'}</div><div className="aurum-date"><input aria-label="Aurum session date" type="date" value={date} max={istSessionDate()} onChange={event => selectDate(event.target.value)}/>{!!board?.available_dates?.length && <select aria-label="Saved Aurum sessions" value="" onChange={event => selectDate(event.target.value)}><option value="" disabled>Saved sessions</option>{[...board.available_dates].sort().reverse().map(session => <option key={session} value={session}>{session}</option>)}</select>}<button type="button" onClick={live} disabled={mode === 'live'}>Today</button></div></div>
    </header>

    <div className="aurum-metrics"><div><span>SESSION</span><strong>{date}</strong></div><div><span>AS OF · IST</span><strong>{cut==='latest'?clock(board?.asof):cut}</strong></div><div><span>QUALIFIED</span><strong>{rows.length}<small> stocks</small></strong></div><div><span>FLOW SPLIT</span><strong><b className="aurum-bull">{bulls} <small>BULL</small></b><em>/</em><b className="aurum-bear">{bears} <small>BEAR</small></b></strong></div></div>

    <div className={`aurum-status ${stale ? 'warning' : ''}`} role="status"><i/>{error ? `${error}${board ? ' · Showing the last successful board for this session (stale).' : ''}` : statusText || (loading ? 'Loading Aurum…' : 'No board published for this session.')}{!error && board?.stale ? ' · Saved board is stale.' : ''}</div>

    <section className="aurum-desk" aria-label="Aurum signals">
      <div className="aurum-tools"><label className="aurum-cut">Cut · IST <select aria-label="Aurum cutoff time" value={cut} onChange={event => {setCut(event.target.value); setView('ALL');}}><option value="latest">Latest / all signals</option>{cuts.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="aurum-search"><Search size={13}/><input aria-label="Find Aurum stock" placeholder="Find a stock" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="Signal direction" value={side} onChange={event => setSide(event.target.value)}><option value="ALL">Both directions</option><option value="BULL">Bull</option><option value="BEAR">Bear</option></select><select aria-label="Rusty flow view" className="aurum-flow-select" value={views.includes(view) ? view : 'ALL'} onChange={event => setView(event.target.value)}><option value="ALL">All Rusty flows</option>{views.map(name => <option key={name} value={name}>{name}</option>)}</select><label className="aurum-pullback"><input type="checkbox" checked={pullback} onChange={event => setPullback(event.target.checked)}/>Pullback confirmed</label><div className="aurum-spacer"/><span className="aurum-count">{visible.length} / {rows.length}</span><button type="button" className="aurum-export" onClick={exportCsv} disabled={!visible.length}><Download size={12}/>CSV</button></div>

      <div className="aurum-table-scroll"><table className="aurum-table"><thead><tr>{heading('signal_time', 'Time', 'Completed signal candle · IST')}{heading('symbol', 'Stock / side')}{heading('entry', 'Entry', 'Next executable bar open; unavailable until observed')}{heading('ce_pct', 'CE %', 'Rusty published call OI change at the signal snapshot')}{heading('pe_pct', 'PE %', 'Rusty published put OI change at the signal snapshot')}{heading('oi_bias', 'OI bias', 'Rusty direction-relative OI bias; read with the flow label')}{heading('view', 'Rusty flow / view')}{heading('bar_rvol', 'RVOL', 'Completed candle volume versus previous same-time sessions')}{heading('cum_rvol', 'Cum RVOL', 'Cumulative volume versus previous same-time sessions')}{heading('pullback_confirmed', 'Pullback', 'Earlier opposite-color candle exists and the signal clears its high/low')}<th>Charts</th></tr></thead><tbody>{visible.map(row => <tr key={row.id || `${row.symbol}|${row.signal_time}|${row.side}`}>
        <td className="aurum-time" title={`Signal confirmed ${clock(row.signal_time)} IST${row.issued_at ? ` · Published ${clock(row.issued_at)} IST` : ''}`}>{clock(row.signal_time)}{board?.mode === 'live' && row.recovered && <small className="aurum-recovered" title={`Recovered from an earlier capture · published ${clock(row.issued_at)} IST · not issued live at the signal time`}>Recovered</small>}</td><td><a className="aurum-symbol" href={`/charts?${new URLSearchParams({symbol: row.symbol, date})}`} target="_blank" rel="noopener">{row.symbol}</a><span className={`aurum-side ${row.side.toLowerCase()}`}>{row.side}</span></td><td className="aurum-price" title={row.entry != null ? `Observed next-bar entry ${clock(row.entry_time)} IST · signal close ₹${number(row.reference_price)}` : 'Signal close reference; next-bar entry not observed'}>{number(row.entry ?? row.reference_price)}{row.entry == null && row.reference_price != null ? <small>ref</small> : ''}</td><td className={row.ce_pct != null && row.ce_pct < 0 ? 'aurum-negative' : ''}>{percent(row.ce_pct)}</td><td className={row.pe_pct != null && row.pe_pct < 0 ? 'aurum-negative' : ''}>{percent(row.pe_pct)}</td><td className="aurum-bias">{number(row.oi_bias)}</td><td className="aurum-flow" title={`${flow(row)}${row.rusty_cut ? ` · ${clock(row.rusty_cut)} IST` : ''}${row.rusty_status ? ` · ${row.rusty_status}` : ''}`}>{flow(row)}</td><td>{number(row.bar_rvol)}{row.bar_rvol != null ? <small>×</small> : ''}</td><td>{number(row.cum_rvol)}{row.cum_rvol != null ? <small>×</small> : ''}</td><td>{row.pullback_confirmed === null ? <span className="aurum-unavailable">—</span> : row.pullback_confirmed ? <span className="aurum-confirmed"><Check size={10}/>Yes</span> : <span className="aurum-unavailable">No</span>}</td><td><div className="aurum-actions"><button type="button" title={watchlist.includes(row.symbol) ? 'Already in Charts watchlist' : 'Add to Charts watchlist'} aria-label={`Add ${row.symbol} to Charts watchlist`} disabled={watchlist.includes(row.symbol)} onClick={() => {setWatchlist(addChartWatchlistSymbol(row.symbol)); setNotice(`${row.symbol} added to Charts watchlist`);}}>{watchlist.includes(row.symbol) ? <Check size={13}/> : <Plus size={14}/>}</button><a href={buildTradingViewUrl(row.symbol)} target="_blank" rel="noopener" title="Open TradingView" aria-label={`Open ${row.symbol} on TradingView`}><ExternalLink size={12}/></a></div></td>
      </tr>)}</tbody></table>{!visible.length && <div className="aurum-empty"><Gem size={26}/><strong>{loading ? 'Loading the signal desk' : rows.length ? 'No stocks match these filters' : 'No confirmed signals'}</strong><span>{rows.length ? 'Change direction, flow or pullback filters to see more stocks.' : board?.status || error || 'Waiting for a published Aurum board for this date.'}</span></div>}</div>
      <footer className="aurum-table-foot"><span>{cut==='latest'?'All available signals':`Signals available by ${cut} IST`} · CE / PE / bias stay at signal time{board?.mode==='historical'?' · research uses nominal candle-close times':''}</span><span>+ adds to the shared Charts watchlist</span></footer>
    </section>
    <footer className="aurum-foot"><span>{board?.mode==='historical'?'Historical Aurum v1':'Aurum v1.1 - Live scan 09:35-11:30 IST'} - Bull &amp; bear</span><span>Optional pullback filter · morning: five-minute visible checks · history: load once</span></footer>
    {notice && <div className="aurum-toast" role="status">{notice}</div>}
  </section>;
}
