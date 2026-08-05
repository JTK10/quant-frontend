import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Takes a PAPER option entry from the /strike page.
 *
 * The browser cannot reach the VM directly, and opening a port for it would be
 * a new public surface for no gain. Instead this writes a REQUEST doc onto the
 * same PANTHER bus every scanner already publishes to, and strike_bot.py on the
 * VM picks it up on its next 30s pass and fills at the live ask.
 *
 * That indirection is deliberate: the fill price must come from the VM at the
 * moment of the fill, never from the browser. A client-supplied premium would
 * be a stale number the user could unknowingly (or knowingly) shape. ref_prem
 * is carried only so the bot can report slippage against what was on screen.
 *
 * PAPER ONLY. Nothing here places a real order.
 */

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
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`OAuth token failed: ${r.status}`);

  const j = await r.json();
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

function istNow() {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  return {
    date: d.toISOString().slice(0, 10),
    hm: d.toISOString().slice(11, 16),
  };
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    const underlying = String(b.underlying || "").trim();
    const side = String(b.side || "").toUpperCase();
    const optKey = String(b.opt_key || "").trim();
    if (!underlying || !optKey || (side !== "LONG" && side !== "SHORT")) {
      return NextResponse.json(
        { error: "underlying, opt_key and side (LONG|SHORT) are required" },
        { status: 400 }
      );
    }

    const { date, hm } = istNow();
    const sid = `SR-${date.replace(/-/g, "")}-${underlying.replace(/\s+/g, "")}-${hm.replace(":", "")}`;

    const doc = {
      ts: Date.now() / 1000,
      time: `${hm}:00`,
      side,
      name: String(b.opt_symbol || b.strike || underlying),
      entry: null,                 // the BOT sets the fill, never the browser
      cap: "STRIKE",
      imb: 0,
      source: "strike_req",
      sig_date: date.replace(/-/g, ""),
      event: "REQUEST",
      kind: "REQUEST",
      provisional: false,
      signal_id: sid,
      underlying,
      opt_key: optKey,
      opt_symbol: b.opt_symbol ?? null,
      strike: b.strike ?? null,
      expiry: b.expiry ?? null,
      lot: b.lot ?? null,
      otm_pct: b.otm_pct ?? null,
      ref_prem: b.ref_prem ?? null,   // what the user saw, for slippage reporting
      requested_by: "web",
    };

    const url = process.env.PANTHER_SIGNALS_URL;
    if (!url) throw new Error("Missing PANTHER_SIGNALS_URL");

    const token = await getToken();
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(doc),
      cache: "no-store",
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `PANTHER rejected the request: ${r.status} ${t.slice(0, 200)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, signal_id: sid });
  } catch (e: any) {
    console.error("strike-enter:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
