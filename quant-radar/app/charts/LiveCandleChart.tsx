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

const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  day: "2-digit",
  month: "short",
});

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

function bucketStart(time: number, timeframe: Timeframe): number {
  if (timeframe === "1D") {
    const date = new Date(time * 1000);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  }
  return Math.floor(time / INTERVAL_SECONDS[timeframe]) * INTERVAL_SECONDS[timeframe];
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
  return {
    pdh: previous.high,
    pdl: previous.low,
    pivot,
    r1: 2 * pivot - previous.low,
    s1: 2 * pivot - previous.high,
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

export default function LiveCandleChart({
  symbol,
  streamUrl,
  timeframe,
  initialBars = [],
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
  const priceLinesRef = useRef<any[]>([]);
  const levelSignatureRef = useRef("");
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);

  const resetView = () => {
    chartRef.current?.timeScale().fitContent();
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
    barsRef.current = new Map(initialBars.map((bar) => [bar.time, bar]));
  }, [symbol, initialBars]);

  useEffect(() => {
    const root = hostRef.current;
    if (!root) return;
    const chart = createChart(root, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0b1220" }, textColor: "#b8c2d1" },
      grid: { vertLines: { color: "#172033" }, horzLines: { color: "#172033" } },
      rightPriceScale: { borderColor: "#25334b", autoScale: true },
      timeScale: { borderColor: "#25334b", timeVisible: true, secondsVisible: false, tickMarkFormatter: formatIstTime },
      localization: { locale: "en-IN", timeFormatter: formatIstTime },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const ema = chart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 2, title: "EMA 9", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const superBull = chart.addSeries(LineSeries, { color: "#22c55e", lineWidth: 2, lineStyle: LineStyle.Dotted, title: "Supertrend 10,3", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const superBear = chart.addSeries(LineSeries, { color: "#ef4444", lineWidth: 2, lineStyle: LineStyle.Dotted, title: "Supertrend 10,3", lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    emaRef.current = ema;
    superBullRef.current = superBull;
    superBearRef.current = superBear;

    redrawRef.current = (bars) => {
      candles.setData(bars.map(asCandle));
      volume.setData(bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.45)",
      })));
      ema.setData(ema9(bars));
      const supertrendData = supertrend(bars);
      superBull.setData(supertrendData.bull);
      superBear.setData(supertrendData.bear);

      const levels = previousSessionLevels(bars);
      const signature = levels ? Object.values(levels).map((value) => value.toFixed(4)).join("|") : "";
      if (signature === levelSignatureRef.current) return;
      priceLinesRef.current.forEach((line) => candles.removePriceLine(line));
      priceLinesRef.current = [];
      levelSignatureRef.current = signature;
      if (!levels) return;
      const specs = [
        [levels.pdh, "PDH", "#ef4444", LineStyle.Dashed],
        [levels.pdl, "PDL", "#22c55e", LineStyle.Dashed],
        [levels.pivot, "P", "#a78bfa", LineStyle.Dotted],
        [levels.r1, "R1", "#fb923c", LineStyle.Dotted],
        [levels.s1, "S1", "#60a5fa", LineStyle.Dotted],
      ] as const;
      specs.forEach(([price, title, color, lineStyle]) => priceLinesRef.current.push(candles.createPriceLine({ price, title, color, lineWidth: 1, lineStyle, axisLabelVisible: true })));
    };

    const bars = aggregateBars([...barsRef.current.values()], timeframe);
    redrawRef.current(bars);
    chart.timeScale().fitContent();

    return () => {
      redrawRef.current = () => {};
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      emaRef.current = null;
      superBullRef.current = null;
      superBearRef.current = null;
      priceLinesRef.current = [];
      levelSignatureRef.current = "";
    };
  }, [timeframe, symbol]);

  useEffect(() => {
    if (!streamUrl) return;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const redraw = () => redrawRef.current(aggregateBars([...barsRef.current.values()], timeframe));
    const connect = () => {
      socket = new WebSocket(streamUrl);
      socket.onopen = () => socket?.send(JSON.stringify({ type: "subscribe", symbols: [symbol] }));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as StreamMessage;
        if (message.type === "candle" && message.symbol === symbol) {
          barsRef.current.set(message.time, message);
          redraw();
        }
        if (message.type === "snapshot") {
          const matching = message.bars.filter((bar) => bar.symbol === symbol);
          if (!matching.length) return;
          matching.forEach((bar) => barsRef.current.set(bar.time, bar));
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
        <button type="button" onClick={(event) => { event.stopPropagation(); zoom(1.45); }} className="px-2 py-1 hover:bg-white/10" title="Zoom out">−</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); resetView(); }} className="border-x px-2 py-1 font-mono text-[10px] hover:bg-white/10" style={{ borderColor: "var(--color-border)" }} title="Reset chart view">RESET</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); zoom(0.7); }} className="px-2 py-1 hover:bg-white/10" title="Zoom in">+</button>
      </div>
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded px-2 py-1 font-mono text-[10px]" style={{ color: "#cbd5e1", background: "rgba(11,18,32,.72)" }}>EMA 9 · ST 10,3 · PDH/PDL · P/R1/S1</div>
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