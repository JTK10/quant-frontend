import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentPasswordHash, passwordHashValid } from "./authStore";

export const SESSION_COOKIE = "quant_session";
export const SESSION_SECONDS = 365 * 24 * 60 * 60;
export async function authConfigured() {
  return (process.env.AUTH_SESSION_SECRET?.length ?? 0) >= 32 && passwordHashValid(await currentPasswordHash());
}
export async function verifyPassword(password: string, passwordHash?: string) {
  if (password.length > 256) return false;
  const current = passwordHash ?? await currentPasswordHash();
  if (!current) return false;
  const [salt, hash] = current.split(":");
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, "hex"));
}
function sign(payload: string, passwordHash: string) {
  return createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update(`${passwordHash}|${payload}`).digest("base64url");
}
export async function createSession(now = Date.now(), passwordHash?: string) {
  const current = passwordHash ?? await currentPasswordHash();
  if (!current || (process.env.AUTH_SESSION_SECRET?.length ?? 0) < 32) throw new Error("Private access is not configured");
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, current)}`;
}
export async function validSession(token: string | undefined, now = Date.now()) {
  if (!token || token.length > 200 || (process.env.AUTH_SESSION_SECRET?.length ?? 0) < 32) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1])) return false;
  const expiry = Number(parts[0]), current = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiry) || expiry <= current || expiry > current + SESSION_SECONDS) return false;
  let activeHash: string | null;
  try { activeHash = await currentPasswordHash(); } catch { return false; }
  if (!activeHash) return false;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`, activeHash));
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
  if (!await validSession((await cookies()).get(SESSION_COOKIE)?.value)) {
    return NextResponse.json({ error: "Please sign in" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request))
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  return null;
}
