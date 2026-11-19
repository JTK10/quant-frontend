'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,ArrowUpRight,ChartCandlestick,Check,ChevronLeft,ChevronRight,Plus,Radar,Search} from 'lucide-react';
import {buildTradingViewUrl} from '@/utils/backend';
import {istSessionDate} from '@/utils/sessionPolling';
import {
  addChartWatchlistSymbol,readChartWatchlist,CHART_WATCHLIST_STORAGE_KEY,CHART_WATCHLIST_UPDATED_EVENT,
} from '@/utils/chartWatchlist';
import {createOspreyFeed} from './feed';
import {MODES,STATES,type OspreyBoard,type OspreyRow} from './model';
import {useSetupCandles} from './useSetupCandles';
import {evaluateOspreySetup} from './setup';

const headers=[
  ['score','Score'],['oi_5m','5m OI'],['oi_15m','15m OI'],['rvol','RVOL'],
  ['ce_pct','CE %'],['pe_pct','PE %'],['oi_bias','OI bias'],
  ['sector_strength','Sector strength'],['move_pct','Move so far'],
] as const;
type SortKey=typeof headers[number][0];
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const numeric=(value:unknown,signed=false)=>finite(value)?(signed&&value>0?'+':'')+value.toFixed(2):'—';
const pct=(value:unknown,signed=false)=>finite(value)?numeric(value,signed)+'%':'—';
const sign=(value:unknown)=>finite(value)?value>0?'positive':value<0?'negative':'':'';

export default function OspreyClient({initialDate}:{initialDate?:string}) {
  const [day,setDay]=useState(initialDate??'');
  const [session,setSession]=useState(initialDate??'');
  const [cut,setCut]=useState('');
  const [cutDay,setCutDay]=useState('');
  const [cuts,setCuts]=useState<string[]>([]);
  const [mode,setMode]=useState<OspreyRow['mode']>('All chain activity');
  const [limit,setLimit]=useState('30');
  const [side,setSide]=useState('');
  const [state,setState]=useState('');
  const [query,setQuery]=useState('');
  const [watchlist,setWatchlist]=useState<string[]>([]);
  const [sort,setSort]=useState<{key:SortKey;descending:boolean}>({key:'score',descending:true});
  const [board,setBoard]=useState<OspreyBoard|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    const sync=()=>setWatchlist(readChartWatchlist());
    const onStorage=(event:StorageEvent)=>{if (event.key===null||event.key===CHART_WATCHLIST_STORAGE_KEY) sync();};
    sync();
    window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);
    window.addEventListener('storage',onStorage);
    return ()=>{
      window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);
      window.removeEventListener('storage',onStorage);
    };
  },[]);
  useEffect(()=>{
    const feed=createOspreyFeed({
      initialDate:day|| (cut?cutDay:undefined),selectedCut:cut||undefined,
      now:Date.now,hidden:()=>document.hidden,setTimer:setTimeout,clearTimer:clearTimeout,
      onReset:date=>{
        setSession(date);
        setBoard(null);
        if (!cut) setCuts([]);
        setError('');
      },
      onData:update=>{
        setBoard(update);
        if (!cut&&update.available) setCuts(update.cuts);
      },
      onError:setError,
      read:async(date,requested,signal)=>{
        const params=new URLSearchParams({date});
        if (requested) params.set('cut',requested);
        const response=await fetch('/api/osprey?'+params,{signal,cache:'default'});
        if (!response.ok) throw Error('Osprey feed unavailable');
        return response.json();
      },
    });
    document.addEventListener('visibilitychange',feed.visibility);
    return ()=>{document.removeEventListener('visibilitychange',feed.visibility);feed.stop();};
  },[day,cut,cutDay]);

  const rows=useMemo(()=>{
    const symbol=query.trim().toUpperCase();
    const ranked=(board?.rows??[]).filter(row=>row.mode===mode&&(!side||row.side===side)&&
      (!state||row.state===state)&&row.symbol.includes(symbol)).sort((a,b)=>{
      const x=finite(a[sort.key])?a[sort.key]:null,y=finite(b[sort.key])?b[sort.key]:null;
      if (x===null&&y!==null) return 1;
      if (x!==null&&y===null) return -1;
      return (x===null||y===null?0:(x-y)*(sort.descending?-1:1)) ||
        (b.score??-Infinity)-(a.score??-Infinity) || a.symbol.localeCompare(b.symbol);
    });
    const unique=new Map<string,OspreyRow>();
    for (const row of ranked) if (!unique.has(row.symbol)) unique.set(row.symbol,row);
    return [...unique.values()];
  },[board,mode,side,state,query,sort]);
  const selectedIndex=cuts.indexOf(cut||board?.cut||'');
  const visible=limit==='all'?rows:rows.slice(0,30);
  const date=board?.date||day||session;
  const setupBars=useSetupCandles(visible.filter(r=>r.state==='Confirmed').map(r=>r.symbol),date,board?.cut??'');
  function chooseDay(value:string) {
    if (value===day&&!cut) return;
    setBoard(null);setError('');setCuts([]);setDay(value);setCut('');setCutDay('');
  }
  function chooseCut(value:string) {
    if (value===cut) return;
    setBoard(null);setError('');setCutDay(value?date:'');setCut(value);
  }
  const isLive=!day&&!cut;
  const describe=board?.available
    ? visible.length+' of '+rows.length+' stocks'
    : board ? 'No completed cuts for this session.' : 'Loading Osprey…';

  return <section className="osprey" aria-labelledby="osprey-title">
    <header className="osprey-header">
      <div className="osprey-identity">
        <span className="osprey-mark"><Radar size={24} aria-hidden="true" /></span>
        <div><h1 id="osprey-title">Osprey</h1><p>Multi-strike open interest</p></div>
      </div>
      <div className="osprey-session">
        <label className="osprey-date">Session
          <input aria-label="Session date" type="date" max={istSessionDate()} value={day||session}
            onChange={event=>chooseDay(event.target.value)} />
        </label>
        <div className="osprey-cuts">
          <button type="button" aria-label="Previous cut" disabled={selectedIndex<=0} onClick={()=>chooseCut(cuts[selectedIndex-1])}>
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <select aria-label="Five-minute cut" value={cut} onChange={event=>chooseCut(event.target.value)}>
            <option value="">Latest cut</option>
            {cuts.map(time=><option key={time} value={time}>{time} IST</option>)}
          </select>
          <button type="button" aria-label="Next cut" disabled={!cut||selectedIndex<0||selectedIndex>=cuts.length-1} onClick={()=>chooseCut(cuts[selectedIndex+1])}>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <button className="osprey-live" type="button" onClick={()=>chooseDay('')} disabled={isLive}>
          <span aria-hidden="true" /> Live
        </button>
      </div>
    </header>

    <div className="osprey-board">
      <div className="osprey-toolbar">
        <div className="osprey-modes" role="group" aria-label="Ranking mode">
          {MODES.map(item=><button key={item} type="button" aria-pressed={mode===item} onClick={()=>setMode(item)}>{item}</button>)}
        </div>
        <div className="osprey-filters">
          <label className="osprey-search">
            <Search size={15} aria-hidden="true" />
            <input aria-label="Search stocks" placeholder="Find stock" type="search" value={query} onChange={event=>setQuery(event.target.value)} />
          </label>
          <select aria-label="Side" value={side} onChange={event=>setSide(event.target.value)}>
            <option value="">All sides</option><option value="BULL">Bulls</option><option value="BEAR">Bears</option>
          </select>
          <select aria-label="Filter by state" value={state} onChange={event=>setState(event.target.value)}>
            <option value="">All states</option>{STATES.map(item=><option key={item}>{item}</option>)}
          </select>
        <select aria-label="Rows" value={limit} onChange={event=>setLimit(event.target.value)}>
          <option value="30">Top 30</option><option value="all">All stocks</option>
        </select>
        </div>
      </div>
      <div className="osprey-status" role="status">
        {board?.available&&<span className="osprey-timestamp">Cut <strong>{board.cut}</strong> IST</span>}
        <span className={error?'osprey-error':undefined}>{error||describe}</span>
        {error&&board?.available&&<span>{describe}</span>}
      </div>
    <div className="osprey-table" tabIndex={0} role="region" aria-label="Osprey stock rankings">
      <table aria-label="Stock rankings">
      <thead><tr><th className="osprey-rank" scope="col">#</th><th className="osprey-stock" scope="col">Stock</th><th scope="col">Side</th>
        {headers.map(([key,label])=><th className="num" key={key} scope="col"
          aria-sort={sort.key===key?(sort.descending?'descending':'ascending'):undefined}>
          <button type="button" onClick={()=>setSort(previous=>({key,descending:previous.key===key?!previous.descending:true}))}>
            {label}
            {sort.key===key&&(sort.descending?<ArrowDown size={12} aria-hidden="true" />:<ArrowUp size={12} aria-hidden="true" />)}
          </button>
        </th>)}
        <th scope="col">First seen</th><th scope="col">Latest flow</th><th scope="col">State</th><th scope="col">Strikes</th>
      </tr></thead>
      <tbody>{visible.map((row,i)=>{const setup=error?null:evaluateOspreySetup(row,setupBars.get(row.symbol),date,board?.cut??'');return <tr key={row.symbol}>
        <td className="osprey-rank">{i+1}</td>
        <td className="osprey-stock"><b>{row.symbol}</b>{setup&&<span className="osprey-setup-star" role="img" aria-label={row.symbol+' Flow Band setup passed'} title={'Flow Band setup · '+setup.cut+' IST · '+(setup.contact==='WICK'?'wick touches band':'body overlaps band')+' · '+(setup.kind==='PRIMARY'?'body avoids EMA9':'line breakout')}>★</span>}<div className="osprey-actions">
          <button type="button" aria-label={'Add '+row.symbol+' to Charts watchlist'} aria-pressed={watchlist.includes(row.symbol)}
            title={watchlist.includes(row.symbol)?'In Charts watchlist':'Add to Charts watchlist'}
            disabled={watchlist.includes(row.symbol)} onClick={()=>setWatchlist(addChartWatchlistSymbol(row.symbol))}>
            {watchlist.includes(row.symbol)?<Check size={13} aria-hidden="true" />:<Plus size={13} aria-hidden="true" />}
          </button>
          <a href={'/charts?'+new URLSearchParams({symbol:row.symbol,date})} aria-label={'Open '+row.symbol+' in Charts'}
            title="Open Charts" target="_blank" rel="noopener noreferrer"><ChartCandlestick size={13} aria-hidden="true" /></a>
          <a href={buildTradingViewUrl(row.symbol)} aria-label={'Open '+row.symbol+' on TradingView'}
            title="Open TradingView" target="_blank" rel="noopener noreferrer">TV <ArrowUpRight size={11} aria-hidden="true" /></a>
        </div></td>
        <td><span className="osprey-side" data-side={row.side}>{row.side}</span></td>
        <td className="num"><strong className="osprey-score">{row.score?.toFixed(2)??'—'}</strong></td>
        <td className="num" title={row.oi_5m_route}>{pct(row.oi_5m)}</td>
        <td className="num" title={row.oi_15m_route}>{pct(row.oi_15m)}</td>
        <td className="num">{row.rvol===null?'—':row.rvol.toFixed(2)+'×'}{row.rvol!==null&&row.rvol_sessions?<small> {row.rvol_sessions}d</small>:null}</td>
        <td className={'num '+sign(row.ce_pct)} title="Rusty CE OI change · same session and cut">{pct(row.ce_pct,true)}</td>
        <td className={'num '+sign(row.pe_pct)} title="Rusty PE OI change · same session and cut">{pct(row.pe_pct,true)}</td>
        <td className={'num '+sign(row.oi_bias)} title="Rusty OI bias · same session and cut">{numeric(row.oi_bias,true)}</td>
        <td className="num" title={row.sector_samples?row.sector_source+' breadth · '+row.sector_samples+' stocks':undefined}>
          {pct(row.sector_strength,true)}{row.sector&&<small className="osprey-sector">{row.sector}</small>}
        </td>
        <td className={'num '+sign(row.move_pct)}>{pct(row.move_pct,true)}</td>
        <td className="osprey-time">{row.first||'—'}</td><td className="osprey-time">{row.last||'—'}</td>
        <td><span className="osprey-state" data-state={row.state}>{row.state}{row.confirmed&&' '+row.confirmed}</span></td>
        <td className="osprey-strikes">{row.strikes||'—'}</td>
      </tr>;})}
      {!visible.length&&<tr><td className="osprey-empty" colSpan={16}>
        {board?.available?'No stocks match these filters.':error||describe}
      </td></tr>}</tbody>
    </table></div>
    </div>
  </section>;
}
