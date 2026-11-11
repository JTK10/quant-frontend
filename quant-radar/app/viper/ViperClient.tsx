'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {istSessionDate} from '@/utils/sessionPolling';
import {createViperFeed} from './feed';
import {ACTIVE_STATES, EVENT_STATES, IGNITION_STATES, WATCH_STATES, type Side, type ViperBoard, type ViperRow} from './model';
import './viper.css';

const format = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('en-IN', {maximumFractionDigits: 2});
const contract = (row: ViperRow) => [row.symbol, row.strike, row.expiry].join('|');
const columns = ['symbol', 'state', 'cut', 'strike', 'expiry', 'spot', 'premium', 'breakeven', 'distance', 'unwind', 'baseline_build'] as const;
type Column = typeof columns[number];
type Mode = 'events' | 'active' | 'timeline' | 'all';
type AlertFilter = 'watch' | 'ignition' | 'bridge';
const alertStates = {watch: WATCH_STATES, ignition: IGNITION_STATES, bridge: ['BRIDGE IGNITION']};
const isIgnition = (state: string) => state.includes('IGNITION');

function stateClass(state: string) {
  if (isIgnition(state)) return 'entry';
  if (state === 'EXHAUSTED') return 'exit';
  if (WATCH_STATES.includes(state)) return 'watch';
  if (state === 'SQUEEZING' || state === 'TRACKING') return 'squeeze';
  return '';
}

function Spark({values, reference}: {values: (number | null | undefined)[]; reference?: number | null}) {
  const points = values.filter((value): value is number => value != null);
  if (!points.length) return <div className="chart-empty">No observations</div>;
  if (reference != null) points.push(reference);
  const min = Math.min(...points), max = Math.max(...points);
  const x = (index: number) => 10 + (340 * index) / Math.max(values.length - 1, 1);
  const y = (value: number) => max === min ? 60 : 110 - 100 * (value - min) / (max - min);
  const path = values.map((value, index) => value == null ? '' :
    (index === 0 || values[index - 1] == null ? 'M' : 'L') + x(index) + ',' + y(value)).join(' ');
  const last = values.length - 1 - [...values].reverse().findIndex(value => value != null);
  return <svg className="spark" viewBox="0 0 360 120" role="img" aria-label={reference == null ? 'Option premium through the selected cut' : 'Spot through the selected cut and reference level'}>
    {reference != null && <line x1="10" y1={y(reference)} x2="350" y2={y(reference)} stroke="#fbbf24" strokeDasharray="3 3" />}
    <path d={path} fill="none" stroke={reference == null ? '#34d399' : '#38bdf8'} strokeWidth="2" />
    <circle cx={x(last)} cy={y(values[last]!)} r="3.5" fill="#fff" />
  </svg>;
}

function StrikeDrawer({series, side, cut, close}: {series: (ViperRow | undefined)[]; side: Side; cut: string; close: () => void}) {
  const observed = series.filter((row): row is ViperRow => row != null);
  const last = observed.at(-1);
  if (!last) return null;
  const premium = observed.flatMap(row => row.premium == null ? [] : [row.premium]);
  const unwind = observed.flatMap(row => row.unwind == null ? [] : [row.unwind]);
  const cards = [
    ['Watch cut', observed.find(row => WATCH_STATES.includes(row.state))?.cut ?? '—'],
    ['Ignition cut', observed.find(row => isIgnition(row.state))?.cut ?? '—'],
    ['Peak LTP', format(premium.length ? Math.max(...premium) : null)],
    ['Last spot', format(last.spot)],
    ['Reference level', format(last.breakeven)],
    ['Max 15m unwind', unwind.length ? format(Math.min(...unwind)) + '%' : '—'],
  ];
  return <aside className="drawer" aria-label="Contract intraday detail">
    <header className="drawer-head"><div><h2>{last.symbol} · ₹{format(last.strike)} {side === 'bull' ? 'CE' : 'PE'}</h2>
      <p>Expiry {last.expiry} · {last.state} at {last.cut} IST{last.cut !== cut ? ' · Last observed' : ''}</p></div>
      <button onClick={close} aria-label="Close strike detail">×</button></header>
    <div className="drawer-grid">{cards.map(([label, value]) => <div className="d-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="chart-box"><div className="chart-title">Option LTP (₹)</div><Spark values={series.map(row => row?.premium)} /></div>
    <div className="chart-box"><div className="chart-title">Spot vs reference level</div><Spark values={series.map(row => row?.spot)} reference={last.breakeven} /></div>
  </aside>;
}

export default function ViperClient({initialDate}: {initialDate?: string}) {
  const [history, setHistory] = useState(initialDate);
  const [date, setDate] = useState(initialDate ?? istSessionDate);
  const [board, setBoard] = useState<ViperBoard | null>(null);
  const [error, setError] = useState('');
  const [side, setSide] = useState<Side>('bull');
  const [selectedCut, setCut] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('events');
  const [alertFilter, setAlertFilter] = useState<AlertFilter | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{key: Column; desc: boolean}>({key: 'cut', desc: false});
  const [selectedContract, setContract] = useState('');
  const [playing, setPlaying] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const feed = createViperFeed({
      initialDate: history, now: Date.now, hidden: () => document.hidden, setTimer: setTimeout, clearTimer: clearTimeout,
      async read(date, known, signal) {
        const params = new URLSearchParams({date});
        if (known.length) params.set('known', known.join(','));
        const response = await fetch('/api/viper?' + params, {cache: 'default', signal: AbortSignal.any([signal, AbortSignal.timeout(20000)])});
        if (response.status === 401) {
          window.location.assign('/login?next=' + encodeURIComponent('/viper'));
          throw new Error('Session expired');
        }
        if (!response.ok) throw new Error('Viper feed unavailable');
        const result: ViperBoard = await response.json();
        if (!Array.isArray(result.cuts)) throw new Error('Invalid Viper board');
        return result;
      },
      onReset(nextDate) {
        setDate(nextDate);
        setBoard(null);
        setError('');
        setCut(null);
        setContract('');
        setPlaying(false);
      },
      onData(next) {setBoard(next); setError('');},
      onError: setError,
    });
    document.addEventListener('visibilitychange', feed.visibility);
    return () => {document.removeEventListener('visibilitychange', feed.visibility); feed.stop();};
  }, [history]);

  const cuts = useMemo(() => board?.cuts ?? [], [board]);
  const cut = cuts.find(item => item.cut === selectedCut) ?? cuts.at(-1);
  const index = cuts.findIndex(item => item === cut);
  const throughCut = useMemo(() => cuts.slice(0, index + 1), [cuts, index]);
  const rowsThroughCut = useMemo(() => throughCut.flatMap(item => item[side]), [throughCut, side]);
  const activeCount = cut?.[side].filter(row => ACTIVE_STATES.includes(row.state)).length ?? 0;
  const labels = ['Stock', 'State', 'Cut', side === 'bull' ? 'CE strike' : 'PE strike', 'Expiry', 'Spot',
    side === 'bull' ? 'CE LTP' : 'PE LTP', side === 'bull' ? 'Reference breakeven' : 'Put pain level',
    side === 'bull' ? 'Distance %' : 'Pain cross %', side === 'bull' ? 'CE OI 15m %' : 'PE OI 15m %', 'Baseline build %'];
  const visible = useMemo(() => {
    const source = mode === 'timeline' ? rowsThroughCut : cut?.[side] ?? [];
    const symbol = query.trim().toUpperCase();
    return source.filter(row => row.symbol.includes(symbol) &&
      (mode === 'all' || (mode === 'active' ? ACTIVE_STATES : EVENT_STATES).includes(row.state)) &&
      (!alertFilter || alertStates[alertFilter].includes(row.state))).sort((a, b) => {
      const left = a[sort.key], right = b[sort.key];
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return sort.desc ? -order : order;
    });
  }, [mode, rowsThroughCut, cut, side, query, alertFilter, sort]);
  const series = useMemo(() => selectedContract
    ? throughCut.map(item => item[side].find(row => contract(row) === selectedContract)) : [], [selectedContract, throughCut, side]);

  useEffect(() => {
    if (!playing) return;
    if (index + 1 >= cuts.length) return;
    const timer = setTimeout(() => setCut(cuts[index + 1].cut), 650);
    return () => clearTimeout(timer);
  }, [playing, cuts, index]);

  function chooseIndex(next: number) {
    const value = cuts[next]?.cut;
    if (value) setCut(value);
  }

  function jumpAlert(direction: -1 | 1) {
    for (let next = index + direction; next >= 0 && next < cuts.length; next += direction) {
      if (cuts[next][side].some(row => EVENT_STATES.includes(row.state))) {
        chooseIndex(next);
        return;
      }
    }
  }

  function togglePlay() {
    if (!playing && index === cuts.length - 1) chooseIndex(0);
    setPlaying(value => !value);
  }

  function exportCsv() {
    const quote = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const csv = [['date', 'baseline_date', 'side', ...columns].join(','),
      ...visible.map(row => [date, board?.baseline, side, ...columns.map(key => row[key])].map(quote).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = `viper-${side}-${date}-${cut?.cut.replace(':', '') ?? ''}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="viper" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input, select, button, a')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); chooseIndex(index + (event.key === 'ArrowLeft' ? -1 : 1));}
    if (event.key === ' ' && cuts.length > 1) {event.preventDefault(); togglePlay();}
    if (event.key === '/') {event.preventDefault(); search.current?.focus();}
    if (event.key === 'Escape') setContract('');
  }} tabIndex={0}>
    <header className="top-bar">
      <div className="brand"><h1>Viper <span className="tag entry">{history ? '5M REPLAY' : 'LIVE · 5M'}</span></h1>
        <p>{side === 'bull' ? 'Trapped call seller watchlist' : 'Trapped put seller watchlist'}</p></div>
      <div className="controls" aria-label="Viper side">
        {(['bull', 'bear'] as const).map(value => <button key={value} aria-pressed={side === value} onClick={() => {setSide(value); setContract('');}}>{value === 'bull' ? 'Bulls' : 'Bears'}</button>)}
      </div>
      <div className="kpis">
        {([['watch', 'Watch', 'amber'], ['ignition', 'Ignition', 'mint'], ['bridge', 'Bridge', 'sky']] as const).map(([key, label, color]) =>
          <button key={key} className={'kpi ' + color} aria-pressed={mode === 'timeline' && alertFilter === key} onClick={() => {setMode('timeline'); setAlertFilter(value => value === key ? null : key);}}>
            <span>{label}</span><strong>{rowsThroughCut.filter(row => alertStates[key].includes(row.state)).length}</strong></button>)}
        <button className="kpi rose" aria-pressed={mode === 'active'} onClick={() => {setMode('active'); setAlertFilter(null);}}><span>Active @ Cut</span><strong>{activeCount}</strong></button>
      </div>
    </header>
    <section className="control-deck">
      <div className="controls">
        <label>Session <input aria-label="Replay session" type="date" value={history ?? date} max={istSessionDate()} onChange={event => {
          if (event.target.value && event.target.value !== history) {
            setBoard(null); setCut(null); setContract(''); setPlaying(false); setHistory(event.target.value);
          }
        }} /></label>
        <button disabled={!history && selectedCut === null} onClick={() => {
          if (history) {setBoard(null); setContract(''); setHistory(undefined);}
          setCut(null); setPlaying(false);
        }}>Live</button>
        <button aria-label="Previous cut" disabled={index <= 0} onClick={() => chooseIndex(index - 1)}>‹</button>
        <label>Cut <select value={cut?.cut ?? ''} disabled={!cuts.length} onChange={event => setCut(event.target.value)}>
          {!cuts.length && <option value="">—</option>}{cuts.map(item => <option key={item.cut}>{item.cut}</option>)}
        </select></label>
        <button aria-label="Next cut" disabled={index < 0 || index >= cuts.length - 1} onClick={() => chooseIndex(index + 1)}>›</button>
        <button className={playing ? 'active-play' : ''} disabled={cuts.length < 2} onClick={togglePlay}>{playing ? 'Pause' : '▶ Play'}</button>
        <button disabled={index <= 0} onClick={() => jumpAlert(-1)}>« Alert</button>
        <button disabled={index < 0 || index >= cuts.length - 1} onClick={() => jumpAlert(1)}>Alert »</button>
        <div className="scrubber-wrap">
          <input type="range" aria-label="Snapshot time" min={0} max={Math.max(0, cuts.length - 1)} value={Math.max(0, index)} disabled={cuts.length < 2} onChange={event => chooseIndex(Number(event.target.value))} />
          <div className="pulse-strip" aria-label="Alert timeline">{cuts.map((item, position) => {
            const state = position <= index ? item[side] : [];
            return <button key={item.cut} aria-label={item.cut + ' IST'} title={item.cut + ' IST'}
              className={'pulse-bar' + (state.some(row => isIgnition(row.state)) ? ' has-ig' : state.some(row => WATCH_STATES.includes(row.state)) ? ' has-watch' : '') +
              (position === index ? ' current' : '')} onClick={() => chooseIndex(position)} />;
          })}</div>
        </div>
        <label>View <select value={mode} onChange={event => {setMode(event.target.value as Mode); setAlertFilter(null);}}>
          <option value="events">Alerts at cut</option><option value="active">Active and stalking</option><option value="timeline">Session alerts through cut</option><option value="all">All published rows</option>
        </select></label>
        <label>Stock <input ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter symbol (/)" /></label>
        <button disabled={!visible.length} onClick={exportCsv}>CSV</button>
      </div>
      <div className="status-line" role="status">
        <span className={error ? 'status-error' : ''}>{error && (board?.lastCut ? error + ' · Showing last saved snapshot · ' : error + ' · ')}
          {cut ? [cut.cut + ' IST', 'Baseline ' + board?.baseline, cut.recovered ? 'Recovered cut' : '', cut.limited ? 'Partial watchlist' : '', visible.length + ' rows'].filter(Boolean).join(' · ')
            : board ? 'No published Viper cuts for this session.' : error ? '' : 'Loading Viper snapshots…'}</span>
      </div>
    </section>
    <div className={'workspace' + (series.some(Boolean) ? ' has-drawer' : '')}>
      <section className="table-card"><div className="scroll"><table>
        <thead><tr>{columns.map((key, position) => <th key={key} scope="col" aria-sort={key === sort.key ? sort.desc ? 'descending' : 'ascending' : undefined}>
          <button className="sort-button" onClick={() => setSort(previous => ({key, desc: previous.key === key && !previous.desc}))}>{labels[position]}{key === sort.key ? sort.desc ? ' ↓' : ' ↑' : ''}</button></th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={contract(row) + row.cut} className={selectedContract === contract(row) ? 'selected-row' : ''} onClick={() => setContract(contract(row))}>
          {columns.map(key => <td key={key}>
            {key === 'symbol' ? <button className="open-strike" onClick={() => setContract(contract(row))}>{row.symbol}</button>
              : key === 'state' ? <span className={'tag ' + stateClass(row.state)}>{row.state}</span>
              : typeof row[key] === 'string' ? row[key] : format(row[key] as number | null)}
          </td>)}
        </tr>)}{!visible.length && <tr><td colSpan={columns.length}>{cut ? 'No rows match this view and cut.' : 'No cuts to display.'}</td></tr>}</tbody>
      </table></div></section>
      <StrikeDrawer series={series} side={side} cut={cut?.cut ?? ''} close={() => setContract('')} />
    </div>
  </div>;
}
