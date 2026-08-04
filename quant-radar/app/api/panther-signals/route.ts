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

// NO result caching. Every request re-fetches upstream, because a cached page
// that silently serves a stale cycle is worse than a slow one on a live desk --
// during the session a 30s window can hide a whole 5-min cycle.
//
// The one thing kept is in-flight de-duplication: if several pages request the
// same date in the same instant they share ONE upstream fetch rather than
// firing N. That is not caching -- nothing is retained after it resolves.
const rawInflight = new Map<string, Promise<any[]>>();

async function getRawByDate(targetDate: string): Promise<any[]> {
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

    return dedupedSignals;
  })();

  rawInflight.set(targetDate, p);
  try {
    return await p;
  } finally {
    rawInflight.delete(targetDate);
  }
}

// Build the per-page payload: fetch fresh, then filter.
async function buildPayload(
  targetDate: string,
  sourcesParam: string | null,
  latestCycle: boolean,
  lastN: number,
  topN: number,
  rankBy: string | null,
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

  // topN/rankBy: trim each snapshot's embedded `rows` array server-side.
  //
  // AFAC.2 and V2DYN publish ~70 cycles/day, each carrying every gated stock
  // (~204 rows), but the pages render only the top 30/40. The pages needed the
  // FULL set purely to compute each row's delta vs the previous cycle, so the
  // other ~174 rows/cycle were shipped just to be thrown away -- 2.70MB for
  // afac2, over Vercel's 2MiB Data Cache entry limit, so the entry silently
  // failed to store and the route returned [] (blank AFAC page, 2026-07-29).
  // v2dyn was at 2.05MB, inside the limit only by ~45KB.
  //
  // Computing the delta here means the baseline never has to cross the wire:
  // we keep the full row set in scope to seed `prev`, but emit only the top N,
  // each with `_d` already resolved. Same numbers, ~8x smaller.
  if (topN > 0 && rankBy) {
    const val = (r: any) => (typeof r?.[rankBy] === "number" ? r[rankBy] : null);
    const snaps = rows
      .filter((s: any) => Array.isArray(s.rows))
      .sort((a: any, b: any) => String(a.time ?? "").localeCompare(String(b.time ?? "")));
    const passthrough = rows.filter((s: any) => !Array.isArray(s.rows));

    const prev = new Map<string, number>();
    // `first` is each symbol's value when it FIRST appeared this session, which
    // for a sticky-gate source is the cycle it gated. `_od` (value - first) is
    // the since-open move, and it must be computed here for the same reason
    // `_d` is: the baseline is routinely outside the top N. KAYNES on
    // 2026-07-29 sat at rank 118 of 121 at 09:20 and finished rank 31 -- a page
    // working from trimmed rows could never recover that starting point.
    const first = new Map<string, number>();
    const trimmed = snaps.map((snap: any) => {
      const all: any[] = snap.rows;
      // Baseline is established by the CURRENT cycle when a symbol debuts, so
      // seed `first` before mapping -- otherwise its debut row reports null
      // instead of a 0 starting point. `prev` is the opposite: it must stay on
      // the previous cycle's value, so it is updated after.
      for (const r of all) if (!first.has(r.n)) first.set(r.n, val(r) ?? 0);
      const top = [...all]
        .sort((a, b) => (val(b) ?? -Infinity) - (val(a) ?? -Infinity))
        .slice(0, topN)
        .map((r) => {
          const p = prev.get(r.n);
          const f = first.get(r.n);
          const v = val(r);
          return {
            ...r,
            _d: p !== undefined ? (v ?? 0) - p : null,
            _o: f ?? null,
            _od: f !== undefined ? (v ?? 0) - f : null,
          };
        });
      // Seed from the FULL set, not the trimmed one, so a stock entering the
      // top N from outside still gets a correct delta rather than a null.
      for (const r of all) prev.set(r.n, val(r) ?? 0);
      return { ...snap, rows: top };
    });
    rows = [...passthrough, ...trimmed];
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

// buildPayload is called directly -- it was wrapped in unstable_cache with
// revalidate:30, which persisted in Vercel's Data Cache and meant a reload
// could return the previous cycle. Removed: correctness over latency here.

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
  // topN+rankBy trim each snapshot's embedded rows to the N the page renders,
  // with the cross-cycle delta resolved server-side (see buildPayload).
  const topN = Number(request.nextUrl.searchParams.get("topN") ?? 0) || 0;
  const rankBy = request.nextUrl.searchParams.get("rankBy");

  try {
    const body = await buildPayload(targetDate, sourcesParam, latestCycle, lastN, topN, rankBy);
    return NextResponse.json(body);
  } catch (error) {
    console.error("Panther API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load panther signals." },
      { status: 500 },
    );
  }
}
