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

// Short-lived in-memory response cache. The ORDS GET returns all 7 days of
// rows (~9k docs, ~6s) on every call; signals only change every 5 min, so a
// 30s TTL makes page-to-page navigation instant on a warm instance without
// meaningfully staling the data.
const RESP_TTL_MS = 30_000;
const respCache = new Map<string, { exp: number; body: any }>();

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();
  const targetDate = dateStr.replace(/-/g, "");

  const hit = respCache.get(targetDate);
  if (hit && Date.now() < hit.exp) {
    return NextResponse.json(hit.body);
  }

  try {
    const t = await getToken();
    const signalsUrl = process.env.PANTHER_SIGNALS_URL;
    
    if (!signalsUrl) {
      throw new Error("Missing PANTHER_SIGNALS_URL");
    }

    const r: Response = await fetch(signalsUrl, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    
    if (!r.ok) {
      throw new Error(`Failed to fetch Panther signals: ${r.status}`);
    }

    const data: any = await r.json();
    const allItems = data.items || [];
    
    const parsedSignals = allItems.map((it: any) => {
      let doc = {};
      if (it.doc && typeof it.doc === "string") {
        try { doc = JSON.parse(it.doc); } catch (e) {}
      }
      return {
        source: "panther",
        ...doc,
        ...it, 
      };
    });

    const filteredSignals = parsedSignals.filter((s: any) => {
      // Ensure we only return signals for the selected date.
      if (s.sig_date) return String(s.sig_date) === targetDate;
      if (s.SIG_DATE) return String(s.SIG_DATE) === targetDate;
      
      // Since ORDS is returning the .doc JSON which only has `ts` (timestamp),
      // we must convert `ts` to IST and check if it matches targetDate.
      if (s.ts) {
        const d = new Date(s.ts * 1000); // ts is in seconds
        const istDateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(d).replace(/-/g, ""); // Returns "YYYYMMDD"
        
        return istDateStr === targetDate;
      }

      // Fallback if no date info is present
      return true;
    });

    // The rank engine's snapshot-so-far design means a signal that fired at,
    // say, 10:15 legitimately reappears in every cycle's output through session
    // end, and (until a backend fix) got re-inserted as a new document each
    // time -- so the same signal can show up 10-15x. Collapse to one per
    // name+side+time regardless of source, since a genuine repeat would have
    // identical values anyway.
    const seen = new Set<string>();
    const dedupedSignals = filteredSignals.filter((s: any) => {
      const key = `${s.name ?? ""}|${s.side ?? ""}|${s.time ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const body = normalizePantherSignals(dedupedSignals);
    respCache.set(targetDate, { exp: Date.now() + RESP_TTL_MS, body });
    return NextResponse.json(body);
  } catch (error) {
    console.error("Panther API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load panther signals." },
      { status: 500 },
    );
  }
}
