"use client";
import { useEffect, useState } from "react";
import type { OIData } from "./oiTypes";
const pending = new Map<string, Promise<OIData>>();
async function load(symbol: string, date: string) {
  const key = `${symbol}|${date}`;
  if (pending.has(key)) return pending.get(key)!;
  const promise = fetch(`/api/chart-oi?symbol=${encodeURIComponent(symbol)}&date=${date}`, { cache: "no-store" }).then(async r => { if (!r.ok) throw new Error("OI feed unavailable"); return await r.json() as OIData; });
  pending.set(key, promise);
  try { return await promise; } finally { pending.delete(key); }
}
export function useOIData(symbol: string, date: string) {
  const [data, setData] = useState<OIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setData(null); setLoading(true); setError("");
    const refresh = async () => {
      try { const next = await load(symbol, date); if (!stopped) { setData(next); setError(next.errors.join(" · ")); } }
      catch (e) { if (!stopped) setError(e instanceof Error ? e.message : "OI unavailable"); }
      finally { if (!stopped) { setLoading(false); timer = setTimeout(refresh, 60000); } }
    };
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [symbol, date]);
  return { data: data?.symbol === symbol && data.date === date ? data : null, loading, error };
}
