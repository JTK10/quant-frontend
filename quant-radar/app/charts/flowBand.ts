import type { IPrimitivePaneView, ISeriesPrimitive, SeriesAttachedParameter, Time, UTCTimestamp, Logical } from 'lightweight-charts';

export type FlowPoint = { time: number; available: number; value: number | null };
export type FlowData = { symbol: string; date: string; points: FlowPoint[]; lastCut: string | null; stale: boolean };
type Bar = { time: number; high: number; low: number; close: number };
export type BandPoint = { time: number; upper: number; lower: number; pressure: number | null };

export function computeFlowBand(bars: Bar[], points: FlowPoint[], interval = 300, asOf = Date.now()/1000): BandPoint[] {
  const pressure = new Map<number, number | null>();
  let smoothed: number | null = null, previousTime = 0;
  for (const point of [...points].sort((a,b)=>a.time-b.time)) {
    if (point.available > asOf || point.time > asOf) continue;
    if (point.value == null) { smoothed = null; pressure.set(point.time, null); previousTime=point.time; continue; }
    smoothed = smoothed == null || point.time-previousTime!==300 ? point.value : .5*point.value+.5*smoothed;
    pressure.set(point.time,smoothed); previousTime=point.time;
  }
  let ema=0, atr=0, prior=0;
  return bars.flatMap((bar,i) => {
    const tr=Math.max(bar.high-bar.low,i?Math.abs(bar.high-prior):0,i?Math.abs(bar.low-prior):0);
    ema = i ? .2*bar.close+.8*ema : bar.close; atr=i?(13*atr+tr)/14:tr; prior=bar.close;
    if(bar.time+interval>asOf)return [];
    return [{time:bar.time,upper:ema+atr,lower:ema-atr,pressure:pressure.get(bar.time+interval)??null}];
  });
}

// Price-coordinate primitive: no stacked area-series baseline or hidden price-scale distortion.
export class FlowBandPrimitive implements ISeriesPrimitive<Time> {
  private attachment?: SeriesAttachedParameter<Time>;
  private points: BandPoint[]=[];
  private view: IPrimitivePaneView = { zOrder:()=> 'bottom', renderer:()=>({draw:target=>{
    const a=this.attachment;if(!a)return;
    target.useMediaCoordinateSpace(({context:ctx})=>{
      ctx.save();
      for(let i=1;i<this.points.length;i++){
        const p=this.points[i-1],q=this.points[i];
        if(q.time-p.time>3600)continue;
        const x=a.chart.timeScale().timeToCoordinate(p.time as UTCTimestamp),x2=a.chart.timeScale().timeToCoordinate(q.time as UTCTimestamp);
        const u=a.series.priceToCoordinate(p.upper),u2=a.series.priceToCoordinate(q.upper),l=a.series.priceToCoordinate(p.lower),l2=a.series.priceToCoordinate(q.lower);
        if(x==null||x2==null||u==null||u2==null||l==null||l2==null)continue;
        ctx.fillStyle=q.pressure==null?'rgba(148,163,184,.10)':q.pressure>=0?'rgba(0,190,145,.23)':'rgba(239,68,100,.23)';
        ctx.beginPath();ctx.moveTo(x,u);ctx.lineTo(x2,u2);ctx.lineTo(x2,l2);ctx.lineTo(x,l);ctx.closePath();ctx.fill();
      }
      ctx.restore();
    });
  }}) };
  attached(parameters: SeriesAttachedParameter<Time>){this.attachment=parameters;}
  detached(){this.attachment=undefined;}
  paneViews(){return [this.view];}
  autoscaleInfo(start:number,end:number){
    const a=this.attachment;if(!a||!this.points.length)return null;
    const scale=a.chart.timeScale(),left=scale.logicalToCoordinate(start as Logical),right=scale.logicalToCoordinate(end as Logical);
    if(left==null||right==null)return null;
    const visible=this.points.filter(p=>{const x=scale.timeToCoordinate(p.time as UTCTimestamp);return x!=null&&x>=left&&x<=right;});
    return visible.length?{priceRange:{minValue:Math.min(...visible.map(p=>p.lower)),maxValue:Math.max(...visible.map(p=>p.upper))}}:null;
  }
  update(points: BandPoint[]){this.points=points;this.attachment?.requestUpdate();}
}
