"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";

export type Timeframe = "5m" | "15m" | "30m" | "1h" | "1D";

export type ChartBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

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
}: {
  symbol: string;
  streamUrl: string;
  timeframe: Timeframe;
  initialBars?: ChartBar[];
  compact?: boolean;
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
  }, [symbol, initialBars]);

  useEffect(() => {
    indicatorsRef.current = indicators;
    indicatorRedrawRef.current(aggregateBars([...barsRef.current.values()], timeframe));
  }, [indicators, timeframe]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const chart = createChart(root, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0b1220" }, textColor: "#b8c2d1" },
      grid: { vertLines: { color: "#172033" }, horzLines: { color: "#172033" } },
      rightPriceScale: { borderColor: "#25334b", autoScale: true },
      timeScale: { borderColor: "#25334b", timeVisible: true, secondsVisible: false, tickMarkFormatter: formatIstTick },
      localization: { locale: "en-IN", timeFormatter: formatIstTime },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#089981", downColor: "#F23645", borderVisible: false,
      wickUpColor: "#089981", wickDownColor: "#F23645",
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
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
    const bars = aggregateBars([...barsRef.current.values()], timeframe);
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
  }, [timeframe, symbol]);

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
      const bars = aggregateBars([...barsRef.current.values()], timeframe);
      const affectedTime = bucketStart(normalized.time, timeframe);
      const affectedBar = bars.find((candidate) => candidate.time === affectedTime);
      if (affectedBar) updateLiveBarRef.current(affectedBar, bars);
    };
    const redraw = () => redrawRef.current(aggregateBars([...barsRef.current.values()], timeframe));
    const connect = () => {
      socket = new WebSocket(streamUrl);
      socket.onopen = () => socket?.send(JSON.stringify({ type: "subscribe", symbols: [symbol] }));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as StreamMessage;
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
        if (!stopped) reconnectTimer = window.setTimeout(connect, 2000);
      };
    };
    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [streamUrl, symbol, timeframe]);

  return (
    <div
      ref={frameRef}
      className={`relative h-[420px] w-full select-none ${compact ? "lg:h-[330px]" : "lg:h-[520px]"}`}
      onContextMenu={(event) => {
        event.preventDefault();
        const bounds = frameRef.current?.getBoundingClientRect();
        setContextMenu({ x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) });
      }}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <div ref={hostRef} className="h-full w-full" aria-label={`${symbol} live price chart`} />
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