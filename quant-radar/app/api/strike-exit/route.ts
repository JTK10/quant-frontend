import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Closes an open PAPER position from the /strike page.
 *
 * Mirrors /api/strike-enter exactly: the browser posts a REQUEST doc onto the
 * PANTHER bus and strike_bot.py on the VM does the actual close at the live
 * bid on its next 30s pass. The browser never supplies an exit price -- a
 * client-supplied fill would be a stale on-screen number the user could
 * unknowingly shape, and P&L has to come from the same place the entry did.
 *
 * signal_id identifies WHICH position to close. The bot matches it against its
 * own open book, so an id it does not hold is simply ignored rather than
 * creating a phantom EXIT.
 *
 * PAPER ONLY. Nothing here places or cancels a real order.
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
  return { date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16) };
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();

    const signalId = String(b.signal_id || "").trim();
    if (!signalId) {
      return NextResponse.json(
        { error: "signal_id is required -- it identifies which position to close" },
        { status: 400 }
      );
    }

    const { date, hm } = istNow();
    const doc = {
      ts: Date.now() / 1000,
      time: `${hm}:00`,
      side: String(b.side || "").toUpperCase(),
      name: String(b.opt_symbol || signalId),
      entry: null,                 // the BOT sets the exit fill, never the browser
      cap: "STRIKE",
      imb: 0,
      source: "strike_exit_req",
      sig_date: date.replace(/-/g, ""),
      event: "EXIT_REQUEST",
      kind: "EXIT_REQUEST",
      provisional: false,
      signal_id: signalId,         // which open position to close
      underlying: b.underlying ?? null,
      opt_key: b.opt_key ?? null,
      opt_symbol: b.opt_symbol ?? null,
      requested_by: "web",
    };

    const url = process.env.PANTHER_SIGNALS_URL;
    if (!url) throw new Error("Missing PANTHER_SIGNALS_URL");

    const token = await getToken();
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(doc),
      cache: "no-store",
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json(
        { error: `PANTHER rejected the exit request: ${r.status} ${t.slice(0, 200)}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, signal_id: signalId });
  } catch (e: any) {
    console.error("strike-exit:", e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
