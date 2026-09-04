"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart2, Brain, ChevronRight, Zap, TrendingUp, Crosshair, Target, Layers, Cat, Bot, Crown } from "lucide-react";
import { useEffect, useState } from "react";

const PantherIcon = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M 4 10 L 2 3 L 8 5" /> {/* Left ear */}
    <path d="M 20 10 L 22 3 L 16 5" /> {/* Right ear */}
    <path d="M 8 5 C 10 4, 14 4, 16 5" /> {/* Top head */}
    <path d="M 4 10 C 3 15, 6 20, 10 21 L 12 22 L 14 21 C 18 20, 21 15, 20 10" /> {/* Jaw */}
    <path d="M 6 9 L 9 10" /> {/* Left eyebrow */}
    <path d="M 18 9 L 15 10" /> {/* Right eyebrow */}
    <path d="M 10 14 L 14 14 L 12 17 Z" /> {/* Nose */}
    <path d="M 12 17 L 12 19" /> {/* Mouth */}
    <path d="M 2 13 L 5 14" /> {/* Left whisker 1 */}
    <path d="M 2 16 L 6 15" /> {/* Left whisker 2 */}
    <path d="M 22 13 L 19 14" /> {/* Right whisker 1 */}
    <path d="M 22 16 L 18 15" /> {/* Right whisker 2 */}
  </svg>
);

const ElephantIcon = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Ears */}
    <path d="M 7 10 C 2 10, 2 17, 6 17 L 7 17" />
    <path d="M 17 10 C 22 10, 22 17, 18 17 L 17 17" />
    {/* Head */}
    <path d="M 7 10 C 7 4, 17 4, 17 10 L 17 12 C 17 14, 15 15, 15 15" />
    <path d="M 7 10 L 7 12 C 7 14, 9 15, 9 15" />
    {/* Trunk */}
    <path d="M 10 12 L 10 21 C 10 23, 14 23, 14 21 L 14 12" />
    {/* Tusks */}
    <path d="M 9 15 L 7 19" />
    <path d="M 15 15 L 17 19" />
  </svg>
);

const CaracalIcon = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Tall tufted ears — the caracal's signature */}
    <path d="M 6 9 L 5 2 L 9 6" />   {/* Left ear */}
    <path d="M 5 2 L 4.5 1" />        {/* Left tuft */}
    <path d="M 18 9 L 19 2 L 15 6" /> {/* Right ear */}
    <path d="M 19 2 L 19.5 1" />      {/* Right tuft */}
    <path d="M 9 6 C 10.5 5, 13.5 5, 15 6" /> {/* Top head */}
    <path d="M 6 9 C 5 14, 8 19, 12 21 C 16 19, 19 14, 18 9" /> {/* Face outline */}
    <path d="M 8.5 11 L 10.5 11.5" /> {/* Left eye */}
    <path d="M 15.5 11 L 13.5 11.5" /> {/* Right eye */}
    <path d="M 10.5 15 L 13.5 15 L 12 17 Z" /> {/* Nose */}
    <path d="M 12 17 L 12 18.5" />    {/* Mouth */}
  </svg>
);

const LynxIcon = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Ear tufts — shorter and set wider than the caracal's, which are the
        tallest of any cat and already carry that silhouette on this nav */}
    <path d="M 7 8.5 L 5.5 2.5 L 10 6" />
    <path d="M 5.5 2.5 L 5 1.2" />
    <path d="M 17 8.5 L 18.5 2.5 L 14 6" />
    <path d="M 18.5 2.5 L 19 1.2" />
    <path d="M 10 6 C 11 5.4, 13 5.4, 14 6" /> {/* Crown */}
    {/* Broad face tapering to a narrow chin */}
    <path d="M 7 8.5 C 6.6 11.5, 8 14.5, 12 16.8 C 16 14.5, 17.4 11.5, 17 8.5" />
    {/* The flared cheek ruff — the lynx's real signature, and what separates
        this glyph from the caracal at 24px */}
    <path d="M 6.8 10.5 L 3.6 12.6 L 6.2 13.6 L 4.4 16.2" />
    <path d="M 17.2 10.5 L 20.4 12.6 L 17.8 13.6 L 19.6 16.2" />
    <path d="M 9.4 10.6 L 10.9 11" />   {/* Left eye */}
    <path d="M 14.6 10.6 L 13.1 11" />  {/* Right eye */}
    <path d="M 10.9 13 L 13.1 13 L 12 14.4 Z" /> {/* Nose */}
    <path d="M 12 14.4 L 12 15.8" />    {/* Mouth */}
  </svg>
);

const MargayIcon = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {/* Short rounded ears -- unlike the caracal/lynx tufts, a margay's are
        low and unremarkable. Its own signature is next: */}
    <path d="M 6 8 C 5 5.5, 7 4, 8.5 5.5" />
    <path d="M 18 8 C 19 5.5, 17 4, 15.5 5.5" />
    <path d="M 8.5 5.5 C 10 4.6, 14 4.6, 15.5 5.5" /> {/* Crown */}
    <path d="M 6 8 C 5.3 12, 7.5 16.5, 12 18.5 C 16.5 16.5, 18.7 12, 18 8" /> {/* Face outline */}
    {/* Oversized eyes -- a margay's largest relative to any wild cat, the
        adaptation for a fully nocturnal, tree-climbing hunt */}
    <circle cx="9" cy="11" r="2" />
    <circle cx="15" cy="11" r="2" />
    <path d="M 10.5 15.5 L 13.5 15.5 L 12 17.5 Z" /> {/* Nose */}
    <path d="M 12 17.5 L 12 19" />                    {/* Mouth */}
  </svg>
);

// -- Retired 2026-08-05: RFAC and Smart List. Between them the v2dyn and
// smartlist snapshot sources were 67% of the PANTHER payload every page had to
// download (ORDS ignores ?source, so every page pays for every source). The
// 'rfac' source was already orphaned -- the /rfac page read v2dyn, not rfac.
// Publishers rfac-scanner / smartlist / v2dyn disabled on the VM the same day. --
const NAV_ITEMS: any[] = [
  { href: "/lynx", icon: LynxIcon, label: "Lynx", color: "#a78bfa", rgb: "167,139,250" },
  { href: "/caracal", icon: CaracalIcon, label: "Caracal", color: "#f59e0b", rgb: "245,158,11" },
  { href: "/afac", icon: Target, label: "AFAC", color: "#fce205", rgb: "252,226,5" },
  { href: "/sector", icon: BarChart2, label: "Sector Scope", color: "#fce205", rgb: "252,226,5" },
  { href: "/serval", icon: Cat, label: "Serval", color: "#ec4899", rgb: "236,72,153" },
  { href: "/kairos", icon: Bot, label: "Kairos", color: "#22d3ee", rgb: "34,211,238" },
  { href: "/ocelot", icon: Activity, label: "Ocelot", color: "#f97316", rgb: "249,115,22" },
  { href: "/margay", icon: MargayIcon, label: "Margay", color: "#a855f7", rgb: "168,85,247" },
// -- Removed 2026-08-23: TradingView embeds cannot show NSE symbols. Indian
// exchange symbols are blocked in widgets by the NSE Data Sharing & Usage
// Policy, so every pane rendered "this symbol is only available on
// TradingView". The tickers were correct -- the embed is what is disallowed.
// Click-through links to tradingview.com still work and are used elsewhere.
// Restore this when the panes render our own bars instead. --
// { href: "/charts", icon: BarChart2, label: "Charts", color: "#38bdf8", rgb: "56,189,248" },
  { href: "/strike", icon: Crown, label: "Strike", color: "#f59e0b", rgb: "245,158,11" },
];

// -- Hidden 2026-07: Panther-live and Elephant (panther-rank) engines retired on
// the VM; OOS shakeout signals now publish into the Caracal page instead. Restore
// these if either engine is ever brought back --
// { href: "/caps", icon: ElephantIcon, label: "Elephant Scan", color: "#8b5cf6", rgb: "139,92,246" },
// { href: "/panther-signals", icon: PantherIcon, label: "Panther Signals", color: "#ff0055", rgb: "255,0,85" },

// -- Hidden 2026-07: AWS Lambda backend retired; restore when rebuilt on Oracle --
// { href: "/flow-radar", icon: Layers, label: "Flow Radar", color: "#bd00ff", rgb: "189,0,255" },
// { href: "/flow-smartlist", icon: Target, label: "Flow Smartlist", color: "#eab308", rgb: "234,179,8" },
// { href: "/smart-radar", icon: Activity, label: "Smart Radar", color: "#00f0ff", rgb: "0,240,255" },
// { href: "/sniper-signal", icon: Crosshair, label: "Sniper Signal", color: "#ff00e6", rgb: "255,0,230" },
// { href: "/rvol-pulse", icon: TrendingUp, label: "Intraday Pulse", color: "#14b8a6", rgb: "20,184,166" },
// { href: "/sector", icon: BarChart2, label: "Sector Flow", color: "#fce205", rgb: "252,226,5" },
  
  // -- Temporarily Hidden Pages --
  // { href: "/ai", icon: Brain, label: "AI Analysis", color: "#a855f7" },
  // { href: "/pulse", icon: Zap, label: "Signal Pulse", color: "#00e89a" },
  // { href: "/master-list", icon: Target, label: "Master List", color: "#eab308" },
  // { href: "/ob-signal", icon: Target, label: "OB Radar", color: "#eab308" },

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
      className="w-full border-b px-3 py-3 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-56 lg:flex-col lg:border-b-0 lg:border-r lg:px-3 lg:py-4"
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

              {/* j - Bullish Green Lowercase with Arrow Dot */}
              <g stroke="#00e89a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(0,232,154,0.6))" }}>
                {/* j body */}
                <path d="M 3 16 L 3 18 A 2.5 2.5 0 0 0 8 18 L 8 9" className="transition-all duration-300 group-hover:stroke-white" />
                {/* Floating upward arrow replacing the dot */}
                <path d="M 5 6 L 8 3 L 11 6" className="transition-all duration-300 group-hover:stroke-white" />
              </g>

              {/* T - Bearish Red Arrow */}
              <g stroke="#ff3b6b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,59,107,0.6))" }}>
                <path d="M 12 5 L 20 5 M 16 5 L 16 18" className="transition-all duration-300 group-hover:stroke-white" />
                <path d="M 13 15 L 16 18 L 19 15" className="transition-all duration-300 group-hover:stroke-white" />
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
        {NAV_ITEMS.map(({ href, icon: Icon, customIcon, label, color, rgb }) => {
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
                </div>
                {active ? <ChevronRight size={12} className="animate-pulse" style={{ color: "#fff", filter: "drop-shadow(0 0 5px #fff)" }} /> : null}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto hidden lg:block">
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
