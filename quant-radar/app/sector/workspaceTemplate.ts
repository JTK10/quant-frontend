// Approved compact Sector Scope workspace powered by R.Fac sector logic.
export default `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sector Scope (R.Fac)</title><style>
:root{color-scheme:dark;--bg:#0a0f16;--panel:#101721;--line:#202c3b;--text:#e5edf7;--muted:#8293a9;--green:#5ee0b3;--red:#ff8597;--accent:#7ed6ea;--amber:#fbbf24}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px Inter,Segoe UI,sans-serif}button,input,select{font:inherit;color:inherit}button,select,input{background:#151f2d;border:1px solid var(--line);border-radius:6px;padding:5px 7px}button{cursor:pointer}button:hover{border-color:#608397}button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--accent)}a{color:var(--accent);text-decoration:none}
.app{min-height:100vh;display:flex;flex-direction:column}
.brandbar{height:36px;min-height:36px;display:flex;align-items:center;gap:10px;padding:0 14px;border-bottom:1px solid var(--line);background:#0d141e;font-size:11px}
.brand{font-weight:800;letter-spacing:2px;font-size:11px}.logo{color:var(--green);font-size:18px}
.badge{font-size:9px;letter-spacing:1.2px;padding:3px 6px;border:1px solid #355767;border-radius:4px;color:var(--accent)}
.muted{color:var(--muted)}.spacer{flex:1}
.top{padding:8px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex-shrink:0}
.eyebrow{text-transform:uppercase;letter-spacing:1.4px;font-size:9px;color:var(--accent);margin-bottom:3px}
h1{font-size:18px;margin:0;font-weight:650;letter-spacing:-.2px}
.controls{display:flex;gap:7px;align-items:center;margin-left:auto;flex-wrap:wrap}
.controls label{display:flex;gap:6px;align-items:center;font-size:10px;color:var(--muted)}
.controls select{padding:4px 6px;font-size:11px}
.marketmetric{min-width:170px;border-left:1px solid var(--line);padding-left:10px}
.marketmetric small{display:block;font-size:9px;letter-spacing:.5px}
.marketmetric strong{font-size:18px;font-weight:600;margin-right:6px;font-variant-numeric:tabular-nums}
.multiple{display:inline-block;padding:2px 5px;border-radius:4px;background:#1d303c;color:var(--accent);font-size:10px}
.baseline{display:block;font-size:9px;color:var(--muted);margin-top:2px}
.timeline{display:flex;gap:9px;align-items:center;margin:0 14px 7px;padding:4px 9px;border:1px solid var(--line);border-radius:8px;background:var(--panel);min-height:30px;flex-shrink:0}
.timeline button{padding:2px 7px}input[type=range]{flex:1;accent-color:var(--accent);padding:0}
.time{font-variant-numeric:tabular-nums;color:var(--accent);font-weight:700;font-size:11px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;min-height:0}
.towerpanel{margin:0 14px 12px;background:linear-gradient(180deg,#111b26,#0b111b);overflow:hidden}
.towerheading{display:flex;justify-content:space-between;align-items:center;padding:12px 16px 0;gap:12px;flex-wrap:wrap}
.towerheading h2{margin:0 0 4px;font-size:18px}.towerheading .muted{font-size:11px}
.towerchart{overflow:auto;padding:0 12px}.towerchart svg{display:block;width:100%;min-width:850px;max-height:310px}
.towerbar{cursor:pointer;outline:none}.towerbar:hover rect,.towerbar:focus rect{stroke:#fff;stroke-width:2}.towerbar text{pointer-events:none}
.workspace{display:grid;grid-template-columns:235px minmax(0,1fr);gap:10px;padding:0 14px;height:640px;min-height:520px;flex:none}
.sector-panel{display:flex;flex-direction:column}
.sectionhead{padding:9px 10px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.sectionhead h2{font-size:11px;margin:0}.sectionhead select{font-size:9px;padding:3px;max-width:122px}
.sectors{overflow:auto;padding:4px}
.sector{width:100%;text-align:left;display:block;padding:7px 8px;margin:2px 0;background:transparent;border:1px solid transparent;border-radius:7px}
.sector.selected{background:#192c38;border-color:#3d6678}
.sector-top{display:flex;align-items:center;gap:7px}
.rank{font-size:10px;color:var(--muted);width:17px}.sector-name{font-weight:650;font-size:10.5px;letter-spacing:.3px}
.bias{margin-left:auto;font-variant-numeric:tabular-nums;font-size:13px;font-weight:700}
.sector-sub{margin:4px 0 0 24px;display:flex;gap:8px;font-size:9.5px;color:var(--muted)}
.bull{color:var(--green)}.bear{color:var(--red)}
.breadth{height:3px;display:flex;overflow:hidden;border-radius:2px;margin:4px 0 0 24px;background:#263140}
.main{display:flex;flex-direction:column;gap:8px;min-height:0}
.sector-intro{padding:10px 12px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;flex-shrink:0}
.sector-title{font-size:16px;font-weight:700;margin-bottom:2px}
.stat{border-left:1px solid var(--line);padding-left:14px}.stat small{color:var(--muted);font-size:9px}.stat b{display:block;font-size:17px;margin-top:2px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.flows{display:flex;gap:6px;overflow:auto;min-height:70px;max-height:78px;padding-bottom:2px;flex-shrink:0}
.flow{flex:1;min-width:130px;text-align:left;padding:7px 9px;white-space:nowrap;background:var(--panel);border-color:var(--line);border-radius:6px}
.flow.active{border-color:#6aabb9;background:#172936}
.flow-name{font-size:10px;display:block;margin-bottom:4px}.flow-value{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.flow-count{font-size:9.5px;color:var(--muted);float:right;margin-top:4px}
.stocks{display:flex;flex-direction:column;flex:1;overflow:hidden;border-radius:8px}
.tabletools{padding:6px 9px;display:flex;align-items:center;gap:7px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.tabletools>b{font-size:10px}.tabletools input{width:140px;padding:4px 7px;font-size:11px}.tabletools select{padding:4px;font-size:10px}
.tabletools label{font-size:10px;color:var(--muted);display:flex;gap:4px;align-items:center}.tabletools input[type=checkbox]{width:auto;accent-color:var(--accent)}
.tablewrap{overflow:auto;flex:1;min-height:100px}
table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:11px}
th{position:sticky;top:0;background:#141e2b;color:var(--muted);text-align:right;font-size:10px;font-weight:500;padding:7px 7px;z-index:1}
th:first-child,td:first-child{text-align:left;padding-left:11px}
td{text-align:right;padding:6px 7px;border-bottom:1px solid #1d2836;font-variant-numeric:tabular-nums;line-height:1.25}
th button{padding:0;background:transparent;border:0;font-size:inherit;color:inherit}
tbody tr:hover{background:#16212e}
.symbol{font-size:11.5px;font-weight:700}.sub{font-size:9px;color:var(--muted);margin-top:2px}
.rf-pill{display:inline-block;min-width:40px;text-align:center;padding:2px 5px;border-radius:5px;font-weight:700;background:rgba(126,214,234,.14);color:#8ee5f8}
.rf-pill.boost{background:rgba(34,211,238,.22);color:#22d3ee}.rf-pill.hot{background:rgba(245,158,11,.22);color:#fcd34d}
.stale{font-size:8.5px;padding:1px 4px;border-radius:3px;background:rgba(251,191,36,.18);color:var(--amber);margin-left:4px;font-weight:700}
.pill{font-size:9px;padding:2px 4px;border-radius:4px;display:inline-block;background:#263341;color:#a7b6ca}.pill.yes{background:#17392f;color:var(--green)}.pill.no{background:#352531;color:var(--red)}
.actions{display:flex;gap:4px;justify-content:flex-end}.icon{padding:3px 5px;color:var(--accent);border:1px solid var(--line);border-radius:4px;font-size:9.5px}
.foot{padding:6px 10px;display:flex;justify-content:space-between;color:var(--muted);font-size:9.5px;border-top:1px solid var(--line)}
.bottom{padding:10px 16px;display:flex;justify-content:space-between;color:var(--muted);font-size:9.5px;flex-wrap:wrap;gap:8px}
.empty{text-align:center;padding:35px;color:var(--muted)}
.help{position:fixed;inset:0;background:#000a;z-index:4;display:grid;place-items:center}.help[hidden]{display:none}
.dialog{max-width:650px;margin:20px;padding:24px;background:var(--panel);border:1px solid var(--line);border-radius:12px;line-height:1.65}.dialog h2{margin-top:0}
@media(max-width:900px){.workspace{display:block;height:auto}.sector-panel{max-height:200px;margin-bottom:10px}.sectors{display:grid;grid-template-columns:1fr 1fr}.main{min-height:560px}.tablewrap{max-height:60vh}}
</style></head><body><div class="app">
<header class="brandbar"><span class="logo">↗↘</span><span class="brand">JT RADAR</span><span class="muted">/</span><span>Sector Scope</span><span class="spacer"></span><span class="badge">R.FAC · 5 MIN</span><a class="badge" href="/intraday-boost" target="_top">Intraday Boost ↗</a><button id="help">How to read</button></header>
<div class="top"><div><div class="eyebrow">R.Fac Sector Scope</div><h1>Sector momentum powered by R.Fac.</h1></div><div class="controls"><label>Session <input type="date" id="date"></label><label>Snapshot <select id="cut"></select></label><div class="marketmetric" id="marketBull"></div><div class="marketmetric" id="marketBear"></div></div></div>
<div id="feedStatus" role="status" style="padding:0 14px 4px;color:#8293a9;font-size:10px"></div>
<div class="timeline"><span class="muted">09:15</span><input id="slider" aria-label="Replay snapshot" type="range" min="0" max="74"><span class="muted">15:25</span><span id="clock" class="time">10:00 IST</span><button id="prev" aria-label="Previous snapshot">‹</button><button id="next" aria-label="Next snapshot">›</button><button id="latest">Latest / live</button></div>
<section class="towerpanel panel"><div class="towerheading"><div><div class="eyebrow">01 / R.FAC SECTOR OVERVIEW</div><h2>Sector R.Fac towers</h2><span class="muted">Green = positive Net R.Fac (Bull leadership) · Red = negative Net R.Fac (Bear leadership) · click a sector to inspect its stocks below</span></div><span class="badge" id="towerStamp"></span></div><div id="towerChart" class="towerchart"></div></section>
<div class="workspace" id="detailWorkspace">
<aside class="panel sector-panel"><div class="sectionhead"><h2>02 / SECTORS</h2><select id="sectorSort" aria-label="Sector ranking"><option value="net">Net R.Fac ↓</option><option value="abs">Abs Net R.Fac ↓</option><option value="avg">Avg R.Fac ↓</option><option value="boost">Boosted ≥1.5 ↓</option><option value="bull">Bull count ↓</option><option value="bear">Bear count ↓</option><option value="name">A → Z</option></select></div><div class="sectors" id="sectors"></div></aside>
<main class="main"><div class="panel sector-intro" id="intro"></div><div class="flows" id="flows"></div><section class="panel stocks"><div class="tabletools"><b>04 / STOCK CHECK</b><input id="search" aria-label="Find stock" placeholder="Find a stock…"><select id="side" aria-label="Direction"><option value="ALL">All directions</option><option>BULL</option><option>BEAR</option></select><label><input type="checkbox" id="hideStale">Fresh only (hide stale)</label><span class="spacer"></span><button id="export">Export view ↓</button></div><div class="tablewrap"><table><thead><tr><th>Stock / SGN</th><th><button data-sort="rfac">R.Fac ↕</button></th><th><button data-sort="curr_rfac">Curr ↕</button></th><th><button data-sort="move_pct">Move % ↕</button></th><th><button data-sort="oi_bias">OI bias ↕</button></th><th>CE / PE %</th><th>PDH / PDL</th><th>Watchlist</th><th>Open</th></tr></thead><tbody id="stocks"></tbody></table></div><div class="foot"><span id="rowcount"></span><span>+ adds to the shared Charts watchlist</span></div></section></main>
</div>
<footer class="bottom"><span id="coverage"></span><span>R.Fac = max(|Close − Open 09:20|) / Mean 32d(|ΔClose|) · Signed Bull (+) / Bear (−) · recorded 5-min snapshots</span></footer>
</div>
<div class="help" id="modal" hidden><article class="dialog"><h2>Sector Scope — R.Fac Logic</h2><p><b>Stock R.Fac:</b> measures how many normal daily moves (32-day average daily |Close − Prev Close|) a stock has moved since its <b>09:20 IST open</b>, tracked as a monotonic high-water mark. Direction (Bull / Bear) is strictly <b>LTP ≥ Open 09:20</b> vs <b>LTP &lt; Open 09:20</b>.</p><p><b>Sector Net R.Fac (Towers):</b> each stock contributes <b>+R.Fac</b> when Bull and <b>−R.Fac</b> when Bear. A sector's Net R.Fac is the average signed R.Fac across its active members. Green rising towers indicate bullish R.Fac leadership; red falling towers indicate bearish leadership.</p><p><b>Fresh vs Stale:</b> <b>Curr</b> shows live current R.Fac. If Peak R.Fac ≥ 1.2 and price pulls back by ≥ 0.5 R.Fac, the stock is tagged <b>STALE</b> so you do not chase reversed moves.</p><p>Live mode reads the authenticated Rusty/R.Fac feed at most every 5 minutes while visible and pauses when the tab is hidden. Historical sessions load once without polling.</p><button id="closeHelp">Got it</button></article></div>
<script>
/*__PAYLOAD__*/
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let date=META.date,cut='',sector='PHARMA',bucket='ALL',data={},historical={},rows=[],visible=[],sort='rfac',desc=true,request=0;const cache=new Map();let controller=null,live=true,timer=null,lastFetch=0,watchlist=new Set();
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.type!=='SECTOR_WATCHLIST')return;watchlist=new Set(e.data.symbols||[]);if(cut)render();});
const num=v=>v===''||v==null?null:Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,sign=false)=>num(v)===null?'—':(sign&&Number(v)>0?'+':'')+Number(v).toFixed(2);
const avgKey=(arr,key)=>{let a=arr.map(r=>num(r[key])).filter(v=>v!==null);return a.length?a.reduce((a,b)=>a+b,0)/a.length:null};
function pill(status,time=''){let yes=status==='YES',no=status==='NO';return '<span class="pill '+(yes?'yes':no?'no':'')+'">'+(yes?'BROKEN':no?'NOT BROKEN':'UNAVAILABLE')+'</span>'+(time?'<div class="sub">'+esc(time.slice(-8,-3)||time)+'</div>':'')}
function hm(value){if(!value)return '';return value.includes(' ')?value.split(' ')[1].slice(0,5):value.slice(0,5)}
function project(snapshot){
 const board=buildRfacSectorScope(snapshot,MEMBERS),out=[];
 for(const s of board.sectors)for(const r of s.stocks){
  const row={sector:s.sec,symbol:r.symbol,direction:r.direction,classification:r.classification,ce_pct:r.ce,pe_pct:r.pe,move_pct:r.move,price:r.price,
   oi_bias:r.oiBias,pdh_pdl_broken:r.pdhPdlBroken,pdh_pdl_break_time:r.pdhPdlBreakTime,rusty_level_source:r.levelSource,
   ob_state:'UNAVAILABLE',ob_broken_time:'',ob_retest_breakout_time:'',
   rfac:r.rfac,curr_rfac:r.currRfac,signed_rfac:r.signedRfac,stale:r.stale?1:0,o20:r.o20,peak_cut:r.peakCut};
  out.push(META.fields.map(k=>row[k]??''));
 }return out;
}
async function loadDay(d,t,force=false){
 const key=d+'|'+(t||'latest'),hit=cache.get(key);if(!force&&hit&&(t||Date.now()-hit.at<300000))return hit.value;
 const response=await fetch('/api/panther-signals?date='+encodeURIComponent(d)+'&sources=rusty&view=rusty'+(t?'&cut='+encodeURIComponent(t):''),{cache:'default',signal:controller.signal});
 if(!response.ok)throw new Error(response.status===401?'Session expired. Sign in again.':'Feed unavailable ('+response.status+')');
 const payload=await response.json();if(!Array.isArray(payload.snapshots)||!Array.isArray(payload.cuts))throw new Error('Invalid feed');
 const snapshot=payload.snapshots.filter(s=>s.source==='rusty').at(-1);if(!snapshot)throw new Error('No published snapshot for this session');
 const actual=String(snapshot.cut||snapshot.time).slice(0,5);if(t&&actual!==t)throw new Error('Requested snapshot is unavailable');
 const value={cuts:Object.fromEntries(payload.cuts.map(c=>[c,[]])),actual};value.cuts[actual]=project(snapshot);
 cache.set(key,{at:Date.now(),value});while(cache.size>8)cache.delete(cache.keys().next().value);return value;
}
async function session(d,t='',s=sector,force=false){
 const token=++request;controller?.abort();controller=new AbortController();date=d;sector=s;$('date').value=date;
 try{const loaded=await loadDay(d,t,force);if(token!==request)return;data=loaded.cuts;historical=BASELINE;cut=loaded.actual;
  const cuts=Object.keys(data).sort();$('cut').innerHTML=cuts.map(c=>'<option>'+esc(c)+'</option>').join('');$('slider').max=Math.max(0,cuts.length-1);render();
  $('feedStatus').textContent='Published '+date+' '+cut+' IST · R.Fac Sector Scope · '+(live?'Latest mode · checks every 5 minutes when eligible':'Historical snapshot · no polling');
 }catch(e){if(e.name==='AbortError'||token!==request)return;$('feedStatus').textContent=e.message+(cut?' · Showing last successful '+date+' '+cut+' snapshot (stale).':'');if(!cut)$('stocks').innerHTML='<tr><td colspan="9" class="empty">'+esc(e.message)+'</td></tr>';}
}
function selectCut(t){live=false;session(date,t);schedule();}
function schedule(){clearTimeout(timer);const delay=live&&!document.hidden?sessionPollingDelay(date,300000):null;if(delay!==null)timer=setTimeout(()=>{if(!document.hidden&&live){lastFetch=Date.now();session(date,'',sector,true);}schedule();},delay);}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&live&&sessionPollingDelay(date,300000)!==null&&Date.now()-lastFetch>=300000){lastFetch=Date.now();session(date,'',sector,true);}schedule();});
window.addEventListener('pagehide',()=>{controller?.abort();clearTimeout(timer);});
function comparison(current,key){const b=historical[cut]?.[key];if(!b)return {badge:'No baseline',detail:'No earlier comparable sessions'};const [mean,n]=b;const ratio=num(current)!==null&&current>=0&&mean>0?current/mean:null;return {badge:ratio===null?'—':ratio.toFixed(2)+'×',detail:'Prior avg '+fmt(mean)+' · '+n+' '+(n===1?'session':'sessions')+' · '+cut+' IST'}}
function renderMarket(){
 const unique=[...new Map(rows.map(r=>[r.symbol,r])).values()];
 for(const side of ['BULL','BEAR']){
  const a=unique.filter(r=>r.direction===side&&num(r.rfac)!==null);
  const value=avgKey(a,'rfac');
  const boosted=a.filter(r=>num(r.rfac)>=1.5).length;
  $('market'+(side==='BULL'?'Bull':'Bear')).innerHTML='<small class="'+(side==='BULL'?'bull':'bear')+'">'+side+' AVG R.FAC · '+a.length+' STOCKS</small><strong>'+fmt(value)+'</strong><span class="multiple">'+boosted+' ≥1.5</span><span class="baseline">09:20 anchor · 32d denom</span>';
 }
}
function renderTowers(){
 const cards=Object.keys(MEMBERS).map(sec=>{
  const a=rows.filter(r=>r.sector===sec&&num(r.rfac)!==null&&r.direction!=='UNAVAILABLE');
  const bull=a.filter(r=>r.direction==='BULL').length,bear=a.filter(r=>r.direction==='BEAR').length;
  const net=avgKey(a,'signed_rfac'),avg=avgKey(a,'rfac'),boosted=a.filter(r=>num(r.rfac)>=1.5).length;
  return {sec,bull,bear,n:a.length,net,avg,boosted};
 }).sort((a,b)=>(b.net??-Infinity)-(a.net??-Infinity)||a.sec.localeCompare(b.sec));
 const maxAbs=Math.max(1.5,...cards.map(c=>Math.abs(c.net??0)));
 const axisMax=Math.ceil(maxAbs*2)/2;
 const W=1180,H=305,left=46,right=16,zero=128,halfH=102,scale=halfH/axisMax,gap=(W-left-right)/Math.max(cards.length,1);
 const ticks=[-axisMax,-axisMax/2,0,axisMax/2,axisMax];
 let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sector Net R.Fac towers">';
 for(const v of ticks){const y=zero-v*scale;svg+='<line x1="'+left+'" x2="'+(W-right)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="'+(v===0?'#52657a':'#243140')+'" stroke-dasharray="'+(v===0?'':'3 5')+'"/><text x="'+(left-8)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" fill="#8293a9" font-size="10">'+(v>0?'+':'')+v.toFixed(1)+'</text>';}
 for(const [i,d] of cards.entries()){
  const x=left+gap*(i+.5),v=d.net??0,y=zero-Math.max(v,0)*scale,ht=Math.max(2,Math.abs(v)*scale),color=d.net===null?'#546274':v>=0?'#4adea8':'#ff7187',active=d.sec===sector;
  svg+='<g class="towerbar" role="button" tabindex="0" data-tower="'+esc(d.sec)+'" aria-label="'+esc(d.sec)+': '+(d.net===null?'unavailable':fmt(v,true)+' Net R.Fac')+'"><title>'+esc(d.sec)+' · Net R.Fac '+fmt(d.net,true)+' · Avg R.Fac '+fmt(d.avg)+' · Bull '+d.bull+' / Bear '+d.bear+' · Boosted ≥1.5: '+d.boosted+'</title><rect x="'+(x-14).toFixed(1)+'" y="'+y.toFixed(1)+'" width="28" height="'+ht.toFixed(1)+'" rx="3" fill="'+color+'" opacity="'+(active?1:.74)+'" stroke="'+(active?'#e5edf7':'none')+'"/><text x="'+x.toFixed(1)+'" y="'+(v>=0?y-6:y+ht+13).toFixed(1)+'" text-anchor="middle" font-size="10.5" font-weight="600" fill="'+color+'">'+(d.net===null?'—':fmt(v,true))+'</text><text transform="translate('+(x-3).toFixed(1)+',244) rotate(35)" font-size="10" fill="'+(active?'#fff':'#9aacc1')+'">'+esc(d.sec)+'</text></g>';
 }
 $('towerChart').innerHTML=svg+'</svg>';$('towerStamp').textContent=date+' · '+cut+' IST';
}
function chooseTower(e){const b=e.target.closest('[data-tower]');if(!b)return;sector=b.dataset.tower;bucket='ALL';render();$('detailWorkspace').scrollIntoView({behavior:'smooth',block:'start'});}
$('towerChart').onclick=chooseTower;$('towerChart').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseTower(e);}};
function matchBucket(r,b){
 const rf=num(r.rfac);if(b==='ALL')return true;
 if(b==='BULL_BOOST')return r.direction==='BULL'&&rf!==null&&rf>=1.5;
 if(b==='BEAR_BOOST')return r.direction==='BEAR'&&rf!==null&&rf>=1.5;
 if(b==='BULL_EARLY')return r.direction==='BULL'&&rf!==null&&rf<1.5;
 if(b==='BEAR_EARLY')return r.direction==='BEAR'&&rf!==null&&rf<1.5;
 if(b==='STALE')return Number(r.stale)===1;
 return true;
}
function render(){
 rows=(data[cut]||[]).map(values=>Object.fromEntries(META.fields.map((k,i)=>[k,values[i]])));
 $('clock').textContent=cut+' IST';$('slider').value=Object.keys(data).sort().indexOf(cut);$('cut').value=cut;
 renderMarket();renderTowers();
 const groups=Object.entries(MEMBERS).map(([name,members])=>{
  const a=rows.filter(r=>r.sector===name),valid=a.filter(r=>num(r.rfac)!==null&&r.direction!=='UNAVAILABLE');
  const bull=valid.filter(r=>r.direction==='BULL').length,bear=valid.filter(r=>r.direction==='BEAR').length;
  const boost=valid.filter(r=>num(r.rfac)>=1.5).length;
  return {name,a,valid,net:avgKey(valid,'signed_rfac'),avg:avgKey(valid,'rfac'),bull,bear,boost,total:new Set(members).size};
 });
 const mode=$('sectorSort').value;
 groups.sort((a,b)=>mode==='name'?a.name.localeCompare(b.name):mode==='abs'?(Math.abs(b.net??-1)-Math.abs(a.net??-1)):mode==='avg'?((b.avg??-Infinity)-(a.avg??-Infinity)):mode==='boost'?(b.boost-a.boost):mode==='bull'?(b.bull-a.bull):mode==='bear'?(b.bear-a.bear):((b.net??-Infinity)-(a.net??-Infinity))||a.name.localeCompare(b.name));
 if(!groups.find(s=>s.name===sector))sector=groups[0].name;
 $('sectors').innerHTML=groups.map((s,i)=>'<button class="sector '+(s.name===sector?'selected':'')+'" data-sector="'+esc(s.name)+'"><div class="sector-top"><span class="rank">'+String(i+1).padStart(2,'0')+'</span><span class="sector-name">'+esc(s.name)+'</span><span class="bias '+((s.net??0)>=0?'bull':'bear')+'">'+fmt(s.net,true)+'</span></div><div class="sector-sub"><span class="bull">↑ '+s.bull+'</span><span class="bear">↓ '+s.bear+'</span><span>⚡'+s.boost+'</span><span>'+s.valid.length+'/'+s.total+'</span></div><div class="breadth"><i style="width:'+(s.valid.length?s.bull/s.valid.length*100:0)+'%;background:var(--green)"></i><i style="width:'+(s.valid.length?s.bear/s.valid.length*100:0)+'%;background:var(--red)"></i></div></button>').join('');
 const s=groups.find(g=>g.name===sector);
 const sb=avgKey(s.valid.filter(r=>r.direction==='BULL'),'rfac'),sr=avgKey(s.valid.filter(r=>r.direction==='BEAR'),'rfac');
 $('intro').innerHTML='<div><div class="eyebrow">03 / R.FAC BREAKDOWN</div><div class="sector-title">'+esc(sector)+'</div><span class="muted">'+date+' · '+cut+' IST · '+s.valid.length+'/'+s.total+' active</span></div><div class="stat"><small>SECTOR NET R.FAC</small><b class="'+((s.net??0)>=0?'bull':'bear')+'">'+fmt(s.net,true)+'</b><span class="baseline">Signed Bull (+) / Bear (−)</span></div><div class="stat"><small>AVG R.FAC · '+s.boost+' BOOSTED</small><b>'+fmt(s.avg)+'</b><span class="baseline">Magnitude across '+s.valid.length+' stocks</span></div><div class="stat"><small class="bull">BULL AVG R.FAC · '+s.bull+'</small><b>'+fmt(sb)+'</b></div><div class="stat"><small class="bear">BEAR AVG R.FAC · '+s.bear+'</small><b>'+fmt(sr)+'</b></div>';
 const buckets=[
  {id:'ALL',label:'All stocks',cls:''},
  {id:'BULL_BOOST',label:'Bull Boost ≥1.5',cls:'bull'},
  {id:'BEAR_BOOST',label:'Bear Boost ≥1.5',cls:'bear'},
  {id:'BULL_EARLY',label:'Bull Early <1.5',cls:'bull'},
  {id:'BEAR_EARLY',label:'Bear Early <1.5',cls:'bear'},
  {id:'STALE',label:'Stale Reversals',cls:''},
 ];
 $('flows').innerHTML=buckets.map(b=>{
  const sub=s.a.filter(r=>matchBucket(r,b.id));
  return '<button class="flow '+(bucket===b.id?'active':'')+'" data-bucket="'+b.id+'"><span class="flow-name '+b.cls+'">'+esc(b.label)+'</span><span class="flow-value">'+fmt(avgKey(sub,'rfac'))+'</span><span class="flow-count">'+sub.length+' stocks</span></button>';
 }).join('');
 const q=$('search').value.trim().toUpperCase();
 visible=s.a.filter(r=>matchBucket(r,bucket)&&(!q||r.symbol.includes(q))&&($('side').value==='ALL'||r.direction===$('side').value)&&(!$('hideStale').checked||Number(r.stale)!==1)).sort((a,b)=>{
  const x=num(a[sort]),y=num(b[sort]);
  return x===null?y===null?a.symbol.localeCompare(b.symbol):1:y===null?-1:(desc?y-x:x-y)||a.symbol.localeCompare(b.symbol);
 });
 $('stocks').innerHTML=visible.map(r=>{
  const rf=num(r.rfac),rfCls=rf!==null&&rf>=2?'hot':rf!==null&&rf>=1.5?'boost':'';
  return '<tr><td><span class="symbol">'+esc(r.symbol)+'</span><span class="sub '+(r.direction==='BULL'?'bull':r.direction==='BEAR'?'bear':'')+'"> '+esc(r.direction)+'</span><div class="sub">'+esc(r.classification)+'</div></td><td><span class="rf-pill '+rfCls+'">'+fmt(r.rfac)+'</span><div class="sub">'+(r.peak_cut?'Peak '+esc(r.peak_cut):'—')+'</div></td><td>'+fmt(r.curr_rfac)+(Number(r.stale)===1?'<span class="stale">STALE</span>':'')+'<div class="sub">9:20 '+fmt(r.o20)+'</div></td><td class="'+(num(r.move_pct)>0?'bull':num(r.move_pct)<0?'bear':'muted')+'">'+fmt(r.move_pct,true)+'%</td><td><b>'+fmt(r.oi_bias)+'</b></td><td><span class="'+(num(r.ce_pct)<0?'bull':'muted')+'">'+fmt(r.ce_pct,true)+'</span> / <span>'+fmt(r.pe_pct,true)+'</span></td><td>'+pill(r.pdh_pdl_broken,r.rusty_level_source==='OR'?'OR now':hm(r.pdh_pdl_break_time))+'</td><td><button class="icon" data-add="'+esc(r.symbol)+'" aria-label="Add '+esc(r.symbol)+' to Charts watchlist">'+(watchlist.has(r.symbol)?'✓':'+')+'</button></td><td><div class="actions"><a class="icon" href="/charts?symbol='+encodeURIComponent(r.symbol)+'&date='+date+'" target="_top" aria-label="Open '+esc(r.symbol)+' chart">Chart ↗</a><a class="icon" href="https://www.tradingview.com/chart/?symbol='+encodeURIComponent('NSE:'+r.symbol)+'" target="_blank" rel="noopener" aria-label="Open '+esc(r.symbol)+' TradingView">TV ↗</a></div></td></tr>';
 }).join('')||'<tr><td colspan="9" class="empty">'+(cut&&cut<'09:25'?'Waiting for 09:20 IST anchor candle (R.Fac activates at 09:25 IST)…':'No stocks match these filters.')+'</td></tr>';
 $('rowcount').textContent=visible.length+' stocks · '+bucket.replace('_',' ').toLowerCase();
 $('coverage').textContent='R.Fac Sector Scope · '+date+' '+cut+' IST · '+Object.keys(MEMBERS).length+' sectors';
}
$('date').value=date;$('date').onchange=e=>{const d=e.target.value;if(/^\\d{4}-\\d{2}-\\d{2}$/.test(d))window.top.location.href='/sector?date='+d;};
$('cut').onchange=e=>selectCut(e.target.value);let sliderTimer;$('slider').oninput=e=>{const t=Object.keys(data).sort()[Number(e.target.value)];$('clock').textContent=t+' IST';clearTimeout(sliderTimer);sliderTimer=setTimeout(()=>selectCut(t),180);};
$('prev').onclick=()=>{const a=Object.keys(data).sort();selectCut(a[Math.max(0,a.indexOf(cut)-1)]);};$('next').onclick=()=>{const a=Object.keys(data).sort();selectCut(a[Math.min(a.length-1,a.indexOf(cut)+1)]);};
$('latest').onclick=()=>{live=true;lastFetch=Date.now();session(date,'',sector,true);schedule();};
$('sectorSort').onchange=render;for(const id of ['search','side','hideStale'])$(id).addEventListener(id==='search'?'input':'change',render);
$('sectors').onclick=e=>{const b=e.target.closest('[data-sector]');if(b){sector=b.dataset.sector;bucket='ALL';render();}};
$('flows').onclick=e=>{const b=e.target.closest('[data-bucket]');if(b){bucket=b.dataset.bucket;render();}};
document.querySelector('thead').onclick=e=>{const b=e.target.closest('[data-sort]');if(b){desc=sort===b.dataset.sort?!desc:true;sort=b.dataset.sort;render();}};
$('stocks').onclick=e=>{const b=e.target.closest('[data-add]');if(b)parent.postMessage({type:'SECTOR_ADD_WATCHLIST',symbol:b.dataset.add},location.origin);};
$('help').onclick=()=>$('modal').hidden=false;$('closeHelp').onclick=()=>$('modal').hidden=true;$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').hidden=true;};document.addEventListener('keydown',e=>{if(e.key==='Escape')$('modal').hidden=true;});
$('export').onclick=()=>{const cols=['date','time_ist',...META.fields];const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const text='\\ufeff'+[cols.map(quote).join(','),...visible.map(r=>[date,cut,...META.fields.map(k=>r[k])].map(quote).join(','))].join('\\r\\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='sector_scope_rfac_'+date+'_'+cut.replace(':','')+'_'+sector.replaceAll(' ','_')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
lastFetch=Date.now();session(date,'',sector);schedule();
</script></body></html>`;
