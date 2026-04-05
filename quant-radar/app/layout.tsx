import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/globals.css";
import NavSidebar from "@/components/NavSidebar";

export const metadata: Metadata = {
  title: "Quant Radar",
  description: "Quant Radar intraday signals, pulse, sector flow, and AI analysis terminal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen lg:flex">
          <NavSidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
