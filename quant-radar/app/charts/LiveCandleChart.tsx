"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  BaselineSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  LineType,
  type AutoscaleInfo,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { OIData } from "./oiTypes";

export type Timeframe = "5m" | "15m" | "30m" | "1h" | "1D";

export type ChartBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type TradeOverlay = { id: string; time: number; side: "BULL" | "BEAR"; entry: number; stop: number; target: number; endTime?: number };
const EMPTY_TRADES: TradeOverlay[] = [];
type CandleMessage = ChartBar & {
  type: "candle";
  kind: "update" | "closed";
  symbol: string;
  instrument_key: string;
};

type StreamMessage =
  | CandleMessage
  | { type: "snapshot"; bars: CandleMessage[] }
  | { type: "ready"; interval: "5m" };

type LinePoint = { time: UTCTimestamp; value: number };
type ContextMenu = { x: number; y: number } | null;
type IndicatorKey = "ema" | "supertrend" | "pdhPdl" | "pivots";
type Indicators = Record<IndicatorKey, boolean>;
const INDICATOR_LABELS: Record<IndicatorKey, string> = { ema: "EMA 9", supertrend: "ST 10,3", pdhPdl: "PDH/PDL", pivots: "P/R1/S1" };

const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  day: "2-digit",
  month: "short",
});

const EMPTY_BARS: ChartBar[] = [];

const INTERVAL_SECONDS: Record<Timeframe, number> = {
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "1D": 86400,
};

function timeToEpochSeconds(time: Time): number {
  if (typeof time === "number") return time;
  if (typeof time === "string") return Date.parse(time) / 1000;
  return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

function formatIstTime(time: Time): string {
  return IST_TIME_FORMATTER.format(new Date(timeToEpochSeconds(time) * 1000));
}
function formatIstTick(time: Time): string {
  const p = IST_TIME_FORMATTER.formatToParts(new Date(timeToEpochSeconds(time) * 1000));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return Number(v("hour")) === 9 && Number(v("minute")) <= 15 ? `${v("day")} ${v("month")}` : `${v("hour")}:${v("minute")}`;
}

function bucketStart(time: number, timeframe: Timeframe): number {
  if (timeframe === "1D") {
    const date = new Date(time * 1000);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  }
  return Math.floor(time / INTERVAL_SECONDS[timeframe]) * INTERVAL_SECONDS[timeframe];
}

export function normalizeFiveMinuteBar(bar: ChartBar): ChartBar {
  return { ...bar, time: bucketStart(bar.time, "5m") };
}

function istDay(time: number): string {
  return new Date((time + 19_800) * 1000).toISOString().slice(0, 10);
}

export function filterChartSession(bars: ChartBar[], sessionDate?: string, strictSession = false, includePreviousSession = false, asOf?: number): ChartBar[] {
  let previousDay = "";
  if (sessionDate && strictSession && includePreviousSession) {
    for (const bar of bars) {
      const day = istDay(bar.time);
      if (day < sessionDate && day > previousDay && (!asOf || bar.time + 300 <= asOf)) previousDay = day;
    }
  }
  return bars.filter(bar => {
    const day = sessionDate ? istDay(bar.time) : "";
    return (!sessionDate || (strictSession ? day === sessionDate || day === previousDay : day <= sessionDate)) && (!asOf || bar.time + 300 <= asOf);
  });
}

function ema9(bars: ChartBar[]): LinePoint[] {
  if (!bars.length) return [];
  const multiplier = 2 / 10;
  let value = bars[0].close;
  return bars.map((bar, index) => {
    value = index === 0 ? bar.close : (bar.close - value) * multiplier + value;
    return { time: bar.time as UTCTimestamp, value };
  });
}

function supertrend(bars: ChartBar[], period = 10, multiplier = 3): { bull: LinePoint[]; bear: LinePoint[] } {
  if (bars.length < period) return { bull: [], bear: [] };
  const atr: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  const trend: number[] = [];
  let rollingTr = 0;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const previousClose = index ? bars[index - 1].close : bar.close;
    const tr = Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
    rollingTr += tr;
    if (index < period) {
      atr[index] = rollingTr / (index + 1);
    } else {
      atr[index] = (atr[index - 1] * (period - 1) + tr) / period;
    }

    const basicUpper = (bar.high + bar.low) / 2 + multiplier * atr[index];
    const basicLower = (bar.high + bar.low) / 2 - multiplier * atr[index];
    if (!index) {
      upper[index] = basicUpper;
      lower[index] = basicLower;
      trend[index] = basicUpper;
      continue;
    }

    upper[index] = basicUpper < upper[index - 1] || previousClose > upper[index - 1] ? basicUpper : upper[index - 1];
    lower[index] = basicLower > lower[index - 1] || previousClose < lower[index - 1] ? basicLower : lower[index - 1];
    trend[index] = trend[index - 1] === upper[index - 1]
      ? (bar.close <= upper[index] ? upper[index] : lower[index])
      : (bar.close >= lower[index] ? lower[index] : upper[index]);
  }

  return {
    bull: bars.filter((_, index) => trend[index] === lower[index]).map((bar, index) => ({ time: bar.time as UTCTimestamp, value: lower[bars.indexOf(bar)] })),
    bear: bars.filter((_, index) => trend[index] === upper[index]).map((bar) => ({ time: bar.time as UTCTimestamp, value: upper[bars.indexOf(bar)] })),
  };
}

function previousSessionLevels(bars: ChartBar[]) {
  const sessions = new Map<string, { high: number; low: number; close: number }>();
  for (const bar of bars) {
    const day = istDay(bar.time);
    const current = sessions.get(day);
    sessions.set(day, current
      ? { high: Math.max(current.high, bar.high), low: Math.min(current.low, bar.low), close: bar.close }
      : { high: bar.high, low: bar.low, close: bar.close });
  }
  const days = [...sessions.keys()].sort();
  if (days.length < 2) return null;
  const previous = sessions.get(days[days.length - 2]);
  if (!previous) return null;
  const pivot = (previous.high + previous.low + previous.close) / 3;
  const range = previous.high - previous.low;
  return {
    pdh: previous.high,
    pdl: previous.low,
    pivot,
    r1: 2 * pivot - previous.low,
    s1: 2 * pivot - previous.high,
    r2: pivot + range,
    s2: pivot - range,
    r3: previous.high + 2 * (pivot - previous.low),
    s3: previous.low - 2 * (previous.high - pivot),
  };
}

export function aggregateBars(source: ChartBar[], timeframe: Timeframe): ChartBar[] {
  const grouped = new Map<number, ChartBar>();
  for (const bar of [...source].sort((a, b) => a.time - b.time)) {
    const time = bucketStart(bar.time, timeframe);
    const existing = grouped.get(time);
    if (!existing) {
      grouped.set(time, { ...bar, time });
      continue;
    }
    existing.high = Math.max(existing.high, bar.high);
    existing.low = Math.min(existing.low, bar.low);
    existing.close = bar.close;
    existing.volume += bar.volume;
  }
  return [...grouped.values()].sort((a, b) => a.time - b.time);
}

function asCandle(bar: ChartBar): CandlestickData<UTCTimestamp> {
  return { ...bar, time: bar.time as UTCTimestamp };
}

function asVolume(bar: ChartBar) {
  return {
    time: bar.time as UTCTimestamp,
    value: bar.volume,
    color: bar.close >= bar.open ? "rgba(8, 153, 129, 0.5)" : "rgba(242, 54, 69, 0.5)",
  };
}

export default function LiveCandleChart({
  symbol,
  streamUrl,
  timeframe,
  initialBars = EMPTY_BARS,
  compact = false,
  oiData = null,
  showPreviousOI = true,
  sessionDate,
  asOf,
  onQuote,
  tradeSignals = EMPTY_TRADES,
  selectedTradeId,
  strictSession = false,
  includePreviousSession = false,
  mutedOI = false,
}: {
  symbol: string;
  streamUrl: string;
  timeframe: Timeframe;
  initialBars?: ChartBar[];
  compact?: boolean;
  oiData?: OIData | null;
  showPreviousOI?: boolean;
  sessionDate?: string;
  asOf?: number;
  onQuote?: (symbol: string, value: number) => void;
  tradeSignals?: TradeOverlay[];
  selectedTradeId?: string;
  strictSession?: boolean;
  includePreviousSession?: boolean;
  mutedOI?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaRef = useRef<ISeriesApi<"Line"> | null>(null);
  const superBullRef = useRef<ISeriesApi<"Line"> | null>(null);
  const superBearRef = useRef<ISeriesApi<"Line"> | null>(null);
  const barsRef = useRef(new Map<number, ChartBar>());
  const redrawRef = useRef<(bars: ChartBar[]) => void>(() => {});
  const updateLiveBarRef = useRef<(bar: ChartBar, bars: ChartBar[]) => void>(() => {});
  const indicatorRedrawRef = useRef<(bars: ChartBar[]) => void>(() => {});
  const priceLinesRef = useRef<any[]>([]);
  const levelSignatureRef = useRef("");
  const lastRenderedTimeRef = useRef<number | null>(null);
  const recentRangeRef = useRef<{ from: number; to: number } | null>(null);
  const initialViewSetRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [indicators, setIndicators] = useState<Indicators>({ ema: false, supertrend: false, pdhPdl: false, pivots: false });
  const indicatorsRef = useRef<Indicators>({ ema: false, supertrend: false, pdhPdl: false, pivots: false });
  const [connection, setConnection] = useState("Connecting");
  const [barRevision, setBarRevision] = useState(0);
  const [hasBars, setHasBars] = useState(false);
  const quoteRef = useRef(onQuote);
  useEffect(() => { quoteRef.current = onQuote; }, [onQuote]);
  const sessionBars = useCallback((bars: ChartBar[]) => filterChartSession(bars, sessionDate, strictSession, includePreviousSession, asOf), [sessionDate, asOf, strictSession, includePreviousSession]);

  const resetView = () => {
    const range = recentRangeRef.current;
    if (range) chartRef.current?.timeScale().setVisibleLogicalRange(range);
    else chartRef.current?.timeScale().fitContent();
    candleRef.current?.priceScale().applyOptions({ autoScale: true });
    setContextMenu(null);
  };

  const zoom = (factor: number) => {
    const scale = chartRef.current?.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const centre = (range.from + range.to) / 2;
    const span = (range.to - range.from) * factor;
    scale.setVisibleLogicalRange({ from: centre - span / 2, to: centre + span / 2 });
  };

  useEffect(() => {
    barsRef.current = new Map(initialBars.map((bar) => {
      const normalized = normalizeFiveMinuteBar(bar);
      return [normalized.time, normalized];
    }));
    redrawRef.current(aggregateBars(sessionBars([...barsRef.current.values()]), timeframe));
  }, [symbol, initialBars, sessionBars, timeframe]);

  useEffect(() => {
    indicatorsRef.current = indicators;
    indicatorRedrawRef.current(aggregateBars([...barsRef.current.values()], timeframe));
  }, [indicators, timeframe]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const chart = createChart(root, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#10141e" }, textColor: "#8c9ab2", fontSize: 10, attributionLogo: true },
      grid: { vertLines: { color: "#1c2230" }, horzLines: { color: "#1c2230" } },
      rightPriceScale: { borderColor: "#25334b", autoScale: true },
      timeScale: { borderColor: "#25334b", timeVisible: true, secondsVisible: false, tickMarkFormatter: formatIstTick },
      localization: { locale: "en-IN", timeFormatter: formatIstTime },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#089981", downColor: "#F23645", borderVisible: false,
      wickUpColor: "#089981", wickDownColor: "#F23645",
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: symbol !== "NIFTY 50", priceLineVisible: symbol !== "NIFTY 50" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const ema = chart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 2, title: "EMA 9", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const superBull = chart.addSeries(LineSeries, { color: "#22c55e", lineWidth: 2, lineStyle: LineStyle.Solid, title: "Supertrend 10,3", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const superBear = chart.addSeries(LineSeries, { color: "#ef4444", lineWidth: 2, lineStyle: LineStyle.Solid, title: "Supertrend 10,3", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    emaRef.current = ema;
    superBullRef.current = superBull;
    superBearRef.current = superBear;

    const updateRecentRange = (bars: ChartBar[]) => {
      if (bars.length) {
        const latestDay = istDay(bars[bars.length - 1].time);
        const recentBars = timeframe === "1D" ? bars.slice(-20) : bars.filter((bar) => istDay(bar.time) === latestDay);
        if (recentBars.length) {
          const minimumBars = { "5m": 30, "15m": 20, "30m": 12, "1h": 8, "1D": 20 }[timeframe];
          const visibleBars = Math.max(recentBars.length, minimumBars);
          recentRangeRef.current = {
            from: bars.length - visibleBars - 0.5,
            to: bars.length + 0.5,
          };
          if (!initialViewSetRef.current) {
            chart.timeScale().setVisibleLogicalRange(recentRangeRef.current);
            initialViewSetRef.current = true;
          }
        }
      }
    };

    redrawRef.current = (bars) => {
      candles.setData(bars.map(asCandle));
      volume.setData(bars.map(asVolume));
      lastRenderedTimeRef.current = bars.length ? bars[bars.length - 1].time : null;
      updateRecentRange(bars);
      indicatorRedrawRef.current(bars);
      setHasBars(bars.some(b => includePreviousSession || !sessionDate || istDay(b.time) === sessionDate));
      if (bars.length) quoteRef.current?.(symbol, bars[bars.length - 1].close);
      setBarRevision(n => n + 1);
    };

    updateLiveBarRef.current = (bar, bars) => {
      const lastRenderedTime = lastRenderedTimeRef.current;
      if (lastRenderedTime !== null && bar.time < lastRenderedTime) {
        redrawRef.current(bars);
        return;
      }
      candles.update(asCandle(bar));
      volume.update(asVolume(bar));
      lastRenderedTimeRef.current = bar.time;
      updateRecentRange(bars);
      indicatorRedrawRef.current(bars);
      quoteRef.current?.(symbol, bar.close);
      setHasBars(true);
      if (lastRenderedTime !== bar.time) setBarRevision(n => n + 1);
    };

    indicatorRedrawRef.current = (bars) => {
      const enabled = indicatorsRef.current;
      if (enabled.ema) ema.setData(ema9(bars)); else ema.setData([]);
      if (enabled.supertrend) { const st = supertrend(bars); superBull.setData(st.bull); superBear.setData(st.bear); } else { superBull.setData([]); superBear.setData([]); }
      const levels = enabled.pdhPdl || enabled.pivots ? previousSessionLevels(bars) : null;
      const signature = levels ? `${enabled.pdhPdl}|${enabled.pivots}|${Object.values(levels).join("|")}` : "";
      if (signature === levelSignatureRef.current) return;
      priceLinesRef.current.forEach((line) => candles.removePriceLine(line)); priceLinesRef.current = []; levelSignatureRef.current = signature;
      if (!levels) return;
      const specs = [
        ...(enabled.pdhPdl ? [[levels.pdh, "PDH", "#ff4d5f", LineStyle.Solid, 2], [levels.pdl, "PDL", "#35e07a", LineStyle.Solid, 2]] as const : []),
        ...(enabled.pivots ? [
          [levels.pivot, "P", "#c4b5fd", LineStyle.Solid, 2],
          [levels.r1, "R1", "#ffb15c", LineStyle.Solid, 2],
          [levels.r2, "R2", "#ff8a5c", LineStyle.Solid, 1],
          [levels.r3, "R3", "#ff647c", LineStyle.Solid, 1],
          [levels.s1, "S1", "#78b7ff", LineStyle.Solid, 2],
          [levels.s2, "S2", "#4da3ff", LineStyle.Solid, 1],
          [levels.s3, "S3", "#6f8cff", LineStyle.Solid, 1],
        ] as const : []),
      ];
      specs.forEach(([price, title, color, lineStyle, lineWidth]) => priceLinesRef.current.push(candles.createPriceLine({ price, title, color, lineWidth, lineStyle, axisLabelVisible: true })));
    };

    initialViewSetRef.current = false;
    const bars = aggregateBars(sessionBars([...barsRef.current.values()]), timeframe);
    redrawRef.current(bars);

    return () => {
      redrawRef.current = () => {};
      updateLiveBarRef.current = () => {};
      indicatorRedrawRef.current = () => {};
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      emaRef.current = null;
      superBullRef.current = null;
      superBearRef.current = null;
      priceLinesRef.current = [];
      levelSignatureRef.current = "";
      recentRangeRef.current = null;
      initialViewSetRef.current = false;
      lastRenderedTimeRef.current = null;
    };
  }, [timeframe, symbol, sessionDate, sessionBars, includePreviousSession]);

  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    if (!chart || !candles || !oiData) return;
    const lines: ReturnType<typeof candles.createPriceLine>[] = [];
    const prices: number[] = [];
    const overlays: ISeriesApi<"Line">[] = [];
    const snapshots = oiData.intraday.filter(s => !s.degraded && (!asOf || s.time <= asOf));
    for (const side of ["support", "resistance"] as const) for (let rank = 0; rank < 2; rank++) {
      const points = snapshots.map(s => s[side][rank] ? {time: s.time as UTCTimestamp, value:s[side][rank][0]} : {time:s.time as UTCTimestamp});
      if (!points.length) continue;
      const series = chart.addSeries(LineSeries, {color: side === "support" ? "#35e07a" : "#ff4d5f", lineWidth: rank === 0 ? 2 : 1, lineType: LineType.WithSteps, pointMarkersVisible:false, lastValueVisible:true, priceLineVisible:false, title:`OI ${side === "support" ? "S" : "R"}${rank+1}`});
      series.setData(points); overlays.push(series);
      const latest = snapshots.at(-1);
      const wall = latest?.[side][rank];
      if (wall && latest) {
        prices.push(wall[0]);
        // Full-width guide for the selected cut; the stepped trace retains
        // when historical levels became available. Never select a later cut.
        lines.push(candles.createPriceLine({price:wall[0],color:side === "support" ? "#35e07a" : "#ff4d5f",lineWidth:2,lineStyle:LineStyle.Solid,axisLabelVisible:true,lineVisible:true,title:`${latest.cut} OI ${side === "support" ? "S" : "R"}${rank+1}`}));
      }
    }
    if (showPreviousOI) oiData.previous.forEach((snap, dayIndex) => {
      if (snap.degraded || snap.expiry < oiData.date) return;
      for (const side of ["support", "resistance"] as const) {
        for (const [rank, wall] of snap[side].entries()) {
        if (!wall || !Number.isFinite(wall[0]) || wall[0] <= 0) continue;
        prices.push(wall[0]);
        lines.push(candles.createPriceLine({price:wall[0],color:side === "support" ? mutedOI ? "#b775ff70" : "#b775ff" : mutedOI ? "#ffab3270" : "#ffab32",lineWidth:mutedOI ? 1 : rank === 0 ? 3 : 2,lineStyle:mutedOI ? LineStyle.Dashed : LineStyle.Solid,axisLabelVisible:!mutedOI,lineVisible:true,title:`${snap.date.slice(5)} OI ${side === "support" ? "S" : "R"}${rank+1}`}));
        }
      }
    });
    // Price lines need no session candles; include them in the scale so off-screen
    // strikes remain visible even before the first candle or after a large move.
    candles.applyOptions({ autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
      const info = original();
      if (!info?.priceRange || !prices.length) return info;
      const min = Math.min(info.priceRange.minValue, ...prices);
      const max = Math.max(info.priceRange.maxValue, ...prices);
      const padding = Math.max((max - min) * 0.025, max * 0.001);
      return { ...info, priceRange: { minValue: min - padding, maxValue: max + padding } };
    } });
    candles.priceScale().applyOptions({ autoScale: true });
    return () => {
      if (chartRef.current !== chart) return;
      lines.forEach(line => candles.removePriceLine(line));
      overlays.forEach(series => chart.removeSeries(series));
      candles.applyOptions({ autoscaleInfoProvider: undefined });
    };
  }, [oiData, showPreviousOI, timeframe, symbol, sessionDate, sessionBars, barRevision, asOf, mutedOI]);

  useEffect(() => {
    const chart = chartRef.current, candles = candleRef.current;
    if (!chart || !candles || !tradeSignals.length) return;
    const bars = aggregateBars(sessionBars([...barsRef.current.values()]), timeframe);
    const visible = tradeSignals.filter(s => bars.some(b => b.time === bucketStart(s.time, timeframe)) && (!asOf || s.time <= asOf));
    const markers = createSeriesMarkers(candles, visible.map(s => ({ time: bucketStart(s.time, timeframe) as UTCTimestamp, position: s.side === "BULL" ? "belowBar" as const : "aboveBar" as const, color: s.side === "BULL" ? "#35e07a" : "#ff4d5f", shape: s.side === "BULL" ? "arrowUp" as const : "arrowDown" as const, size:s.id === selectedTradeId ? 2 : 1, text: `${s.side === "BULL" ? "BUY" : "SELL"} · ${new Date(s.time*1000).toLocaleTimeString("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit"})}` })).sort((a,b) => Number(a.time)-Number(b.time)));
    const selected = visible.find(s => s.id === selectedTradeId) ?? visible.at(-1);
    const overlays: ISeriesApi<"Line">[] = [];
    const zones: ISeriesApi<"Baseline">[] = [];
    if (selected && bars.length) {
      const start = selected.time;
      const end = Math.max(start+INTERVAL_SECONDS[timeframe], Math.min(selected.endTime ?? Infinity, bars.at(-1)!.time+INTERVAL_SECONDS[timeframe]));
      for (const [value,color] of [[selected.target,"rgba(53,224,122,0.12)"],[selected.stop,"rgba(255,77,95,0.15)"]] as const) {
        const zone=chart.addSeries(BaselineSeries,{baseValue:{type:"price",price:selected.entry},topFillColor1:color,topFillColor2:color,bottomFillColor1:color,bottomFillColor2:color,topLineColor:"transparent",bottomLineColor:"transparent",baseLineVisible:false,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false});
        zone.setData([{time:start as UTCTimestamp,value},{time:end as UTCTimestamp,value}]); zones.push(zone);
      }
      for (const [value,title,color] of [[selected.entry,"ENTRY","#38bdf8"],[selected.stop,"SL","#ff4d5f"],[selected.target,"TARGET 3R","#35e07a"]] as const) {
        const line = chart.addSeries(LineSeries,{ color, title, lineWidth:title === "ENTRY" ? 3 : 2, lineStyle:LineStyle.Solid, priceLineVisible:false, lastValueVisible:true, crosshairMarkerVisible:false });
        line.setData([{time:start as UTCTimestamp,value},{time:end as UTCTimestamp,value}]); overlays.push(line);
      }
    }
    return () => { if (chartRef.current !== chart) return; markers.detach(); overlays.forEach(s => chart.removeSeries(s)); zones.forEach(s=>chart.removeSeries(s)); };
  }, [tradeSignals, selectedTradeId, timeframe, symbol, sessionDate, sessionBars, barRevision, asOf]);

  useEffect(() => {
    if (!streamUrl) return;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const storeBar = (bar: ChartBar) => {
      const normalized = normalizeFiveMinuteBar(bar);
      barsRef.current.set(normalized.time, normalized);
      return normalized;
    };
    const updateLiveBar = (bar: ChartBar) => {
      const normalized = storeBar(bar);
      const bars = aggregateBars(sessionBars([...barsRef.current.values()]), timeframe);
      const affectedTime = bucketStart(normalized.time, timeframe);
      const affectedBar = bars.find((candidate) => candidate.time === affectedTime);
      if (affectedBar) updateLiveBarRef.current(affectedBar, bars);
    };
    const redraw = () => redrawRef.current(aggregateBars(sessionBars([...barsRef.current.values()]), timeframe));
    const connect = () => {
      socket = new WebSocket(streamUrl);
      setConnection("Connecting");
      socket.onopen = () => { setConnection("Connected"); socket?.send(JSON.stringify({ type: "subscribe", symbols: [symbol] })); };
      socket.onmessage = (event) => {
        let message: StreamMessage;
        try { message = JSON.parse(event.data) as StreamMessage; } catch { return; }
        if (message.type === "candle" && message.symbol === symbol) {
          updateLiveBar(message);
        }
        if (message.type === "snapshot") {
          const matching = message.bars.filter((bar) => bar.symbol === symbol);
          if (!matching.length) return;
          matching.forEach(storeBar);
          redraw();
        }
      };
      socket.onclose = () => {
        if (!stopped) setConnection("Reconnecting");
        if (!stopped) reconnectTimer = window.setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [streamUrl, symbol, timeframe, sessionDate, sessionBars]);

  return (
    <div
      ref={frameRef}
      className={`live-candle-frame relative h-[420px] w-full select-none ${compact ? "lg:h-[330px]" : "lg:h-[520px]"}`}
      onContextMenu={(event) => {
        event.preventDefault();
        const bounds = frameRef.current?.getBoundingClientRect();
        setContextMenu({ x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) });
      }}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <div ref={hostRef} className="h-full w-full" aria-label={`${symbol} live price chart`} />
      <div className="pointer-events-none absolute left-2 bottom-8 z-10 text-[9px] text-slate-400">{streamUrl ? connection : "Session chart"}{!hasBars ? " · No candles received for this session" : ""}</div>
      <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded border text-xs shadow-lg" style={{ borderColor: "var(--color-border)", background: "rgba(11,18,32,.92)" }}>
        <button type="button" onClick={(event) => { event.stopPropagation(); zoom(1.45); }} className="px-2 py-1 hover:bg-white/10">−</button><button type="button" onClick={(event) => { event.stopPropagation(); resetView(); }} className="border-x px-2 py-1 font-mono text-[10px] hover:bg-white/10" style={{ borderColor: "var(--color-border)" }}>RESET</button><button type="button" onClick={(event) => { event.stopPropagation(); zoom(0.7); }} className="px-2 py-1 hover:bg-white/10">+</button>
      </div>
      <div className="absolute right-2 top-10 z-10 flex overflow-hidden rounded border font-mono text-[10px]" style={{ borderColor: "var(--color-border)", background: "rgba(11,18,32,.92)" }}>{(Object.keys(INDICATOR_LABELS) as IndicatorKey[]).map((key) => <button key={key} type="button" onClick={(event) => { event.stopPropagation(); setIndicators((current) => ({ ...current, [key]: !current[key] })); }} className="border-l px-2 py-1 hover:bg-white/10 first:border-l-0" style={{ borderColor: "var(--color-border)", color: indicators[key] ? "#fbbf24" : "#94a3b8" }}>{INDICATOR_LABELS[key]}</button>)}</div>
      {Object.keys(INDICATOR_LABELS).some((key) => indicators[key as IndicatorKey]) && <div className="pointer-events-none absolute left-2 top-2 z-10 rounded px-2 py-1 font-mono text-[10px]" style={{ color: "#cbd5e1", background: "rgba(11,18,32,.72)" }}>{(Object.keys(INDICATOR_LABELS) as IndicatorKey[]).filter((key) => indicators[key]).map((key) => INDICATOR_LABELS[key]).join(" · ")}</div>}
      {contextMenu && (
        <button
          type="button"
          className="absolute z-20 rounded border px-3 py-2 text-left text-xs shadow-2xl hover:bg-white/10"
          style={{ left: contextMenu.x, top: contextMenu.y, borderColor: "var(--color-border)", background: "#111827" }}
          onClick={(event) => { event.stopPropagation(); resetView(); }}
        >
          Reset chart view
        </button>
      )}
    </div>
  );
}
