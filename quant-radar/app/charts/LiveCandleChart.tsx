"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
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

const IST_TIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  day: "2-digit",
  month: "short",
});

function timeToEpochSeconds(time: Time): number {
  if (typeof time === "number") return time;
  if (typeof time === "string") return Date.parse(time) / 1000;
  return Date.UTC(time.year, time.month - 1, time.day) / 1000;
}

function formatIstTime(time: Time): string {
  return IST_TIME_FORMATTER.format(new Date(timeToEpochSeconds(time) * 1000));
}
const INTERVAL_SECONDS: Record<Timeframe, number> = {
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "1D": 86400,
};

function bucketStart(time: number, timeframe: Timeframe): number {
  if (timeframe === "1D") {
    const date = new Date(time * 1000);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  }
  return Math.floor(time / INTERVAL_SECONDS[timeframe]) * INTERVAL_SECONDS[timeframe];
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
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef = useRef(new Map<number, ChartBar>());

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
      rightPriceScale: { borderColor: "#25334b" },
      timeScale: { borderColor: "#25334b", timeVisible: true, secondsVisible: false, tickMarkFormatter: formatIstTime },
      localization: { locale: "en-IN", timeFormatter: formatIstTime },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;

    const bars = aggregateBars([...barsRef.current.values()], timeframe);
    candles.setData(bars.map(asCandle));
    volume.setData(bars.map((bar) => ({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: bar.close >= bar.open ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.45)",
    })));
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
    };
  }, [timeframe, symbol]);

  useEffect(() => {
    if (!streamUrl) return;
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const redraw = () => {
      const bars = aggregateBars([...barsRef.current.values()], timeframe);
      candleRef.current?.setData(bars.map(asCandle));
      volumeRef.current?.setData(bars.map((bar) => ({
        time: bar.time as UTCTimestamp,
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(34,197,94,.45)" : "rgba(239,68,68,.45)",
      })));
    };

    const connect = () => {
      socket = new WebSocket(streamUrl);
      socket.onopen = () => socket?.send(JSON.stringify({ type: "subscribe", symbols: [symbol] }));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as StreamMessage;
        const apply = (bar: CandleMessage) => {
          barsRef.current.set(bar.time, bar);
          redraw();
        };
        if (message.type === "candle" && message.symbol === symbol) apply(message);
        if (message.type === "snapshot") message.bars.filter((bar) => bar.symbol === symbol).forEach(apply);
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

  return <div ref={hostRef} className={`h-full w-full ${compact ? "min-h-[330px]" : "min-h-[460px]"}`} aria-label={`${symbol} live price chart`} />;
}
