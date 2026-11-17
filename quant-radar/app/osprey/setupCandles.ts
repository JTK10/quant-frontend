import type {ChartBar} from '../charts/LiveCandleChart';
import {istSessionDate,sessionPollingDelay} from '@/utils/sessionPolling';

type Message={type?:string;symbol?:string;bars?:Array<ChartBar&{symbol:string}>}&Partial<ChartBar>;
const dayOf=(time:number)=>new Date((time+19800)*1000).toISOString().slice(0,10);
type Ports={url:string;socket?:(url:string)=>WebSocket;now?:()=>number;hidden?:()=>boolean;onData:(bars:Map<string,ChartBar[]>,date:string,cut:string)=>void};
/** One live-only fan-out socket plus one sequential, cached history bootstrap.
 * New five-minute cuts reuse streamed bars; never redownload history on a timer. */
export class SetupCandles {
  private ports:Ports;
  private cache=new Map<string,Map<number,ChartBar>>();
  private seeded=new Set<string>();
  private attempted=new Map<string,string>();
  private symbols:string[]=[];
  private date='';private cut='';private stopped=false;
  private live?:WebSocket;private bootstrap?:WebSocket;
  private bootstrapSymbol?:string;
  private bootTimeout?:ReturnType<typeof setTimeout>;private retry?:ReturnType<typeof setTimeout>;private closeTimer?:ReturnType<typeof setTimeout>;
  constructor(ports:Ports){this.ports=ports;}
  private now(){return this.ports.now?.()??Date.now();}
  private hidden(){return this.ports.hidden?.()??document.hidden;}
  private socket(){return this.ports.socket?.(this.ports.url)??new WebSocket(this.ports.url);}
  private target(){return Date.parse(this.date+'T'+this.cut+':00+05:30')/1000;}
  private active(){
    if(this.date!==istSessionDate(this.now())||sessionPollingDelay(this.date,300000,this.now())===null)return false;
    const t=new Date(this.now()+19800000).toISOString().slice(11,16);return t>='09:14'&&t<='15:35';
  }
  private merge(symbol:string,bars:ChartBar[]){
    const saved=this.cache.get(symbol)??new Map<number,ChartBar>();
    for(const b of bars){if(![b.time,b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.time%300!==0||b.time>this.now()/1000+5||b.close<=0||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))continue;saved.set(b.time,{time:b.time,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume});}
    if(saved.size>1800){const times=[...saved.keys()].sort((a,b)=>a-b);for(const t of times.slice(0,times.length-1800))saved.delete(t);}
    this.cache.delete(symbol);this.cache.set(symbol,saved);
    if(this.cache.size>256){const unused=[...this.cache.keys()].find(s=>!this.symbols.includes(s));if(unused){this.cache.delete(unused);this.seeded.delete(unused);}}
  }
  private covered(symbol:string){
    if(!this.seeded.has(symbol))return false;
    const bars=this.cache.get(symbol);if(!bars)return false;
    const end=this.target(),start=Date.parse(this.date+'T09:15:00+05:30')/1000;
    for(let t=start;t<end;t+=300)if(!bars.has(t))return false;
    return true;
  }
  private notify(){
    if(this.stopped||this.hidden())return;
    const ready=new Map<string,ChartBar[]>();for(const s of this.symbols)if(this.covered(s))ready.set(s,[...this.cache.get(s)!.values()].sort((a,b)=>a.time-b.time));
    this.ports.onData(ready,this.date,this.cut);
  }
  configure(symbols:string[],date:string,cut:string){
    if(this.stopped)return;
    const changed=date!==this.date||cut!==this.cut;
    if(changed)this.cancelBootstrap();
    this.symbols=[...new Set(symbols)].filter(s=>/^[A-Z0-9 &._-]{1,30}$/.test(s)).slice(0,256);
    if(this.bootstrapSymbol&&!this.symbols.includes(this.bootstrapSymbol))this.cancelBootstrap(true);
    this.date=date;this.cut=cut;
    this.notify();this.visibility();
  }
  private cancelBootstrap(retry=false){if(retry&&this.bootstrapSymbol)this.attempted.delete(this.bootstrapSymbol);this.bootstrapSymbol=undefined;clearTimeout(this.bootTimeout);this.bootTimeout=undefined;const ws=this.bootstrap;this.bootstrap=undefined;if(ws){ws.onclose=null;ws.onmessage=null;ws.onerror=null;ws.close();}}
  private closeLive(){clearTimeout(this.retry);clearTimeout(this.closeTimer);this.retry=undefined;this.closeTimer=undefined;const ws=this.live;this.live=undefined;if(ws){ws.onclose=null;ws.onmessage=null;ws.close();}}
  private subscribe(){if(this.live?.readyState===1)this.live.send(JSON.stringify({type:'subscribe',symbols:this.symbols,history:false}));}
  private connect(){
    if(this.stopped||this.hidden()||!this.symbols.length||!this.active()){this.closeLive();return;}
    if(this.live){this.subscribe();return;}
    const ws=this.live=this.socket();
    ws.onopen=()=>{if(this.live===ws)this.subscribe();};
    ws.onmessage=e=>{
      if(this.live!==ws||this.hidden())return;
      try{if(typeof e.data!=='string'||e.data.length>64000)return;const b=JSON.parse(e.data) as Message;if(b.type!=='candle'||!b.symbol||!this.symbols.includes(b.symbol))return;this.merge(b.symbol,[b as ChartBar]);if(Number(b.time)+300<=this.target())this.notify();}catch{/* Ignore malformed fan-out messages. */}
    };
    ws.onclose=()=>{if(this.live!==ws)return;this.live=undefined;if(!this.stopped&&!this.hidden()&&this.active())this.retry=setTimeout(()=>this.connect(),5000);};
    const end=Date.parse(this.date+'T15:35:01+05:30');this.closeTimer=setTimeout(()=>this.closeLive(),Math.max(1,end-this.now()));
  }
  private pump(){
    if(this.stopped||this.hidden()||this.bootstrap||!this.date||!this.cut)return;
    const key=this.date+'|'+this.cut;
    const symbol=this.symbols.find(s=>!this.covered(s)&&this.attempted.get(s)!==key);
    if(!symbol)return;
    this.attempted.set(symbol,key);this.bootstrapSymbol=symbol;const ws=this.bootstrap=this.socket();
    const finish=()=>{if(this.bootstrap!==ws)return;this.cancelBootstrap();this.notify();this.pump();};
    this.bootTimeout=setTimeout(finish,12000);
    ws.onopen=()=>{if(this.bootstrap===ws)ws.send(JSON.stringify({type:'subscribe',symbols:[symbol]}));};
    ws.onmessage=e=>{
      if(this.bootstrap!==ws||this.hidden())return;
      try{if(typeof e.data!=='string'||e.data.length>1500000){finish();return;}const d=JSON.parse(e.data) as Message;if(d.type!=='snapshot'||!Array.isArray(d.bars))return;if(d.bars.length>4000){finish();return;}const bars=d.bars.filter(b=>b.symbol===symbol);if(bars.length){this.merge(symbol,bars);this.seeded.add(symbol);}finish();}catch{finish();}
    };
    ws.onclose=finish;ws.onerror=finish;
  }
  visibility(){
    if(this.stopped)return;
    if(this.hidden()){this.closeLive();this.cancelBootstrap(true);return;}
    this.connect();this.notify();this.pump();
  }
  stop(){this.stopped=true;this.closeLive();this.cancelBootstrap();}
}
