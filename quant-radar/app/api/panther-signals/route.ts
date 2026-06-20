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

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();
  const targetDate = dateStr.replace(/-/g, "");

  try {
    const t = await getToken();
    const signalsUrl = process.env.PANTHER_SIGNALS_URL;
    
    if (!signalsUrl) {
      throw new Error("Missing PANTHER_SIGNALS_URL");
    }

    const r = await fetch(signalsUrl, {
      headers: { Authorization: `Bearer ${t}` },
      cache: "no-store",
    });
    
    if (!r.ok) {
      throw new Error(`Failed to fetch Panther signals: ${r.status}`);
    }

    const data = await r.json();
    
    const parsedSignals = (data.items || []).map((it: any) => {
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
      // Python's panther_live.py pushes sig_date as 'YYYYMMDD'
      if (s.sig_date) return s.sig_date === targetDate;
      // Fallback if sig_date isn't present
      return true;
    });

    return NextResponse.json(normalizePantherSignals(filteredSignals));
  } catch (error) {
    console.error("Panther API Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load panther signals." },
      { status: 500 },
    );
  }
}
