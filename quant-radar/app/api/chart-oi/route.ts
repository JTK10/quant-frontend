import { requireApiSession } from "@/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { getTodayIstDate } from "@/utils/backend";
import type { OIData, OISnapshot, OIWall } from "@/app/charts/oiTypes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Doc = { source: string; sig_date: string; cut: string; ts?: number; degraded?: boolean; oi_levels?: unknown[][] };
type Session = Map<string, OISnapshot>;
let tokenCache = { token: "", until: 0 };
let tokenPending: Promise<string> | null = null;
const inflight = new Map<string, Promise<Session>>();
const sessionCache = new Map<string, { until: number; data: Session }>();

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.until) return tokenCache.token;
  if (tokenPending) return tokenPending;
  tokenPending = (async () => {
    const { PANTHER_CLIENT_ID: id, PANTHER_CLIENT_SECRET: secret, PANTHER_TOKEN_URL: url } = process.env;
    if (!id || !secret || !url) throw new Error("OI feed is not configured");
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`OI authentication failed (${res.status})`);
    const t = await res.json();
    tokenCache = { token: t.access_token, until: Date.now() + Math.max(0, Number(t.expires_in) - 60) * 1000 };
    return tokenCache.token;
  })();
  try { return await tokenPending; } finally { tokenPending = null; }
}

async function fetchDocs(date: string, source: string): Promise<Doc[]> {
  const signalsUrl = process.env.PANTHER_SIGNALS_URL;
  if (!signalsUrl) throw new Error("OI feed is not configured");
  const token = await getToken();
  const url = new URL(signalsUrl);
  url.searchParams.set("sig_date", date.replaceAll("-", "")); url.searchParams.set("src", source);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`OI feed failed (${res.status})`);
  const data = await res.json();
  return (data.items ?? []).flatMap((item: Record<string, unknown>) => {
    try {
      const doc = (typeof item.doc === "string" ? JSON.parse(item.doc) : item.doc ?? item) as Doc;
      return doc.source === source && String(doc.sig_date) === date.replaceAll("-", "") ? [doc] : [];
    } catch { return []; }
  });
}

async function loadSession(date: string): Promise<Session> {
  const cached = sessionCache.get(date);
  if (cached && Date.now() < cached.until) return cached.data;
  if (inflight.has(date)) return inflight.get(date)!;
  const promise = (async () => {
    // One compact closing snapshot replaces up to 75 full daily snapshots.
    let docs = await fetchDocs(date, "chart_oi_close");
    if (!docs.length) docs = await fetchDocs(date, "chart_oi");
    docs = docs.filter(d => /^\d{2}:\d{2}$/.test(d.cut) && d.cut <= "15:25")
      .sort((a, b) => b.cut.localeCompare(a.cut) || Number(b.ts ?? 0) - Number(a.ts ?? 0));
    const result: Session = new Map();
    for (const doc of docs) {
      for (const row of doc.oi_levels ?? []) {
        const symbol = String(row[0]);
        if (result.has(symbol)) continue;
        const time = Date.parse(`${date}T${doc.cut}:00+05:30`) / 1000;
        if (!Number.isFinite(time) || !Number.isFinite(Number(row[1]))) continue;
        result.set(symbol, { date, cut: doc.cut, time, spot: Number(row[1]), expiry: String(row[2]), support: row[3] as OIWall[], resistance: row[4] as OIWall[], degraded: Boolean(doc.degraded) });
      }
    }
    sessionCache.delete(date);
    sessionCache.set(date, { until: Date.now() + (result.size ? 300000 : 60000), data: result });
    if (sessionCache.size > 32) sessionCache.delete(sessionCache.keys().next().value!);
    return result;
  })();
  inflight.set(date, promise);
  try { return await promise; } finally { inflight.delete(date); }
}

export async function GET(request: NextRequest) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").toUpperCase();
  const date = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^[A-Z0-9 &._-]{1,30}$/.test(symbol) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return NextResponse.json({ error: "Invalid symbol or date" }, { status: 400 });
  const result: OIData = { symbol, date, intraday: [], previous: [], errors: [] };
  const dates: string[] = [];
  // Today's intraday history is no longer requested by the previous-day view.
  for (let offset = 1; offset <= 10; offset++) {
    const day = new Date(parsed); day.setUTCDate(day.getUTCDate() - offset);
    if (![0, 6].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10));
  }
  for (let i = 0; i < dates.length && result.previous.length < 3; i += 3) {
    const wave = dates.slice(i, i + 3);
    const sessions = await Promise.allSettled(wave.map(loadSession));
    sessions.forEach((session, index) => {
      if (session.status === "fulfilled") {
        const snap = session.value.get(symbol);
        if (snap && result.previous.length < 3) result.previous.push(snap);
      } else result.errors.push(`${wave[index]}: ${session.reason instanceof Error ? session.reason.message : "unavailable"}`);
    });
    if (result.errors.length) break;
  }
  return NextResponse.json(result, { headers: { "Cache-Control": result.errors.length ? "no-store" : "public, max-age=60, s-maxage=300, stale-while-revalidate=60" } });
}
