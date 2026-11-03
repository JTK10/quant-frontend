'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowDownUp,Check,ChevronLeft,ChevronRight,ExternalLink,Plus,Search} from 'lucide-react';
import {buildTradingViewUrl} from '@/utils/backend';
import {addChartWatchlistSymbol,readChartWatchlist,CHART_WATCHLIST_STORAGE_KEY,CHART_WATCHLIST_UPDATED_EVENT} from '@/utils/chartWatchlist';
import {lineKey,type LineBoard,type LineRow,type LineSession} from './types';
import {createLineArchiveFeed,createLineLiveFeed} from './feed';
import {istSessionDate} from '@/utils/sessionPolling';
import './line-breaks.css';

type Mode='setup'|'move';
type Sort='rank'|'move_pct'|'fresh_oi_share_pct';
type Level='all'|'pdh'|'pdl'|'either';
const percent=(value:number|null)=>value===null?'—':`${value>0?'+':''}${value.toFixed(2)}%`;
const levelFlag=(value:boolean|null)=>value===true?'Yes':value===null?'?':'—';
const archiveCache=new Map<string,LineBoard>();

function readCached(key:string){return archiveCache.get(key)??null;}
function saveCached(key:string,value:LineBoard){
  archiveCache.delete(key);archiveCache.set(key,value);
  while(archiveCache.size>8)archiveCache.delete(archiveCache.keys().next().value!);
}

function levelMatches(row:LineRow,level:Level){
  const bull=row.direction==='BULL'&&row.pdh_broken,bear=row.direction==='BEAR'&&row.pdl_broken;
  return level==='all'||level==='pdh'&&bull||level==='pdl'&&bear||level==='either'&&(bull||bear);
}

export default function LineBreaksClient({initialDate,initialCut,sessions}:{initialDate:string;initialCut:string;sessions:LineSession[]}){
  const [date,setDate]=useState(initialDate),[cut,setCut]=useState(initialCut);
  const [board,setBoard]=useState<LineBoard|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [mode,setMode]=useState<Mode>('setup'),[level,setLevel]=useState<Level>('all');
  const [query,setQuery]=useState(''),[qualified,setQualified]=useState(false);
  const [sort,setSort]=useState<Sort>('rank'),[descending,setDescending]=useState(true);
  const [detail,setDetail]=useState<LineRow|null>(null);
  const [watchlist,setWatchlist]=useState<string[]>([]),[notice,setNotice]=useState('');
  const key=`${date}|${cut}`;
  const live=date===istSessionDate()&&cut==='latest';
  const availableSessions=sessions.some(item=>item.date===date)?sessions:[...sessions,{date,cuts:0,coverage:'live_capture',last_cut:'',bytes:0}];

  useEffect(()=>{
    const sync=()=>setWatchlist(readChartWatchlist());
    const storage=(event:StorageEvent)=>{if(event.key===null||event.key===CHART_WATCHLIST_STORAGE_KEY)sync();};
    sync();window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT,sync);window.removeEventListener('storage',storage);};
  },[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),2500);return()=>clearTimeout(timer);},[notice]);

  useEffect(()=>{
    const saved=live?null:readCached(key);
    if(saved){setBoard(saved);setError('');setLoading(false);return;}
    setLoading(true);setError('');
    const read=async(session:string,signal:AbortSignal)=>{
        const url=`/api/oi-line-breaks?${new URLSearchParams({date:session,cut})}`;
        const response=await fetch(url,{cache:'default',signal});
        if(response.status===401){window.location.assign(`/login?next=${encodeURIComponent('/korat')}`);throw Error('Session expired');}
        const data=await response.json();
        if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Korat board unavailable');
        if(data.source!=='oi-line-breaks'||data.date!==session||!Array.isArray(data.setup)||!Array.isArray(data.move)||
          !Array.isArray(data.cuts)||data.cut!==''&&!data.cuts.includes(data.cut)||cut!=='latest'&&data.cut!==cut||
          data.setup.length>400||data.move.length>400)throw Error('Invalid Korat board');
        return data as LineBoard;
      };
    const feed=live?createLineLiveFeed({date,now:Date.now,hidden:()=>document.hidden,
      setTimer:setTimeout,clearTimer:clearTimeout,read,
      onDate:next=>{setDate(next);setBoard(null);setError('');setLoading(true);
        window.history.replaceState(null,'',`/korat?${new URLSearchParams({date:next})}`);},
      onData:data=>{setBoard(data);setError('');},
      onError:message=>setError(message),onSettled:()=>setLoading(false),
    }):createLineArchiveFeed({hidden:()=>document.hidden,
      read:signal=>read(date,signal),
      onData:data=>{saveCached(key,data);setBoard(data);setError('');},
      onError:message=>setError(message),onSettled:()=>setLoading(false),
    });
    document.addEventListener('visibilitychange',feed.visibility);
    return()=>{feed.stop();document.removeEventListener('visibilitychange',feed.visibility);};
  },[key,date,cut,live]);

  const current=board?.date===date&&(cut==='latest'||board.cut===cut)?board:null;
  const source=useMemo(()=>current?.[mode]??[],[current,mode]);
  const searched=query.trim().toUpperCase();
  const visible=useMemo(()=>{
    const rows=source.filter(row=>levelMatches(row,level)&&(!qualified||row.qualified)&&
      (!searched||row.symbol.includes(searched)||String(row.strike).includes(searched)));
    if(sort==='rank')return rows;
    return [...rows].sort((a,b)=>{
      const av=a[sort]??-Infinity,bv=b[sort]??-Infinity;
      return (descending?bv-av:av-bv)||a.rank-b.rank;
    });
  },[source,level,qualified,searched,sort,descending]);
  const bulls=visible.filter(row=>row.direction==='BULL'),bears=visible.filter(row=>row.direction==='BEAR');
  const selectedDetail=detail?visible.find(row=>lineKey(row)===lineKey(detail))??null:null;
  const evidence=selectedDetail?current?.evidence[lineKey(selectedDetail)]:null;
  const cuts=current?.cuts??[];
  const cutIndex=cuts.indexOf(current?.cut??'');
  const coverage=current?.coverage??sessions.find(session=>session.date===date)?.coverage;
  const coverageText=coverage==='live_capture'||current?.mode==='live'
    ? 'Live from existing VM2 captures · exact front-expiry strikes from three prior OI closes.'
    : coverage==='all_nearby_strikes'
    ? 'Full nearby front-expiry strikes from three previous chain closes (within 6% of prior spot).'
    : date==='2026-10-27'||date==='2026-10-28'
      ? 'Saved chart lines only; one or two previous OI sources, so two-day buildup cannot qualify.'
      : 'Saved chart OI lines only; other strikes may be absent.';
  const changeSort=(field:Sort)=>{
    if(sort!==field){setSort(field);setDescending(true);}
    else if(descending)setDescending(false);
    else{setSort('rank');setDescending(true);}
  };
  const saveUrl=(session:string,time:string)=>window.history.replaceState(null,'',`/korat?${new URLSearchParams(time==='latest'?{date:session}:{date:session,cut:time})}`);
  const chooseDate=(value:string)=>{if(!availableSessions.some(session=>session.date===value))return;setDate(value);setCut('latest');setBoard(null);setDetail(null);setError('');saveUrl(value,'latest');};
  const chooseCut=(value:string)=>{setCut(value);setBoard(null);setDetail(null);setError('');saveUrl(date,value);};

  function table(rows:LineRow[],side:'BULL'|'BEAR'){
    return <section className={`line-panel ${side==='BULL'?'bull':'bear'}`} aria-label={`${side==='BULL'?'Bullish':'Bearish'} OI line breaks`}>
      <div className="line-panel-head"><h2>{side==='BULL'?'Bullish · CE line crossed upward':'Bearish · PE line crossed downward'}</h2><span>{rows.length} shown</span></div>
      <div className="line-table-wrap"><table><thead><tr><th>Side #</th><th>All #</th><th>Stock</th><th><button type="button" onClick={()=>changeSort('move_pct')} aria-label="Sort by movement after break">Move % <ArrowDownUp size={11}/></button></th><th>Strike</th><th>Broke</th><th>{side==='BULL'?'PDH':'PDL'}</th><th>Defended<br/>days</th><th>OI build<br/>days</th><th><button type="button" onClick={()=>changeSort('fresh_oi_share_pct')} aria-label="Sort by fresh OI percent">Fresh OI % <ArrowDownUp size={11}/></button></th><th>Charts</th></tr></thead>
        <tbody>{rows.map(row=><tr key={lineKey(row)} className={selectedDetail&&lineKey(selectedDetail)===lineKey(row)?'selected':''}>
          <td>{row.direction_rank}</td><td>{row.rank}</td><td className="stock"><button type="button" onClick={()=>setDetail(row)} title="Show earlier cash and OI evidence">{row.symbol}</button>{row.qualified&&<span title="Two or more defended days with fresh OI">●</span>}</td>
          <td className={row.move_pct!=null&&row.move_pct>=0?'positive':'negative'}>{percent(row.move_pct)}</td><td>₹{row.strike.toLocaleString('en-IN')}</td><td>{row.break_cut}</td><td>{levelFlag(side==='BULL'?row.pdh_broken:row.pdl_broken)}</td><td>{row.respected_days}</td><td>{row.trapped_buildup_days}</td><td>{row.fresh_oi_share_pct.toFixed(2)}%</td>
          <td><div className="line-actions"><button type="button" title={watchlist.includes(row.symbol)?'Already in Charts watchlist':'Add to Charts watchlist'} aria-label={`Add ${row.symbol} to Charts watchlist`} disabled={watchlist.includes(row.symbol)} onClick={()=>{setWatchlist(addChartWatchlistSymbol(row.symbol));setNotice(`${row.symbol} added to Charts watchlist`);}}>{watchlist.includes(row.symbol)?<Check size={13}/>:<Plus size={13}/>}</button><a href={`/charts?${new URLSearchParams({symbol:row.symbol,date})}`} target="_blank" rel="noopener noreferrer" title={`Open ${row.symbol} in Charts`}>Chart</a><a href={buildTradingViewUrl(row.symbol,row.symbol)} target="_blank" rel="noopener noreferrer" title={`Open ${row.symbol} on TradingView`} aria-label={`Open ${row.symbol} on TradingView`}><ExternalLink size={13}/></a></div></td>
        </tr>)}</tbody></table>{!rows.length&&<div className="line-empty">No lines match these filters at this cut.</div>}</div>
    </section>;
  }

  return <main className="line-page">
    <header className="line-header"><div><div className="line-eyebrow">NSE F&amp;O · LIVE EXACT-STRIKE SCANNER</div><h1>Korat</h1><p>Previously defended option lines, ranked at each completed five-minute candle.</p></div><label>Session · IST<select aria-label="Korat session" value={date} onChange={event=>chooseDate(event.target.value)}>{[...availableSessions].reverse().map(session=><option key={session.date} value={session.date}>{session.date}{session.date===istSessionDate()?' · Today':''}</option>)}</select></label></header>
    <div className="line-context"><strong>{date}</strong><span>{live?'LIVE · AUTO 5 MIN':'SAVED SESSION'}</span><span>{coverageText}</span><span>{current?.prior_day?`Previous cash session ${current.prior_day} · Latest completed cut ${cuts.at(-1)} IST`:live?'Waiting for first published completed cut':'Saved research replay'}</span></div>
    <div className="line-controls"><label>Cut · IST<select aria-label="Five-minute cut" value={cut} onChange={event=>chooseCut(event.target.value)}><option value="latest">Latest {live?'live':'saved'}</option>{cuts.map(value=><option key={value} value={value}>{value}</option>)}</select></label><button type="button" aria-label="Previous cut" disabled={cutIndex<=0} onClick={()=>chooseCut(cuts[cutIndex-1])}><ChevronLeft size={16}/></button><button type="button" aria-label="Next cut" disabled={cutIndex<0||cutIndex>=cuts.length-1} onClick={()=>chooseCut(cuts[cutIndex+1])}><ChevronRight size={16}/></button><label>Rank by<select aria-label="Ranking mode" value={mode} onChange={event=>{setMode(event.target.value as Mode);setDetail(null);}}><option value="setup">OI setup</option><option value="move">Move after break</option></select></label><label>PDH / PDL<select aria-label="PDH PDL filter" value={level} onChange={event=>setLevel(event.target.value as Level)}><option value="all">All lines</option><option value="pdh">PDH broken · bullish</option><option value="pdl">PDL broken · bearish</option><option value="either">Either matching break</option></select></label><label className="line-search"><Search size={14}/><input aria-label="Find stock or strike" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Stock or strike"/></label><label className="line-check"><input type="checkbox" checked={qualified} onChange={event=>setQualified(event.target.checked)}/>Two-day OI build only</label></div>
    <div className="line-status" role="status">{error?`${error}${current?.cut?' · Showing the last successful same-session board (stale).':''}`:loading?'Loading Korat…':current?.status==='PENDING'?'Waiting for the first completed VM2 cash and option capture.':current?`${current.cut} IST · ${visible.length} / ${source.length} stocks · ${current.status??'READY'}${current.stale?' · stale':''}${current.recovered?' · recovered after the cut':''}${current.coverage_counts&&!current.coverage_counts.wicks_complete?' · later PDH/PDL wicks unavailable':''} · ${mode==='setup'?'OI setup rank':'move-after-break rank'}`:'No board for this session.'}</div>
    <div className="line-panels">{table(bulls,'BULL')}{table(bears,'BEAR')}</div>
    <section className="line-detail" aria-label="Exact strike evidence"><h2>{selectedDetail?`${selectedDetail.symbol} · ${selectedDetail.leg} ₹${selectedDetail.strike.toLocaleString('en-IN')}`:'Exact-strike evidence'}</h2>{selectedDetail&&evidence?<><div className="line-detail-metrics"><span>First break <b>{selectedDetail.break_cut} IST</b></span><span>Defended days <b>{selectedDetail.respected_days}</b></span><span>Fresh OI days <b>{selectedDetail.trapped_buildup_days}</b></span><span>Fresh OI <b>{selectedDetail.fresh_oi_share_pct.toFixed(2)}%</b></span><span>OI added on defended days <b>{evidence.fresh_oi_added.toLocaleString('en-IN')}</b></span><span>Net OI first→last <b>{evidence.net_oi_change.toLocaleString('en-IN')}</b></span></div><p>Respected: {evidence.respected_dates||'none'} · Fresh build: {evidence.trapped_dates||'none'}</p><div className="line-evidence">{evidence.prior_day_evidence.split(' | ').map((entry,i)=><span key={i}>{entry.replaceAll(',', ' · ')}</span>)}</div></>:<p>Select a stock to inspect its prior cash and OI observations.</p>}</section>
    <footer className="line-footer">A CE close above the exact strike or PE close below it starts the line. It stays on the board after its first break. “Move %” is the directional stock move since that break. Fresh OI % is positive OI added on defended prior days divided by the stock&apos;s four displayed line OI at the latest prior close. A zero means no positive addition on defended days. PDH/PDL uses prior complete-session extremes and completed-candle wicks when available; ? means late wicks were unavailable. Live cuts reuse VM2&apos;s existing producers. Saved dates replay frozen results.</footer>
    {notice&&<div className="line-toast" role="status">{notice}</div>}
  </main>;
}
