import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/globals.css";
import AppShell from "@/components/AppShell";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validSession } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Quant Radar",
  description: "NSE intraday radar, pulse, sector flow, and AI analysis terminal.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get("x-quant-path") ?? "/";
  if (path.split("?")[0] !== "/login" && !await validSession((await cookies()).get(SESSION_COOKIE)?.value))
    redirect(`/login?next=${encodeURIComponent(path)}`);
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
