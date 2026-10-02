import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SESSION_COOKIE = "quant_session";
export const SESSION_SECONDS = 365 * 24 * 60 * 60;
const hashPattern = /^[a-f0-9]{32}:[a-f0-9]{128}$/;
export function authConfigured() {
  return (process.env.AUTH_SESSION_SECRET?.length ?? 0) >= 32 && hashPattern.test(process.env.AUTH_PASSWORD_HASH ?? "");
}
export function verifyPassword(password: string) {
  if (!authConfigured() || password.length > 256) return false;
  const [salt, hash] = process.env.AUTH_PASSWORD_HASH!.split(":");
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
}
function sign(payload: string) {
  return createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update(`${process.env.AUTH_PASSWORD_HASH}|${payload}`).digest("base64url");
}
export function createSession(now = Date.now()) {
  if (!authConfigured()) throw new Error("Private access is not configured");
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(token: string | undefined, now = Date.now()) {
  if (!authConfigured() || !token || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1])) return false;
  const expiry = Number(parts[0]), current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= current || expiry > current + SESSION_SECONDS) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function safeDestination(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/rusty";
  try {
    const url = new URL(value, "https://private.invalid");
    if (url.origin !== "https://private.invalid" || url.pathname === "/login" || url.pathname.startsWith("/api/")) return "/rusty";
    return url.pathname + url.search;
  } catch { return "/rusty"; }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin"), host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const source = new URL(origin);
    const protocol = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
    return source.host === host && source.protocol === `${protocol}:`;
  } catch { return false; }
}
export async function requireApiSession(request: Request) {
  if (!validSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request))
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  return null;
}
