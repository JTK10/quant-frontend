import { requireApiSession } from "@/utils/auth";
import { NextRequest, NextResponse } from "next/server";
import { normalizePantherSignals, getTodayIstDate } from "@/utils/backend";
import {resultCache} from '@/utils/resultCache';
import {projectRustySnapshot,rustyHistoryCache,rustyHistoryResponse} from '@/utils/rustyHistory';

export const dynamic = "force-dynamic";

let cache = { token: null as string | null, exp: 0 };
let tokenPending:Promise<string|null>|undefined;
const historyCache=rustyHistoryCache();
const payloadCache=resultCache<string>({maxEntries:32,maxBytes:16*1024*1024,size:s=>Buffer.byteLength(s)});

async function getToken() {
  if (cache.token && Date.now() < cache.exp) return cache.token;
  if(tokenPending)return tokenPending;
  tokenPending=loadToken().finally(()=>{tokenPending=undefined;});
  return tokenPending;
}

async function loadToken() {
  
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
    signal:AbortSignal.timeout(10000),
  });
  
  if (!r.ok) {
    throw new Error(`Failed to get OAuth token: ${r.status}`);
  }
  
  const j = await r.json();
  // Buffer expiration by 60 seconds
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

// Share simultaneous upstream reads. Completed serialized responses below have
// a 10s live / 5m historical TTL, always behind session authentication.
const rawInflight = new Map<string, Promise<any[]>>();

async function getRawByDate(targetDate: string, sourcesParam: string | null): Promise<any[]> {
  // Push sig_date and src UPSTREAM instead of downloading the world and
  // filtering here. This route used to fetch PANTHER_SIGNALS_URL with NO query
  // params, pull every doc for every publisher, and filter in Node -- /serval
  // needed 17KB and downloaded 2.7MB (8.2MB before the v2dyn/smartlist purge)
  // to get it. That is what made every page 17-19s on 2026-08-05.
  //
  // The ORDS handler has supported both filters all along; the parameter is
  // :src, not :source or :sources, which is why probing the latter two made it
  // look like no filter existed. Measured 2026-08-05:
  //     sig_date only              1104 rows  2,725,105 bytes  1.1s
  //     &src=serval                  46 rows     20,453 bytes  0.1s
  //     &src=caracal2,shakeout       64 rows     27,730 bytes  0.1s
  // It takes a comma-separated list, matching what pages already pass.
  //
  // The Node-side filters below are deliberately KEPT as a backstop --
  // correctness must not depend on the upstream honouring a hint.
  const cacheKey = `${targetDate}|${sourcesParam ?? ""}`;
  const inflight = rawInflight.get(cacheKey);
  if (inflight) return inflight;

  const p = (async () => {
    const t = await getToken();
    const signalsUrl = process.env.PANTHER_SIGNALS_URL;
    if (!signalsUrl) throw new Error("Missing PANTHER_SIGNALS_URL");

    const u = new URL(signalsUrl);
    u.searchParams.set("sig_date", targetDate);
    // The handler binds :src (NOT :source or :sources) and accepts a comma list.
    if (sourcesParam) u.searchParams.set("src", sourcesParam);

    const r: Response = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
      signal:AbortSignal.timeout(40000),
    });
    if(r.status===401)cache={token:null,exp:0};
    if (!r.ok) throw new Error(`Failed to fetch Panther signals: ${r.status}`);

    const reader=r.body?.getReader();if(!reader)throw new Error('Empty Panther feed');
    const chunks:Uint8Array[]=[];let byteCount=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;byteCount+=value.byteLength;if(byteCount>64*1024*1024)throw new Error('Panther feed size exceeded');chunks.push(value);}}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const data: any = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(data.hasMore)throw new Error('Incomplete Panther feed');
    const allItems = data.items || [];
    if(!Array.isArray(allItems)||allItems.length>10000)throw new Error('Invalid Panther feed items');

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

  rawInflight.set(cacheKey, p);
  try {
    return await p;
  } finally {
    rawInflight.delete(cacheKey);
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
  after: string | null = null,
  rustyView = false,
  requestedCut: string | null = null,
) {
  const wantSources = sourcesParam
    ? new Set(sourcesParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  let rows = await getRawByDate(targetDate, sourcesParam);

  if (wantSources) {
    rows = rows.filter((s: any) => wantSources.has(String(s.source)));
  }
  const availableCuts=rustyView?Array.from(new Set<string>(rows.map((s:any)=>String(s.cut||s.time||'')).filter(Boolean))).sort():[];
  if(rustyView){
    const latest=availableCuts.at(-1);
    rows=rows.filter((s:any)=>{const cut=String(s.cut||s.time||'');return requestedCut?cut===requestedCut:cut===latest||(after!==null&&cut===after);});
  }
  // Rusty already holds earlier cuts in the browser. Filter before projection
  // and normalization so incremental refreshes only process the returned cuts.
  if(after)rows=rows.filter((s:any)=>String(s.cut||s.time||'')>=after);

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

    // Same trim for the two-sided board shape. OCELOT publishes `bull`/`bear`
    // arrays rather than `rows`, so it fell through to passthrough and shipped
    // every entry of all 78 cuts: 1.23MB on 2026-08-28, and that was after the
    // a15/bt/lv/ls fields pushed each doc from 13.4KB to 15.9KB. Same failure
    // mode waiting as AFAC's -- past 2MiB the Data Cache entry silently fails
    // to store and the route returns [].
    rows = rows.map((s: any) => {
      if (!Array.isArray(s.bull) && !Array.isArray(s.bear)) return s;
      const cut = (side: any[]) =>
        [...side]
          .sort((a, b) => (b?.[rankBy] ?? -Infinity) - (a?.[rankBy] ?? -Infinity))
          .slice(0, topN);
      return {
        ...s,
        bull: Array.isArray(s.bull) ? cut(s.bull) : s.bull,
        bear: Array.isArray(s.bear) ? cut(s.bear) : s.bear,
      };
    });
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

  // RUSTY's selection inputs are proprietary. Its public board exposes only
  // the named display metrics: pure OI change (Rusty %) and its rank, plus the
  // requested opposite-leg increase rank for each side. Raw leg values and
  // the selection calculation remain redacted before serialization.
  rows = rows.map((snapshot: any) => {
    if (snapshot.source !== "rusty") return snapshot;
    return projectRustySnapshot(snapshot);
  });
  const snapshots=normalizePantherSignals(rows);
  return rustyView?{snapshots,cuts:availableCuts}:snapshots;
}

// Process-local caches do not persist across deployments or share private
// responses through a public CDN. Expired failures propagate to the caller.

export async function GET(request: NextRequest) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
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
  const after=request.nextUrl.searchParams.get('after');
  const view=request.nextUrl.searchParams.get('view');
  const requestedCut=request.nextUrl.searchParams.get('cut');
  if(!/^\d{8}$/.test(targetDate)||!Number.isFinite(Date.parse(`${targetDate.slice(0,4)}-${targetDate.slice(4,6)}-${targetDate.slice(6,8)}`))||
    (sourcesParam&&(!/^[a-zA-Z0-9_,.-]{1,256}$/.test(sourcesParam)))||
    (after&&(sourcesParam!=='rusty'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(after)))||
    (view&&(view!=='rusty'||sourcesParam!=='rusty'))||
    (requestedCut&&(view!=='rusty'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(requestedCut)))){
    return NextResponse.json({error:'Invalid session or source'},{status:400,headers:{'Cache-Control':'private, no-store'}});
  }

  try {
    const historical=targetDate<getTodayIstDate().replaceAll('-','');
    if(view==='rusty'&&!latestCycle&&!lastN&&!topN&&!rankBy){
      const forceRefresh=/\b(no-cache|max-age=0)\b/.test(request.headers?.get('cache-control')??'');
      const history=await historyCache(targetDate,forceRefresh?0:historical?300000:10000,forceRefresh?null:requestedCut,async()=>{
        const raw=await getRawByDate(targetDate,'rusty');
        const rows=raw.filter(s=>s.source==='rusty').sort((a,b)=>(a.ts??0)-(b.ts??0));
        return normalizePantherSignals(rows.map(projectRustySnapshot));
      });
      const body=rustyHistoryResponse(history,requestedCut,after);
      // Published cuts can be reused privately during the live day; Refresh can revalidate.
      return new NextResponse(body,{headers:{'Content-Type':'application/json','Cache-Control':historical||requestedCut?'private, max-age=300':'private, max-age=10'}});
    }
    const ttl=historical?300000:10000;
    const key=JSON.stringify([targetDate,sourcesParam,latestCycle,lastN,topN,rankBy,after,view,requestedCut]);
    const body=await payloadCache(key,ttl,async()=>{
      const rows=await buildPayload(targetDate,sourcesParam,latestCycle,lastN,topN,rankBy,after,view==='rusty',requestedCut);
      return JSON.stringify(rows);
    });
    return new NextResponse(body,{headers:{'Content-Type':'application/json','Cache-Control':historical?'private, max-age=300':'private, max-age=10'}});
  } catch (error) {
    console.error("Panther API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load panther signals." },
      { status: 500,headers:{'Cache-Control':'private, no-store'} },
    );
  }
}
