import { NextRequest, NextResponse } from "next/server";
import { getTodayIstDate } from "@/utils/backend";
import type { OIData, OISnapshot, OIWall } from "@/app/charts/oiTypes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
let tokenCache = { token: "", until: 0 };
const inflight = new Map<string, Promise<Record<string, unknown>[]>>();

async function loadDate(date: string) {
  const existing = inflight.get(date);
  if (existing) return existing;
  const promise = (async () => {
    const { PANTHER_CLIENT_ID: id, PANTHER_CLIENT_SECRET: secret, PANTHER_TOKEN_URL: tokenUrl, PANTHER_SIGNALS_URL: signalsUrl } = process.env;
    if (!id || !secret || !tokenUrl || !signalsUrl) throw new Error("OI feed is not configured");
    if (!tokenCache.token || Date.now() >= tokenCache.until) {
      const res = await fetch(tokenUrl, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`OI authentication failed (${res.status})`);
      const t = await res.json();
      tokenCache = { token: t.access_token, until: Date.now() + Math.max(0, Number(t.expires_in) - 60) * 1000 };
    }
    const url = new URL(signalsUrl); url.searchParams.set("sig_date", date.replaceAll("-", "")); url.searchParams.set("src", "chart_oi");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenCache.token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`OI feed failed (${res.status})`);
    const data = await res.json();
    return (data.items ?? []).flatMap((item: Record<string, unknown>) => {
      try { const doc = typeof item.doc === "string" ? JSON.parse(item.doc) : item.doc ?? item; return doc.source === "chart_oi" && doc.sig_date === date.replaceAll("-", "") ? [doc] : []; } catch { return []; }
    }) as Record<string, unknown>[];
  })();
  inflight.set(date, promise);
  try { return await promise; } finally { inflight.delete(date); }
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  const date = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();
  if (!/^[A-Z0-9 &._-]{1,30}$/.test(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) return NextResponse.json({ error: "Invalid symbol or date" }, { status: 400 });
  const result: OIData = { symbol, date, intraday: [], previous: [], errors: [] };
  // Three most recent available sessions, searching past weekends/holidays.
  for (let offset = 0; offset <= 10 && result.previous.length < 3; offset++) {
    const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - offset);
    const session = day.toISOString().slice(0, 10);
    if (offset && [0, 6].includes(day.getUTCDay())) continue;
    try {
      const docs = await loadDate(session);
      const best = new Map<string, { ts: number; snap: OISnapshot }>();
      for (const doc of docs) {
        const cut = String(doc.cut ?? "");
        if (!/^\d{2}:\d{2}$/.test(cut) || cut > "15:25") continue;
        const row = (doc.oi_levels as unknown[][] | undefined)?.find(r => r[0] === symbol);
        if (!row) continue;
        const time = Date.parse(`${session}T${cut}:00+05:30`) / 1000;
        if (!Number.isFinite(time)) continue;
        const snap: OISnapshot = { date: session, cut, time, spot: Number(row[1]), expiry: String(row[2]), support: row[3] as OIWall[], resistance: row[4] as OIWall[], degraded: Boolean(doc.degraded) };
        if (!best.has(cut) || Number(doc.ts ?? 0) > best.get(cut)!.ts) best.set(cut, { ts: Number(doc.ts ?? 0), snap });
      }
      const snaps = [...best.values()].map(x => x.snap).sort((a, b) => a.time - b.time);
      if (!offset) result.intraday = snaps;
      else if (snaps.length) result.previous.push(snaps[snaps.length - 1]);
    } catch (error) {
      result.errors.push(`${session}: ${error instanceof Error ? error.message : "unavailable"}`);
      // A broken upstream must not fan out into ten more requests.
      break;
    }
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
