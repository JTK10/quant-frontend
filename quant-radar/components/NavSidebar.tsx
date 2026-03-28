"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart2, Brain, ChevronRight, Zap } from "lucide-react";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/", icon: Activity, label: "Smart Radar", sub: "Final Signals", color: "#ff9f1c" },
  { href: "/pulse", icon: Zap, label: "Signal Pulse", sub: "PCR Watchlist", color: "#ffb347" },
  { href: "/sector", icon: BarChart2, label: "Sector Flow", sub: "Market Rotation", color: "#d97706" },
  { href: "/ai", icon: Brain, label: "AI Analysis", sub: "ML Top Picks", color: "#f59e0b" },
];

function LiveClock() {
  const [time, setTime] = useState("--:--:--");
  const [marketOpen, setMarketOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const currentTime = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now);

      const totalMinutes = istDate.getHours() * 60 + istDate.getMinutes();
      setMarketOpen(totalMinutes >= 555 && totalMinutes < 930);
      setTime(currentTime);
    };

    tick();
    const timerId = window.setInterval(tick, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  return (
    <div className="rounded-2xl border px-4 py-3 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          IST TIME
        </span>
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[8px] tracking-[0.2em]"
          style={{ color: marketOpen ? "var(--color-bull)" : "var(--color-muted)" }}
        >
          <span
            className="relative inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: marketOpen ? "var(--color-bull)" : "var(--color-bear)" }}
          >
            <span
              className="animate-ping absolute inset-0 rounded-full"
              style={{ background: marketOpen ? "var(--color-bull)" : "var(--color-bear)" }}
            />
          </span>
          {marketOpen ? "OPEN" : "CLOSED"}
        </span>
      </div>
      <div className="font-mono text-sm font-semibold" style={{ color: "var(--color-text2)" }}>
        {time}
      </div>
    </div>
  );
}

export default function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-full border-b px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6"
      style={{
        background: "linear-gradient(180deg, rgba(30, 30, 30, 0.96) 0%, rgba(24, 24, 24, 0.96) 100%)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 lg:block">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="relative flex h-10 w-10 items-center justify-center rounded-xl shadow-sm"
            style={{
              background: "linear-gradient(135deg, rgba(255,159,28,0.18) 0%, rgba(217,119,6,0.2) 100%)",
              border: "1px solid rgba(255, 159, 28, 0.35)",
            }}
          >
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, rgba(255, 159, 28, 0.22) 45deg, transparent 90deg)",
              }}
            />
            <Activity size={16} style={{ color: "var(--color-accent)", position: "relative" }} />
          </div>
          <div>
            <div
              className="text-sm font-semibold tracking-[0.1em]"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-text2)" }}
            >
              QUANT RADAR
            </div>
            <div className="font-mono text-[9px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
              SIGNAL DESK
            </div>
          </div>
        </Link>
      </div>

      <div className="mb-4 hidden lg:block">
        <LiveClock />
      </div>

      <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map(({ href, icon: Icon, label, sub, color }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="min-w-[170px] rounded-2xl border px-3 py-3 transition-all hover:-translate-y-px lg:min-w-0"
              style={{
                borderColor: active ? `${color}45` : "var(--color-border)",
                background: active ? `${color}22` : "rgba(30, 30, 30, 0.82)",
                boxShadow: active ? `inset 2px 0 0 ${color}, 0 12px 26px -20px rgba(0, 0, 0, 0.9)` : "0 10px 20px -18px rgba(0, 0, 0, 0.9)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl border"
                  style={{
                    borderColor: active ? `${color}55` : "var(--color-border)",
                    background: active ? `${color}2a` : "var(--color-surface2)",
                  }}
                >
                  <Icon size={14} style={{ color: active ? color : "var(--color-muted)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--color-text2)" }}>
                    {label}
                  </div>
                  <div
                    className="truncate font-mono text-[9px] tracking-[0.14em]"
                    style={{ color: active ? color : "var(--color-muted)" }}
                  >
                    {sub}
                  </div>
                </div>
                {active ? <ChevronRight size={14} style={{ color }} /> : null}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        <div className="rounded-2xl border px-4 py-3 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
          <div className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            F&O DESK
          </div>
          <div className="mt-1 text-sm font-semibold" style={{ color: "var(--color-text2)" }}>
            Intraday signal terminal
          </div>
        </div>
      </div>
    </aside>
  );
}