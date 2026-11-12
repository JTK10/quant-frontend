'use client';

import {useEffect, useMemo, useState, useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowDown, ArrowUp, Check, ExternalLink, Plus} from 'lucide-react';
import {buildTradingViewUrl} from '@/utils/backend';
import {
  addChartWatchlistSymbol, readChartWatchlist,
  CHART_WATCHLIST_STORAGE_KEY, CHART_WATCHLIST_UPDATED_EVENT,
} from '@/utils/chartWatchlist';
import type {SignalRow} from './model';
import type {ViperBoard} from './model';
import {istSessionDate} from '@/utils/sessionPolling';
import {createViperFeed} from './feed';
import './viper-signal.css';

const number = new Intl.NumberFormat('en-IN', {maximumFractionDigits: 2});
const value = (metric: number | null, suffix: string) => metric === null ? '—' : number.format(metric) + suffix;
const signed = (metric: number | null) => metric === null ? '—' : (metric > 0 ? '+' : '') + value(metric, '%');
const labels = [
  ['symbol', 'Stock'], ['cut', 'Time IST'], ['route', 'Setup'], ['level', 'PDH / PDL'],
  ['rvol', 'Cash RVOL'], ['unwind', 'Trapped leg ΔOI'], ['opposite', 'Opposite leg ΔOI'],
] as const;
type SortKey = typeof labels[number][0];
type SideFilter = 'Both' | SignalRow['side'];
const sideFilters: ReadonlyArray<[SideFilter, string]> = [
  ['Both', 'Both'], ['BULL', 'Bulls'], ['BEAR', 'Bears'],
];

export default function ViperSignalClient({date, dates, rows: archivedRows}: {
  date: string | undefined;
  dates: readonly string[];
  rows: readonly SignalRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [side, setSide] = useState<SideFilter>('Both');
  const [cut, setCut] = useState('');
  const [query, setQuery] = useState('');
  const [firstOnly, setFirstOnly] = useState(false);
  const [sort, setSort] = useState<{key: SortKey; descending: boolean}>({key: 'cut', descending: true});
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [board, setBoard] = useState<ViperBoard | null>(null);
  const [liveDate, setLiveDate] = useState(istSessionDate);
  const [error, setError] = useState('');
  const archive = Boolean(date && dates.includes(date));
  const rows = useMemo(() => archive ? archivedRows :
    board?.cuts.flatMap(c => [...c.bull,...c.bear]) ?? [], [archive, archivedRows, board]);

  useEffect(() => {
    if (archive) return;
    const feed = createViperFeed({
      initialDate:date, now:Date.now, hidden:() => document.hidden,
      setTimer:setTimeout, clearTimer:clearTimeout,
      onReset:day => {setLiveDate(day);setBoard(null);setError('');},
      onData:data => {setBoard(data);setError('');},
      onError:setError,
      read:async (day, known, signal) => {
        const params = new URLSearchParams({date:day, known:known.join(',')});
        const response = await fetch('/api/viper-signal?'+params, {signal,cache:'default'});
        if (!response.ok) throw Error('Viper Signal feed unavailable');
        return response.json();
      },
    });
    const visibility = () => feed.visibility();
    document.addEventListener('visibilitychange',visibility);
    return () => {document.removeEventListener('visibilitychange',visibility);feed.stop();};
  },[archive,date]);

  useEffect(() => {
    const sync = () => setWatchlist(readChartWatchlist());
    const syncStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === CHART_WATCHLIST_STORAGE_KEY) sync();
    };
    sync();
    window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync);
    window.addEventListener('storage', syncStorage);
    return () => {
      window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync);
      window.removeEventListener('storage', syncStorage);
    };
  }, []);

  const scoped = useMemo(() => firstOnly ? rows.filter(row => row.first) : rows, [firstOnly, rows]);
  const cuts = useMemo(() => [...new Set(scoped.map(row => row.cut))].sort(), [scoped]);
  const selectedCut = cuts.includes(cut) ? cut : '';
  const visible = useMemo(() => {
    const symbol = query.trim().toUpperCase();
    return scoped.filter(row => (side === 'Both' || row.side === side) &&
      (!selectedCut || row.cut === selectedCut) && row.symbol.includes(symbol)).sort((a, b) => {
      const left = a[sort.key], right = b[sort.key];
      if (left == null) return right == null ? 0 : 1;
      if (right == null) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
      return comparison * (sort.descending ? -1 : 1) || a.symbol.localeCompare(b.symbol);
    });
  }, [scoped, query, selectedCut, side, sort]);
  const bulls = scoped.filter(row => row.side === 'BULL').length;
  const bears = scoped.length - bulls;

  function selectDate(next: string) {
    if (next === date || (!dates.includes(next) && next !== 'live')) return;
    setCut('');
    startTransition(() => router.push(next === 'live' ? '/viper-signal' :
      '/viper-signal?date=' + encodeURIComponent(next), {scroll: false}));
  }

  function sortBy(key: SortKey) {
    setSort(previous => ({
      key,
      descending: previous.key === key ? !previous.descending : ['cut', 'rvol', 'opposite'].includes(key),
    }));
  }

  return (
    <section className="viper-signal" aria-labelledby="viper-signal-title" aria-busy={pending}>
      <header className="viper-signal__header">
        <div>
          <h1 id="viper-signal-title">Viper Signal</h1>
          <p>{archive ? 'Historical signals' : 'Live bull and bear signals · '+liveDate}</p>
        </div>
        <label>
          Session
          <select aria-label="Session" value={date ?? 'live'} disabled={pending}
            onChange={event => selectDate(event.target.value)}>
            <option value="live">Live session</option>
            {dates.map(day => <option key={day} value={day}>{day}</option>)}
          </select>
        </label>
      </header>

      <div className="viper-signal__filters">
        <div className="viper-signal__sides" role="group" aria-label="Signal side">
          {sideFilters.map(([filter, label]) =>
            <button key={filter} type="button" aria-pressed={filter === side}
              data-side={filter} onClick={() => setSide(filter)}>
              {label}<span>{filter === 'BULL' ? bulls : filter === 'BEAR' ? bears : scoped.length}</span>
            </button>
          )}
        </div>
        <label>
          Cut
          <select aria-label="Signal time" value={selectedCut} onChange={event => setCut(event.target.value)}>
            <option value="">All times</option>
            {cuts.map(time => <option key={time} value={time}>{time} IST</option>)}
          </select>
        </label>
        <label>
          Stock
          <input aria-label="Search stocks" type="search" placeholder="Search symbol" value={query}
            onChange={event => setQuery(event.target.value)} />
        </label>
        <label className="viper-signal__first">
          <input type="checkbox" checked={firstOnly} onChange={event => setFirstOnly(event.target.checked)} />
          First signal per stock and side
        </label>
      </div>

      <p className="viper-signal__status" role="status">
        {pending ? 'Loading session…' : `${visible.length} of ${scoped.length} signals`}
        {!archive && (board?.lastCut ? ' · Processed '+board.lastCut+' IST' : ' · Waiting for completed session data')}
        {!archive && board?.cuts.some(c => c.recovered) && ' · Includes recovered cuts'}
        {error && ' · '+error+' · Last received data retained'}
      </p>

      <div className="viper-signal__table">
        <table aria-label="Viper bull and bear signals">
          <thead>
            <tr>
              {labels.map(([key, label]) =>
                <th key={key} scope="col"
                  aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : undefined}>
                  <button type="button" onClick={() => sortBy(key)}>
                    {label}
                    {sort.key === key && (sort.descending
                      ? <ArrowDown size={12} aria-hidden="true" />
                      : <ArrowUp size={12} aria-hidden="true" />)}
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const added = watchlist.includes(row.symbol);
              const bull = row.side === 'BULL';
              return (
                <tr key={[row.symbol, row.side, row.cut, row.route, row.strike, index].join('|')}>
                  <td>
                    <div className="viper-signal__stock">
                      <strong>{row.symbol}</strong>
                      <div className="viper-signal__actions">
                        <button type="button" disabled={added}
                          aria-label={added ? row.symbol + ' is in Charts watchlist' : 'Add ' + row.symbol + ' to Charts watchlist'}
                          title={added ? 'Already in Charts watchlist' : 'Add to Charts watchlist'}
                          onClick={() => setWatchlist(addChartWatchlistSymbol(row.symbol))}>
                          {added ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                        </button>
                        <a href={buildTradingViewUrl(row.symbol, row.symbol)} target="_blank" rel="noopener noreferrer"
                          title="Open TradingView" aria-label={'Open ' + row.symbol + ' on TradingView'}>
                          <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                    <span className="viper-signal__strike">{number.format(row.strike)} {bull ? 'CE' : 'PE'}</span>
                  </td>
                  <td className="viper-signal__time">{row.cut}</td>
                  <td>
                    <span className="viper-signal__badge" data-side={row.side}>{row.side}</span>
                    <span className="viper-signal__route">{row.route}</span>
                  </td>
                  <td>
                    <span className="viper-signal__minor">{bull ? 'PDH' : 'PDL'}</span> {number.format(row.level)}
                  </td>
                  <td>
                    <strong>{value(row.rvol, '×')}</strong>
                    {row.activeRvol !== null && <span className="viper-signal__minor viper-signal__second">
                      {value(row.activeRvol, '×')} since break
                    </span>}
                  </td>
                  <td>
                    <span className="viper-signal__minor">{bull ? 'CE' : 'PE'}</span>{' '}
                    <strong className={row.unwind !== null && row.unwind < 0 ? 'viper-signal__emphasis' : undefined}>
                      {signed(row.unwind)}
                    </strong>
                  </td>
                  <td>
                    <span className="viper-signal__minor">{bull ? 'PE' : 'CE'}</span> {signed(row.opposite)}
                    {row.oppositeConfirmed === true && <span className="viper-signal__confirmed">
                      <Check size={12} aria-hidden="true" /> Confirmed
                    </span>}
                  </td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={labels.length} className="viper-signal__empty">
              {scoped.length ? 'No signals match these filters.' : archive ? 'No saved signals for this session.' : 'Waiting for qualifying bull or bear setups.'}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
