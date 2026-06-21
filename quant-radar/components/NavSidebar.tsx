"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart2, Brain, ChevronRight, Zap, TrendingUp, Crosshair, Target, Layers, Cat } from "lucide-react";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/panther-signals", icon: Cat, label: "Panther Signals", sub: "Live K-Engine", color: "#ff0055", rgb: "255,0,85" },
  { href: "/flow-radar", icon: Layers, label: "Flow Radar", sub: "OI Scanner", color: "#bd00ff", rgb: "189,0,255" },
  { href: "/flow-smartlist", icon: Target, label: "Flow Smartlist", sub: "Upstox Buckets", color: "#eab308", rgb: "234,179,8" },
  { href: "/", icon: Activity, label: "Smart Radar", sub: "Final Signals", color: "#00f0ff", rgb: "0,240,255" },
  { href: "/sniper-signal", icon: Crosshair, label: "Sniper Signal", sub: "Precision Setup", color: "#ff00e6", rgb: "255,0,230" },
  { href: "/v6-signals", icon: Zap, label: "V6 Momentum", sub: "Premium Alerts", color: "#00ff9d", rgb: "0,255,157" },
  { href: "/rvol-pulse", icon: TrendingUp, label: "Intraday Pulse", sub: "Momentum Movers", color: "#14b8a6", rgb: "20,184,166" },
  { href: "/sector", icon: BarChart2, label: "Sector Flow", sub: "Market Rotation", color: "#fce205", rgb: "252,226,5" },
];
  
  // -- Temporarily Hidden Pages --
  // { href: "/ai", icon: Brain, label: "AI Analysis", sub: "ML Top Picks", color: "#a855f7" },
  // { href: "/pulse", icon: Zap, label: "Signal Pulse", sub: "Flow Watchlist", color: "#00e89a" },
  // { href: "/master-list", icon: Target, label: "Master List", sub: "Top Sector Picks", color: "#eab308" },
  // { href: "/ob-signal", icon: Target, label: "OB Radar", sub: "Order Block Sniper", color: "#eab308" },

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
        background: "linear-gradient(180deg, #11131a 0%, #080a0f 100%)",
        borderRight: "1px solid rgba(0, 240, 255, 0.1)",
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 lg:block px-2 mt-2">
        <Link href="/" className="flex items-center gap-3.5 group">
          
          {/* Bull/Bear Separated JT Logo */}
          <div className="relative flex h-11 w-11 items-center justify-center transition-transform duration-500 group-hover:scale-105">
            {/* Background ambient glow */}
            <div className="absolute inset-0 rounded-full bg-[rgba(255,255,255,0.02)] blur-md group-hover:bg-[rgba(255,255,255,0.05)] transition-colors duration-500"></div>
            
            <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" className="relative z-10 overflow-visible">
              {/* Subtle Horizontal Chart Grid */}
              <path d="M1 5h22 M1 10h22 M1 15h22 M1 20h22" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" strokeDasharray="1 2" />

              {/* J - Bullish Green Arrow */}
              <g stroke="#00e89a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(0,232,154,0.6))" }}>
                <path d="M 4 13 A 3 3 0 0 1 10 13 L 10 5" className="transition-all duration-300" />
                <path d="M 7 8 L 10 5 L 13 8" className="transition-all duration-300" />
                <circle cx="4" cy="13" r="1.5" fill="#00e89a" stroke="none" />
              </g>

              {/* T - Bearish Red Arrow */}
              <g stroke="#ff3b6b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,59,107,0.6))" }}>
                <path d="M 14 5 L 22 5 M 18 5 L 18 18" className="transition-all duration-300" />
                <path d="M 15 15 L 18 18 L 21 15" className="transition-all duration-300" />
                <circle cx="14" cy="5" r="1.5" fill="#ff3b6b" stroke="none" />
                <circle cx="22" cy="5" r="1.5" fill="#ff3b6b" stroke="none" />
              </g>
            </svg>
          </div>

          <div>
            <div
              className="text-[14px] font-black tracking-[0.18em] transition-colors duration-300"
              style={{ color: "#ffffff", textShadow: "0 0 10px rgba(255,255,255,0.2)" }}
            >
              <span className="text-[#00f0ff] group-hover:text-[#00e89a] transition-colors duration-500">JT</span> RADAR
            </div>
            <div className="font-mono text-[8.5px] font-semibold tracking-[0.22em] mt-1" style={{ color: "var(--color-muted)" }}>
              PROP TERMINAL
            </div>
          </div>
        </Link>
      </div>

      <div className="mb-3 hidden lg:block">
        <LiveClock />
      </div>

      <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map(({ href, icon: Icon, customIcon, label, sub, color, rgb }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="min-w-[140px] rounded-lg border px-2.5 py-2 transition-all duration-300 lg:min-w-0 mb-1"
              style={{
                borderColor: active ? `rgba(${rgb}, 0.2)` : "transparent",
                background: active ? `rgba(${rgb}, 0.1)` : "rgba(255, 255, 255, 0.02)",
                boxShadow: active ? `0 0 15px rgba(${rgb}, 0.2), inset 2px 0 0 ${color}` : "none",
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300"
                  style={{
                    borderColor: active ? color : "rgba(255,255,255,0.05)",
                    background: active ? `rgba(${rgb}, 0.2)` : "rgba(255,255,255,0.03)",
                    boxShadow: active ? `0 0 12px rgba(${rgb}, 0.6)` : "none",
                  }}
                >
                  {customIcon ? (
                    <img src={customIcon} alt={label} className="w-[22px] h-[22px] rounded-md object-cover" style={{ filter: active ? `drop-shadow(0 0 6px ${color}) brightness(1.2)` : "grayscale(40%) opacity(0.8)", transition: "all 0.3s ease" }} />
                  ) : (
                    <Icon size={13} style={{ color: active ? "#fff" : "var(--color-muted)", filter: active ? "drop-shadow(0 0 4px #fff)" : "none" }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold transition-all duration-300" style={{ 
                    color: active ? "#ffffff" : "var(--color-muted2)",
                    textShadow: active ? "0 0 8px rgba(255,255,255,0.5)" : "none"
                  }}>
                    {label}
                  </div>
                  <div
                    className="truncate font-mono text-[8px] tracking-[0.16em] transition-all duration-300"
                    style={{ 
                      color: active ? color : "var(--color-muted)",
                      textShadow: active ? `0 0 8px ${color}` : "none"
                    }}
                  >
                    {sub}
                  </div>
                </div>
                {active ? <ChevronRight size={12} className="animate-pulse" style={{ color: "#fff", filter: "drop-shadow(0 0 5px #fff)" }} /> : null}
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
