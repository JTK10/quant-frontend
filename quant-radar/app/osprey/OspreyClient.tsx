'use client';

import {useEffect,useMemo,useState} from 'react';
import {buildTradingViewUrl} from '@/utils/backend';
import {istSessionDate} from '@/utils/sessionPolling';
import {
  addChartWatchlistSymbol,readChartWatchlist,CHART_WATCHLIST_STORAGE_KEY,CHART_WATCHLIST_UPDATED_EVENT,
} from '@/utils/chartWatchlist';
import {createOspreyFeed} from './feed';
import {MODES,STATES,type OspreyBoard,type OspreyRow} from './model';

const headers=[
  ['score','Score'],['oi_5m','5m OI'],['oi_15m','15m OI'],['rvol','RVOL'],
  ['sector_strength','Sector strength'],['move_pct','Move so far'],
] as const;
type SortKey=typeof headers[number][0];
const pct=(value:number|null,signed=false)=>value===null?'—':(signed&&value>0?'+':'')+value.toFixed(2)+'%';
const sign=(value:number|null)=>value===null?'':value>0?'positive':value<0?'negative':'';

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
      const x=a[sort.key],y=b[sort.key];
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
  function chooseDay(value:string) {
    if (value===day&&!cut) return;
    setBoard(null);setError('');setCuts([]);setDay(value);setCut('');setCutDay('');
  }
  function chooseCut(value:string) {
    if (value===cut) return;
    setBoard(null);setError('');setCutDay(value?date:'');setCut(value);
  }
  const describe=board?.available
    ? 'Cut '+board.cut+' IST · '+visible.length+' of '+rows.length+' stocks'
    : board ? 'No completed Osprey cuts published for this session.' : 'Loading Osprey…';

  return <section className="osprey" aria-labelledby="osprey-title">
    <header>
      <div><h1 id="osprey-title">Osprey</h1><p>Multi-strike OI · {day ? 'Session '+day : 'Live'+(session?' · '+session:'')}</p></div>
      <div className="osprey-controls">
        <label>Session <input aria-label="Session date" type="date" max={istSessionDate()} value={day||session}
          onChange={event=>chooseDay(event.target.value)} /></label>
        <button type="button" onClick={()=>chooseDay('')} disabled={!day&&!cut}>Live</button>
        <button type="button" aria-label="Previous cut" disabled={selectedIndex<=0} onClick={()=>chooseCut(cuts[selectedIndex-1])}>‹</button>
        <select aria-label="Five-minute cut" value={cut} onChange={event=>chooseCut(event.target.value)}>
          <option value="">Latest cut</option>
          {cuts.map(time=><option key={time} value={time}>{time} IST</option>)}
        </select>
        <button type="button" aria-label="Next cut" disabled={!cut||selectedIndex<0||selectedIndex>=cuts.length-1} onClick={()=>chooseCut(cuts[selectedIndex+1])}>›</button>
        <select aria-label="Ranking mode" value={mode} onChange={event=>setMode(event.target.value as OspreyRow['mode'])}>
          {MODES.map(item=><option key={item}>{item}</option>)}
        </select>
        <select aria-label="Rows" value={limit} onChange={event=>setLimit(event.target.value)}>
          <option value="30">Top 30</option><option value="all">All stocks</option>
        </select>
        <select aria-label="Side" value={side} onChange={event=>setSide(event.target.value)}>
          <option value="">All sides</option><option value="BULL">Bulls</option><option value="BEAR">Bears</option>
        </select>
        <select aria-label="Filter by state" value={state} onChange={event=>setState(event.target.value)}>
          <option value="">All states</option>{STATES.map(item=><option key={item}>{item}</option>)}
        </select>
        <input aria-label="Search stocks" placeholder="Search stocks" type="search" value={query} onChange={event=>setQuery(event.target.value)} />
      </div>
    </header>
    <p role="status" className={error?'osprey-error':undefined}>{error||describe}{error&&board?.available?' · '+describe:''}</p>
    <div className="osprey-table"><table aria-label="Osprey stock rankings">
      <thead><tr><th scope="col">#</th><th scope="col">Stock</th><th scope="col">Side</th>
        {headers.map(([key,label])=><th key={key} scope="col"
          aria-sort={sort.key===key?(sort.descending?'descending':'ascending'):undefined}>
          <button type="button" onClick={()=>setSort(previous=>({key,descending:previous.key===key?!previous.descending:true}))}>
            {label}{sort.key===key?(sort.descending?' ↓':' ↑'):''}
          </button>
        </th>)}
        <th scope="col">First seen</th><th scope="col">Latest flow</th><th scope="col">State</th><th scope="col">Strikes</th>
      </tr></thead>
      <tbody>{visible.map((row,i)=><tr key={row.symbol}>
        <td className="num">{i+1}</td>
        <td><b>{row.symbol}</b><div className="osprey-actions">
          <button type="button" aria-label={'Add '+row.symbol+' to Charts watchlist'} aria-pressed={watchlist.includes(row.symbol)}
            disabled={watchlist.includes(row.symbol)} onClick={()=>setWatchlist(addChartWatchlistSymbol(row.symbol))}>
            {watchlist.includes(row.symbol)?'✓':'+'}
          </button>
          <a href={'/charts?'+new URLSearchParams({symbol:row.symbol,date})} target="_blank" rel="noopener noreferrer">Chart ↗</a>
          <a href={buildTradingViewUrl(row.symbol)} target="_blank" rel="noopener noreferrer">TV ↗</a>
        </div></td>
        <td className={row.side==='BULL'?'positive':row.side==='BEAR'?'negative':undefined}>{row.side}</td>
        <td className="num">{row.score?.toFixed(2)??'—'}</td>
        <td className="num" title={row.oi_5m_route}>{pct(row.oi_5m)}</td>
        <td className="num" title={row.oi_15m_route}>{pct(row.oi_15m)}</td>
        <td className="num">{row.rvol===null?'—':row.rvol.toFixed(2)+'×'}{row.rvol!==null&&row.rvol_sessions?<small> {row.rvol_sessions}d</small>:null}</td>
        <td className="num" title={row.sector_samples?row.sector_source+' breadth · '+row.sector_samples+' stocks':undefined}>
          {pct(row.sector_strength,true)}{row.sector&&<small className="osprey-sector">{row.sector}</small>}
        </td>
        <td className={'num '+sign(row.move_pct)}>{pct(row.move_pct,true)}</td>
        <td>{row.first||'—'}</td><td>{row.last||'—'}</td>
        <td>{row.confirmed?'Confirmed '+row.confirmed:row.state}</td><td className="osprey-strikes">{row.strikes||'—'}</td>
      </tr>)}
      {!visible.length&&<tr><td colSpan={13}>{board?.available?'No stocks match these filters.':describe}</td></tr>}</tbody>
    </table></div>
  </section>;
}
