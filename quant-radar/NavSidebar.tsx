'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Zap, BarChart2, Brain, ChevronRight, Crosshair } from 'lucide-react';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  // {
  //   href: '/',
  //   icon: Activity,
  //   label: 'Smart Radar',
  //   sub: 'Final Signals',
  //   color: '#2d8eff',
  // },
  {
    href: '/pulse',
    icon: Zap,
    label: 'Signal Pulse',
    sub: 'PCR Watchlist',
    color: '#00e89a',
  },
  {
    href: '/sector',
    icon: BarChart2,
    label: 'Sector Flow',
    sub: 'Market Pressure',
    color: '#f5a623',
  },
  {
    href: '/ai',
    icon: Brain,
    label: 'AI Analysis',
    sub: 'ML Top Picks',
    color: '#9b6fff',
  },
  {
    href: '/sniper-signal',
    icon: Crosshair,
    label: 'Sniper Signal',
    sub: 'BID/ASK SPREAD',
    color: '#ff3b3b',
  },
];

function LiveClock() {
  const [time, setTime] = useState('');
  const [isMarketOpen, setIsMarketOpen] = useState(false);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const ist = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
      setTime(ist);

      const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const h = istDate.getHours(), m = istDate.getMinutes();
      const totalMins = h * 60 + m;
      setIsMarketOpen(totalMins >= 555 && totalMins < 930); // 9:15 - 15:30
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[9px] tracking-widest" style={{ color: 'var(--color-muted)' }}>
          IST TIME
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="relative flex h-1.5 w-1.5"
          >
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: isMarketOpen ? 'var(--color-bull)' : 'var(--color-bear)' }}
            />
            <span
              className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: isMarketOpen ? 'var(--color-bull)' : 'var(--color-bear)' }}
            />
          </span>
          <span
            className="font-mono text-[8px] tracking-widest"
            style={{ color: isMarketOpen ? 'var(--color-bull)' : 'var(--color-muted)' }}
          >
            {isMarketOpen ? 'MARKET OPEN' : 'CLOSED'}
          </span>
        </div>
      </div>
      <div
        className="font-mono text-sm font-semibold tracking-wider"
        style={{ color: 'var(--color-text2)' }}
      >
        {time || '--:--:--'}
      </div>
    </div>
  );
}

export default function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-52 shrink-0 h-screen sticky top-0 flex flex-col"
      style={{
        background: 'linear-gradient(180deg, #0a1018 0%, #070b12 100%)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <Link href="/" className="flex items-center gap-3 group">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
            style={{ background: 'linear-gradient(135deg, #1a3060 0%, #0d1e3d 100%)', border: '1px solid rgba(45,142,255,0.3)' }}
          >
            {/* Radar sweep visual */}
            <div
              className="absolute inset-0 rounded-lg opacity-40"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(45,142,255,0.4) 45deg, transparent 90deg)',
                animation: 'spin 3s linear infinite',
              }}
            />
            <Activity size={14} style={{ color: '#2d8eff', position: 'relative', zIndex: 1 }} />
          </div>
          <div>
            <div
              className="text-xs font-bold tracking-[0.2em] leading-none"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-text2)' }}
            >
              JT RADAR
            </div>
            <div
              className="font-mono text-[8px] tracking-[0.3em] mt-0.5"
              style={{ color: 'var(--color-accent)' }}
            >
              PRO TERMINAL
            </div>
          </div>
        </Link>
      </div>

      {/* Live Clock */}
      <LiveClock />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <div className="font-mono text-[8px] tracking-[0.25em] px-2 mb-2 mt-1" style={{ color: 'var(--color-muted)' }}>
          MODULES
        </div>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label, sub, color }) => {
            const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-150 group relative overflow-hidden"
                  style={
                    isActive
                      ? {
                          background: `rgba(${color === '#f5a623' ? '245,166,35' : color === '#00e89a' ? '0,232,154' : color === '#9b6fff' ? '155,111,255' : color === '#ff3b3b' ? '255,59,59' : '45,142,255'},0.12)`,
                          boxShadow: `inset 2px 0 0 ${color}`,
                        }
                      : {
                          background: 'transparent',
                        }
                  }
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: isActive
                        ? `rgba(${color === '#f5a623' ? '245,166,35' : color === '#00e89a' ? '0,232,154' : color === '#9b6fff' ? '155,111,255' : color === '#ff3b3b' ? '255,59,59' : '45,142,255'},0.15)`
                        : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? color + '40' : 'var(--color-border)'}`,
                    }}
                  >
                    <Icon size={13} style={{ color: isActive ? color : 'var(--color-muted)' }} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[12px] font-semibold leading-none truncate"
                      style={{ color: isActive ? 'var(--color-text2)' : 'var(--color-muted2)' }}
                    >
                      {label}
                    </div>
                    <div
                      className="font-mono text-[9px] mt-0.5 truncate"
                      style={{ color: isActive ? color : 'var(--color-muted)' }}
                    >
                      {sub}
                    </div>
                  </div>
                  {isActive && (
                    <ChevronRight size={12} className="ml-auto shrink-0" style={{ color }} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
        <div className="font-mono text-[8px] tracking-widest mb-1.5" style={{ color: 'var(--color-muted)' }}>
          NSE F&O · INTRADAY
        </div>
        <div
          className="text-[9px] font-mono"
          style={{ color: 'rgba(74,101,128,0.6)' }}
        >
          © JT Capital Research
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </aside>
  );
}
