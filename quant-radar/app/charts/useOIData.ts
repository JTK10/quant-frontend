"use client";
import { useEffect, useState } from "react";
import type { OIData } from "./oiTypes";
import {istSessionDate,sessionPollingDelay} from '@/utils/sessionPolling';
const pending = new Map<string, Promise<OIData>>();
const completed = new Map<string, { until: number; data: OIData }>();
async function load(symbol: string, date: string) {
  const key = `${symbol}|${date}`;
  const cached = completed.get(key);
  if (cached && Date.now() < cached.until) return cached.data;
  if (pending.has(key)) return pending.get(key)!;
  const promise = fetch(`/api/chart-oi?symbol=${encodeURIComponent(symbol)}&date=${date}`).then(async r => {
    if (!r.ok) throw new Error("OI feed unavailable");
    const data = await r.json() as OIData;
    if (!data.errors.length) {
      completed.delete(key);
      completed.set(key, { until: Date.now() + 300000, data });
      if (completed.size > 100) completed.delete(completed.keys().next().value!);
    }
    return data;
  });
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}
export function useOIData(symbol: string, date: string) {
  const [data, setData] = useState<OIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false,loaded=false,inFlight=false;
    let timer: ReturnType<typeof setTimeout>;
    const cached = completed.get(`${symbol}|${date}`);
    setData(cached && Date.now() < cached.until ? cached.data : null);
    setLoading(!cached || Date.now() >= cached.until); setError("");
    const scheduleNext = () => {
      clearTimeout(timer);
      if(stopped||date!==istSessionDate()||document.hidden)return;
      const delay=sessionPollingDelay(date,300000);
      timer=setTimeout(()=>{if(sessionPollingDelay(date,300000)!==null)void refresh();else scheduleNext();},delay??60000);
    };
    const refresh = async () => {
      if (stopped||inFlight||(typeof document !== "undefined" && document.hidden)) return;
      clearTimeout(timer);inFlight=true;
      try { const next = await load(symbol, date); if (!stopped) { loaded=next.errors.length===0;setData(next); setError(next.errors.join(" · ")); } }
      catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "OI unavailable"); }
      finally { inFlight=false;if (!stopped) { setLoading(false); scheduleNext(); } }
    };
    const onVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden && !stopped) {
        if(!loaded||sessionPollingDelay(date,300000)!==null)void refresh();
        else scheduleNext();
      } else {
        clearTimeout(timer);
      }
    };
    void refresh();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [symbol, date]);
  return { data: data?.symbol === symbol && data.date === date ? data : null, loading, error };
}
