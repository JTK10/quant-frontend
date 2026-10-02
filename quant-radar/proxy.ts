import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, validSession, sameOrigin } from "@/utils/auth";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const forwarded = new Headers(request.headers);
  forwarded.set("x-quant-path", path + request.nextUrl.search);
  if (path === "/login" || path === "/api/auth/login" || path === "/api/auth/logout") return NextResponse.next({ request: { headers: forwarded } });
  if (!await validSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Please sign in" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
