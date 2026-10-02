"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import NavSidebar from "./NavSidebar";
export default function AppShell({ children }: { children: ReactNode }) {
  if (usePathname() === "/login") return <>{children}</>;
  return <div className="min-h-screen lg:flex"><NavSidebar /><main className="min-w-0 flex-1">{children}</main><form action="/api/auth/logout" method="post" className="fixed right-4 bottom-4 z-50"><button className="rounded-lg border border-border2 bg-surface px-3 py-2 text-xs text-muted2 hover:text-text2">Sign out</button></form></div>;
}
