// Isolated from the stock feeds: both Nifty routes use the same token handling.
let cached = { token: "", until: 0 };
let pending: Promise<string> | null = null;

async function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token;
  if (pending) return pending;
  pending = (async () => {
    const { PANTHER_CLIENT_ID: id, PANTHER_CLIENT_SECRET: secret, PANTHER_TOKEN_URL: url } = process.env;
    if (!id || !secret || !url) throw new Error("Nifty feed is not configured");
    const response = await fetch(url, {
      method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Nifty authentication failed (${response.status})`);
    const data = await response.json();
    if (typeof data.access_token !== "string" || !data.access_token) throw new Error("Nifty authentication returned no token");
    const lifetime = Number(data.expires_in ?? 300);
    cached = { token: data.access_token, until: Date.now() + Math.max(0, (Number.isFinite(lifetime) ? lifetime : 300) - 60) * 1000 };
    return cached.token;
  })();
  try { return await pending; } finally { pending = null; }
}

export async function fetchNiftyFeed(source: "nifty_oi_close" | "nifty_paper_signals", date: string): Promise<{ items?: Record<string, unknown>[] }> {
  const endpoint = process.env.PANTHER_SIGNALS_URL;
  if (!endpoint) throw new Error("Nifty feed is not configured");
  const url = new URL(endpoint);
  url.searchParams.set("src", source);
  url.searchParams.set("sig_date", date.replaceAll("-", ""));
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken();
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (response.status === 401 && attempt === 0) {
      if (cached.token === token) cached = { token: "", until: 0 };
      continue;
    }
    if (!response.ok) throw new Error(`Nifty feed failed (${response.status})`);
    return response.json();
  }
  throw new Error("Nifty feed authentication failed");
}
