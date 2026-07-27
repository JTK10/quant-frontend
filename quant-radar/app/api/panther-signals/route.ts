import { NextRequest, NextResponse } from "next/server";
import { normalizePantherSignals, getTodayIstDate } from "@/utils/backend";

export const dynamic = "force-dynamic";

let cache = { token: null as string | null, exp: 0 };

async function getToken() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  
  const clientId = process.env.PANTHER_CLIENT_ID;
  const clientSecret = process.env.PANTHER_CLIENT_SECRET;
  const tokenUrl = process.env.PANTHER_TOKEN_URL;
  
  if (!clientId || !clientSecret || !tokenUrl) {
    throw new Error("Missing Panther OAuth credentials");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { 
      Authorization: `Basic ${basic}`, 
      "Content-Type": "application/x-www-form-urlencoded" 
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  
  if (!r.ok) {
    throw new Error(`Failed to get OAuth token: ${r.status}`);
  }
  
  const j = await r.json();
  // Buffer expiration by 60 seconds
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

// Short-lived RAW cache keyed by DATE ONLY. The ORDS GET returns all 7 days of
// rows (~9k docs, ~6-15s) on every call; signals only change every 5 min. The
// key insight for perf: this upstream fetch is cached once per date and SHARED
// across every page's source-filtered request, so the slow fetch happens once
// per 30s window, not once per page. Filtering happens in-memory on the cached
// raw array -- cheap.
const RAW_TTL_MS = 30_000;
const rawCache = new Map<string, { exp: number; rows: any[] }>();
const rawInflight = new Map<string, Promise<any[]>>();

async function getRawByDate(targetDate: string): Promise<any[]> {
  const hit = rawCache.get(targetDate);
  if (hit && Date.now() < hit.exp) return hit.rows;
  // De-dupe concurrent misses so N pages loading at once trigger ONE fetch.
  const inflight = rawInflight.get(targetDate);
  if (inflight) return inflight;

  const p = (async () => {
    const t = await getToken();
    const signalsUrl = process.env.PANTHER_SIGNALS_URL;
    if (!signalsUrl) throw new Error("Missing PANTHER_SIGNALS_URL");

    const r: Response = await fetch(signalsUrl, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Failed to fetch Panther signals: ${r.status}`);

    const data: any = await r.json();
    const allItems = data.items || [];

    const parsedSignals = allItems.map((it: any) => {
      let doc = {};
      if (it.doc && typeof it.doc === "string") {
        try { doc = JSON.parse(it.doc); } catch (e) {}
      }
      return { source: "panther", ...doc, ...it };
    });

    const filteredSignals = parsedSignals.filter((s: any) => {
      if (s.sig_date) return String(s.sig_date) === targetDate;
      if (s.SIG_DATE) return String(s.SIG_DATE) === targetDate;
      if (s.ts) {
        const d = new Date(s.ts * 1000);
        const istDateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(d).replace(/-/g, "");
        return istDateStr === targetDate;
      }
      return true;
    });

    // Collapse the rank engine's snapshot-so-far duplicates (same signal
    // re-emitted every cycle). kind/event in the key so FABLE ENTRY isn't
    // dropped by its own MTM heartbeat landing on the same minute (2026-07-22).
    const seen = new Set<string>();
    const dedupedSignals = filteredSignals.filter((s: any) => {
      const key = `${s.name ?? ""}|${s.side ?? ""}|${s.time ?? ""}|${s.kind ?? s.event ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    rawCache.set(targetDate, { exp: Date.now() + RAW_TTL_MS, rows: dedupedSignals });
    return dedupedSignals;
  })();

  rawInflight.set(targetDate, p);
  try {
    return await p;
  } finally {
    rawInflight.delete(targetDate);
  }
}

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();
  const targetDate = dateStr.replace(/-/g, "");

  // Per-page source filter (?sources=caracal2,shakeout). Absent = all sources.
  // latestCycle=1 collapses snapshot sources (afac2/smartlist publish a full
  // doc every 5 min but pages show only the newest) to the latest time per
  // source+category. Both applied in-memory on the shared raw cache.
  const sourcesParam = request.nextUrl.searchParams.get("sources");
  const wantSources = sourcesParam
    ? new Set(sourcesParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const latestCycle = request.nextUrl.searchParams.get("latestCycle") === "1";

  try {
    let rows = await getRawByDate(targetDate);

    if (wantSources) {
      rows = rows.filter((s: any) => wantSources.has(String(s.source)));
    }

    if (latestCycle) {
      const latestTimeByKey = new Map<string, string>();
      for (const s of rows) {
        const k = `${s.source}|${s.category ?? ""}`;
        const t = String(s.time ?? "");
        if (!latestTimeByKey.has(k) || t > (latestTimeByKey.get(k) as string)) {
          latestTimeByKey.set(k, t);
        }
      }
      rows = rows.filter(
        (s: any) => String(s.time ?? "") === latestTimeByKey.get(`${s.source}|${s.category ?? ""}`),
      );
    }

    return NextResponse.json(normalizePantherSignals(rows));
  } catch (error) {
    console.error("Panther API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load panther signals." },
      { status: 500 },
    );
  }
}
