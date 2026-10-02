import { randomBytes, scryptSync } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, SESSION_COOKIE, verifyPassword } from "@/utils/auth";
import { allowPasswordAttempt, currentPasswordHash, passwordStoreConfigured, replacePasswordHash } from "@/utils/authStore";

export async function POST(request: NextRequest) {
  const denied = await requireApiSession(request); if (denied) return denied;
  if (!passwordStoreConfigured()) return NextResponse.json({ error: "Password changes need the private database connection. Please finish setup first." }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return NextResponse.json({ error: "Invalid request" }, { status: 413 });
  let input: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };
  try { const body = await request.text(); if (body.length > 4096) throw new Error(); input = JSON.parse(body); }
  catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!input || typeof input.currentPassword !== "string" || typeof input.newPassword !== "string" || typeof input.confirmPassword !== "string")
    return NextResponse.json({ error: "Please fill in all three password fields." }, { status: 400 });
  if (input.newPassword.length < 8 || input.newPassword.length > 256)
    return NextResponse.json({ error: "Use 8–256 characters. A long, unique passphrase works well." }, { status: 400 });
  if (input.newPassword !== input.confirmPassword) return NextResponse.json({ error: "The new passwords do not match." }, { status: 400 });
  if (input.newPassword === input.currentPassword) return NextResponse.json({ error: "Choose a different password." }, { status: 400 });
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!await allowPasswordAttempt(ip, "change")) return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
    const previous = await currentPasswordHash();
    if (!previous || !await verifyPassword(input.currentPassword, previous)) return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    const salt = randomBytes(16).toString("hex"), replacement = `${salt}:${scryptSync(input.newPassword, salt, 64).toString("hex")}`;
    if (!await replacePasswordHash(previous, replacement)) return NextResponse.json({ error: "The password changed elsewhere. Sign in again and retry." }, { status: 409 });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch { return NextResponse.json({ error: "Could not confirm the password change. Try signing in with the new password; if it fails, use the previous password." }, { status: 503 }); }
}
