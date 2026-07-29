import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
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
    //
    // Keep the doc with the HIGHEST ts, not the first one encountered: when a
    // snapshot is re-published for the same cycle (a corrected replay, or a
    // scanner restart re-emitting), the newer doc is the right one. Keeping
    // "first seen" silently pinned stale content (2026-07-29).
    // SOURCE must be in the key. CARACAL2 and SERVAL share a funnel, so they
    // routinely flag the same stock at the same minute (KAYNES and KPITTECH
    // both did on 2026-07-29). Without source in the key those collide and one
    // engine's row is silently dropped -- the Caracal page was losing exactly
    // its highest-conviction signals, the ones both engines agreed on.
    const bestByKey = new Map<string, any>();
    for (const s of filteredSignals) {
      const key = `${s.source ?? ""}|${s.name ?? ""}|${s.side ?? ""}|${s.time ?? ""}|${s.kind ?? s.event ?? ""}`;
      const prev = bestByKey.get(key);
      if (!prev || (s.ts ?? 0) > (prev.ts ?? 0)) bestByKey.set(key, s);
    }
    const dedupedSignals = Array.from(bestByKey.values());

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

// Build the per-page payload: fetch (shared, in-memory) then filter.
async function buildPayload(
  targetDate: string,
  sourcesParam: string | null,
  latestCycle: boolean,
  lastN: number,
) {
  const wantSources = sourcesParam
    ? new Set(sourcesParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  let rows = await getRawByDate(targetDate);

  if (wantSources) {
    rows = rows.filter((s: any) => wantSources.has(String(s.source)));
  }

  // lastN: keep only the newest N cycles. Sector Scope renders just the latest
  // snapshot plus one ~15min back, but afac2 publishes ~69 cycles/day, so
  // without this it downloads ~1.7MB to use two of them.
  if (lastN > 0) {
    const times = Array.from(new Set(rows.map((s: any) => String(s.time ?? "")))).sort();
    const keep = new Set(times.slice(-lastN));
    rows = rows.filter((s: any) => keep.has(String(s.time ?? "")));
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

  return normalizePantherSignals(rows);
}

// The upstream ORDS GET is ~29MB / ~10s and cannot be filtered server-side
// (the table exposes a single CLOB `doc` column -- no indexed date to query
// on), so the only lever is caching. The in-memory map above dies with each
// ephemeral serverless instance, which is why cold hits still felt slow.
// unstable_cache persists in Vercel's Data Cache, SHARED across instances, so
// the 29MB fetch happens once per revalidate window for the whole site rather
// than once per cold instance. We cache the FILTERED payload (KBs, well under
// the per-entry cache limit) -- caching the 29MB raw would exceed it.
const getPayload = unstable_cache(
  async (targetDate: string, sourcesParam: string | null, latestCycle: boolean, lastN: number) =>
    buildPayload(targetDate, sourcesParam, latestCycle, lastN),
  ["panther-signals"],
  { revalidate: 30 },
);

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();
  const targetDate = dateStr.replace(/-/g, "");

  // Per-page source filter (?sources=caracal2,shakeout). Absent = all sources.
  // latestCycle=1 collapses snapshot sources (afac2/smartlist publish a full
  // doc every 5 min but pages show only the newest) to the latest time per
  // source+category.
  const sourcesParam = request.nextUrl.searchParams.get("sources");
  const latestCycle = request.nextUrl.searchParams.get("latestCycle") === "1";
  const lastN = Number(request.nextUrl.searchParams.get("lastN") ?? 0) || 0;

  try {
    const body = await getPayload(targetDate, sourcesParam, latestCycle, lastN);
    return NextResponse.json(body);
  } catch (error) {
    console.error("Panther API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load panther signals." },
      { status: 500 },
    );
  }
}
