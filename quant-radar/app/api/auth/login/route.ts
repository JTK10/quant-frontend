import { NextRequest, NextResponse } from "next/server";
import { authConfigured, createSession, safeDestination, sameOrigin, SESSION_COOKIE, SESSION_SECONDS, verifyPassword } from "@/utils/auth";
import { allowPasswordAttempt, currentPasswordHash, resetPasswordAttempts } from "@/utils/authStore";

// Per-instance backoff supplements a high-entropy password; not a distributed firewall.
const attempts = new Map<string, { count: number; reset: number }>();
// A new namespace retires counters polluted by successful logins in the old implementation.
const LOGIN_ATTEMPTS = "login-v2";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  try { if (!await authConfigured()) return NextResponse.json({ error: "Private access needs to be configured by the owner." }, { status: 503 }); }
  catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 503 }); }
  const now = Date.now(), key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  for (const [ip, entry] of attempts) if (entry.reset <= now) attempts.delete(ip);
  const previous = attempts.get(key);
  if (previous && previous.count >= 5) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } });
  if (attempts.size >= 10000 && !previous) return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  attempts.set(key, { count: (previous?.count ?? 0) + 1, reset: previous?.reset ?? now + 900000 });
  try { if (!await allowPasswordAttempt(key, LOGIN_ATTEMPTS)) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429, headers: { "Retry-After": "900" } }); }
  catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }); }
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return NextResponse.json({ error: "Invalid request" }, { status: 413 });
  let input: { password?: unknown; next?: unknown };
  try { const body = await request.text(); if (body.length > 4096) throw new Error(); input = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  let passwordHash: string | null;
  try { passwordHash = await currentPasswordHash(); }
  catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }); }
  if (!input || typeof input.password !== "string" || !passwordHash || !await verifyPassword(input.password, passwordHash)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try { await resetPasswordAttempts(key, LOGIN_ATTEMPTS); }
  catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 }); }
  attempts.delete(key);
  const response = NextResponse.json({ next: safeDestination(input.next) }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(SESSION_COOKIE, await createSession(Date.now(), passwordHash), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  return response;
}
