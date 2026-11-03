'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
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
  const dialog=useRef<HTMLDialogElement>(null);
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
  useEffect(()=>{if(detail&&!dialog.current?.open)dialog.current?.showModal();
    if(!detail&&dialog.current?.open)dialog.current.close();},[detail]);

  useEffect(()=>{
    const saved=live?null:readCached(key);
    if(saved){setBoard(saved);setError('');setLoading(false);return;}
    setLoading(true);setError('');
    let latestBoard:LineBoard|null=null;
    const read=async(session:string,signal:AbortSignal)=>{
        const params=new URLSearchParams({date:session,cut});
        if(live&&latestBoard?.cut)params.set('after',latestBoard.cut);
        const url=`/api/oi-line-breaks?${params}`;
        const response=await fetch(url,{cache:'default',signal});
        if(response.status===401){window.location.assign(`/login?next=${encodeURIComponent('/korat')}`);throw Error('Session expired');}
        const data=await response.json();
        if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Korat board unavailable');
        if(data.unchanged===true){
          if(!latestBoard||data.date!==session||data.cut!==latestBoard.cut||!Array.isArray(data.cuts))
            throw Error('Invalid Korat cursor response');
          return {...latestBoard,status:data.status,stale:data.stale,cuts:data.cuts};
        }
        if(data.source!=='oi-line-breaks'||data.date!==session||!Array.isArray(data.setup)||!Array.isArray(data.move)||
          !Array.isArray(data.cuts)||data.cut!==''&&!data.cuts.includes(data.cut)||cut!=='latest'&&data.cut!==cut||
          data.setup.length>400||data.move.length>400)throw Error('Invalid Korat board');
        return data as LineBoard;
      };
    const feed=live?createLineLiveFeed({date,now:Date.now,hidden:()=>document.hidden,
      setTimer:setTimeout,clearTimer:clearTimeout,read,
      onDate:next=>{setDate(next);setBoard(null);setError('');setLoading(true);
        window.history.replaceState(null,'',`/korat?${new URLSearchParams({date:next})}`);},
      onData:data=>{latestBoard=data;setBoard(data);setError('');},
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
      <div className="line-panel-head"><h2>{side==='BULL'?'BULLISH SIGNALS':'BEARISH SIGNALS'}</h2><span>{rows.length} names</span></div>
      <div className="line-table-wrap"><table><thead><tr><th>#</th><th>Symbol</th><th><button type="button" onClick={()=>changeSort('move_pct')} aria-label="Sort by movement after break">Move % <ArrowDownUp size={11}/></button></th><th>Strike</th><th>Broke</th><th>{side==='BULL'?'PDH':'PDL'}</th><th>Days</th><th><button type="button" onClick={()=>changeSort('fresh_oi_share_pct')} aria-label="Sort by fresh OI percent">Fresh OI % <ArrowDownUp size={11}/></button></th><th>Links</th></tr></thead>
        <tbody>{rows.map(row=><tr key={lineKey(row)} className={selectedDetail&&lineKey(selectedDetail)===lineKey(row)?'selected':''}>
          <td>{row.rank}</td><td className="stock"><div className="line-stock"><button type="button" onClick={()=>setDetail(row)} title="Show cash and OI evidence">{row.symbol}</button>{row.qualified&&<span title="Two or more defended days with fresh OI">●</span>}<button className="line-watch" type="button" title={watchlist.includes(row.symbol)?'Already in Charts watchlist':'Add to Charts watchlist'} aria-label={`Add ${row.symbol} to Charts watchlist`} disabled={watchlist.includes(row.symbol)} onClick={()=>{setWatchlist(addChartWatchlistSymbol(row.symbol));setNotice(`${row.symbol} added to Charts watchlist`);}}>{watchlist.includes(row.symbol)?<Check size={11}/>:<Plus size={11}/>}</button></div></td>
          <td className={row.move_pct!=null&&row.move_pct>=0?'positive':'negative'}>{percent(row.move_pct)}</td><td>₹{row.strike.toLocaleString('en-IN')}</td><td>{row.break_cut}</td><td>{levelFlag(side==='BULL'?row.pdh_broken:row.pdl_broken)}</td><td title={`Defended ${row.respected_days} days · fresh OI build ${row.trapped_buildup_days} days`}>{row.respected_days} / {row.trapped_buildup_days}</td><td>{row.fresh_oi_share_pct.toFixed(2)}%</td>
          <td><div className="line-actions"><a href={`/charts?${new URLSearchParams({symbol:row.symbol,date})}`} target="_blank" rel="noopener noreferrer" title={`Open ${row.symbol} in Charts`}>Chart</a><a href={buildTradingViewUrl(row.symbol,row.symbol)} target="_blank" rel="noopener noreferrer" title={`Open ${row.symbol} on TradingView`} aria-label={`Open ${row.symbol} on TradingView`}><ExternalLink size={13}/></a></div></td>
        </tr>)}</tbody></table>{!rows.length&&<div className="line-empty">No lines match these filters at this cut.</div>}</div>
    </section>;
  }

  return <div className="line-page"><main className="line-app">
    <header className="line-header"><div className="line-brand"><span className="line-logo">K</span><h1>KORAT</h1></div><div className="line-header-actions"><span className={`line-live ${live?'active':''}`}>{live?'LIVE · AUTO 5M':'SAVED'}</span><label>DATE<select aria-label="Korat session" value={date} onChange={event=>chooseDate(event.target.value)}>{[...availableSessions].reverse().map(session=><option key={session.date} value={session.date}>{session.date}{session.date===istSessionDate()?' · Today':''}</option>)}</select></label><a href="/charts">Charts ↗</a></div></header>
    <div className="line-toolbar"><div className="line-timebox"><span>CUT</span><button type="button" aria-label="Previous cut" disabled={cutIndex<=0} onClick={()=>chooseCut(cuts[cutIndex-1])}><ChevronLeft size={16}/></button><select aria-label="Five-minute cut" value={cut} onChange={event=>chooseCut(event.target.value)}><option value="latest">Latest {current?.cut??''}</option>{cuts.map(value=><option key={value} value={value}>{value}</option>)}</select><button type="button" aria-label="Next cut" disabled={cutIndex<0||cutIndex>=cuts.length-1} onClick={()=>chooseCut(cuts[cutIndex+1])}><ChevronRight size={16}/></button></div><label>RANK<select aria-label="Ranking mode" value={mode} onChange={event=>{setMode(event.target.value as Mode);setDetail(null);}}><option value="setup">OI setup</option><option value="move">Move after break</option></select></label><label>PDH / PDL<select aria-label="PDH PDL filter" value={level} onChange={event=>setLevel(event.target.value as Level)}><option value="all">All lines</option><option value="pdh">PDH broken · bullish</option><option value="pdl">PDL broken · bearish</option><option value="either">Either matching break</option></select></label><label className="line-search"><Search size={14}/><input aria-label="Find stock or strike" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search stock or strike"/></label><label className="line-check"><input type="checkbox" checked={qualified} onChange={event=>setQualified(event.target.checked)}/>2-day OI build</label>{cut!=='latest'&&<button className="line-jump" type="button" onClick={()=>chooseCut('latest')}>Jump to latest</button>}</div>
    {(error||loading||!current||current.status==='PENDING'||current.stale||current.status==='DEGRADED'||current.recovered)&&<div className="line-status" role="status">{error?`${error}${current?.cut?' · Last successful cut retained':''}`:loading?'Loading Korat…':current?.status==='PENDING'?'Waiting for the first completed cut':!current?'No board for this session':`${current.cut} IST · ${current.status}${current.recovered?' · recovered':''}${current.coverage_counts&&!current.coverage_counts.wicks_complete?' · PDH/PDL wicks unavailable':''}`}</div>}
    <div className="line-panels">{table(bulls,'BULL')}{table(bears,'BEAR')}</div>
    {notice&&<div className="line-toast" role="status">{notice}</div>}
  </main><dialog ref={dialog} className="line-dialog" aria-label="Stock OI details" onCancel={()=>setDetail(null)} onClick={event=>{if(event.target===event.currentTarget)setDetail(null);}}><aside className="line-drawer"><div className="line-drawer-head"><h2>{selectedDetail?`${selectedDetail.symbol} · ${selectedDetail.leg} ₹${selectedDetail.strike.toLocaleString('en-IN')}`:detail?.symbol}</h2><button type="button" aria-label="Close stock details" onClick={()=>setDetail(null)}>×</button></div>{selectedDetail&&evidence&&<><div className="line-detail-metrics"><span>First break <b>{selectedDetail.break_cut} IST</b></span><span>Defended days <b>{selectedDetail.respected_days}</b></span><span>Fresh OI days <b>{selectedDetail.trapped_buildup_days}</b></span><span>Fresh OI <b>{selectedDetail.fresh_oi_share_pct.toFixed(2)}%</b></span><span>OI added <b>{evidence.fresh_oi_added.toLocaleString('en-IN')}</b></span><span>Net OI <b>{evidence.net_oi_change.toLocaleString('en-IN')}</b></span></div><p>Respected: {evidence.respected_dates||'none'}<br/>Fresh build: {evidence.trapped_dates||'none'}</p><div className="line-evidence">{evidence.prior_day_evidence.split(' | ').map((entry,i)=><span key={i}>{entry.replaceAll(',', ' · ')}</span>)}</div></>}</aside></dialog></div>;
}
