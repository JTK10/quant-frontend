"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart2, Brain, ChevronRight, Zap, TrendingUp, Crosshair, Target } from "lucide-react";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/sniper-signal", icon: Crosshair, label: "Sniper Signal", sub: "Precision Setup", color: "#ff3b3b" },
  { href: "/rvol-pulse", icon: TrendingUp, label: "Intraday Pulse", sub: "Momentum Movers", color: "#14b8a6" },
  { href: "/sector", icon: BarChart2, label: "Sector Flow", sub: "Market Rotation", color: "#f59e0b" },
  { href: "/ai", icon: Brain, label: "AI Analysis", sub: "ML Top Picks", color: "#a855f7" },
  { href: "/capitulation-signal", icon: Activity, label: "Intraday Reversal", sub: "Early Entry", color: "#ff3b3b" },
  
  // -- Temporarily Hidden Pages --
  // { href: "/", icon: Activity, label: "Smart Radar", sub: "Final Signals", color: "#2d8eff" },
  // { href: "/pulse", icon: Zap, label: "Signal Pulse", sub: "Flow Watchlist", color: "#00e89a" },
  // { href: "/master-list", icon: Target, label: "Master List", sub: "Top Sector Picks", color: "#eab308" },
  // { href: "/ob-signal", icon: Target, label: "OB Radar", sub: "Order Block Sniper", color: "#eab308" },
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
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface2)" }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[8px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          IST
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
          {marketOpen ? "MKT OPEN" : "CLOSED"}
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
      className="w-full border-b px-3 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:border-b-0 lg:border-r lg:px-3 lg:py-4"
      style={{
        background: "var(--color-bg)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-3 lg:block">
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "rgba(45, 142, 255, 0.10)",
              border: "1px solid rgba(45, 142, 255, 0.20)",
            }}
          >
            <Activity size={14} style={{ color: "#2d8eff" }} />
          </div>
          <div>
            <div
              className="text-xs font-bold tracking-[0.12em]"
              style={{ color: "var(--color-text2)" }}
            >
              JT RADAR
            </div>
            <div className="font-mono text-[8px] tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>
              PROP TERMINAL
            </div>
          </div>
        </Link>
      </div>

      <div className="mb-3 hidden lg:block">
        <LiveClock />
      </div>

      <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map(({ href, icon: Icon, label, sub, color }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="min-w-[140px] rounded-lg border px-2.5 py-2 transition-colors lg:min-w-0"
              style={{
                borderColor: active ? `${color}30` : "var(--color-border)",
                background: active ? `${color}0c` : "transparent",
                boxShadow: active ? `inset 2px 0 0 ${color}` : "none",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    borderColor: active ? `${color}40` : "var(--color-border)",
                    background: active ? `${color}14` : "var(--color-surface)",
                  }}
                >
                  <Icon size={13} style={{ color: active ? color : "var(--color-muted)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold" style={{ color: "var(--color-text2)" }}>
                    {label}
                  </div>
                  <div
                    className="truncate font-mono text-[8px] tracking-[0.16em]"
                    style={{ color: active ? color : "var(--color-muted)" }}
                  >
                    {sub}
                  </div>
                </div>
                {active ? <ChevronRight size={12} style={{ color }} /> : null}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 hidden lg:block">
        <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
          <div className="font-mono text-[8px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            NSE F&O
          </div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--color-text2)" }}>
            Intraday Terminal
          </div>
        </div>
      </div>
    </aside>
  );
}
