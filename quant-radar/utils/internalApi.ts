import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "./auth";

export async function getInternalApiUrl(path: string): Promise<string> {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");

  if (!host) {
    return normalizedPath;
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");

  return `${protocol}://${host}${normalizedPath}`;
}

export async function fetchInternalApi(url: string, init: RequestInit = {}) {
  const host = (await headers()).get("host");
  if (new URL(url).host !== host) throw new Error("Internal API origin mismatch");
  const requestHeaders = new Headers(init.headers);
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) requestHeaders.set("Cookie", `${SESSION_COOKIE}=${token}`);
  return fetch(url, { ...init, headers: requestHeaders, redirect: "error", cache: "no-store" });
}
