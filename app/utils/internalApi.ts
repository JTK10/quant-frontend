import { headers } from "next/headers";

export async function getInternalApiUrl(path: string): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

  if (!host) {
    return path;
  }

  return `${protocol}://${host}${path}`;
}
