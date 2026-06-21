'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Zap, BarChart2, Brain, ChevronRight, Crosshair, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  {
    href: '/panther',
    icon: Activity,
    label: 'Panther Signals',
    sub: 'Live K-Engine',
    color: '#ff0055',
    rgb: '255,0,85',
  },
  {
    href: '/',
    icon: Activity,
    label: 'Smart Radar',
    sub: 'Final Signals',
    color: '#00f0ff',
    rgb: '0,240,255',
  },
  {
    href: '/sector',
    icon: BarChart2,
    label: 'Sector Flow',
    sub: 'Market Pressure',
    color: '#fce205',
    rgb: '252,226,5',
  },
  {
    href: '/v6-signals',
    icon: Zap,
    label: 'V6 Momentum',
    sub: 'PREMIUM ALERTS',
    color: '#00ff9d',
    rgb: '0,255,157',
  },
  {
    href: '/sniper-signal',
    icon: Crosshair,
    label: 'Sniper Signal',
    sub: 'BID/ASK SPREAD',
    color: '#ff00e6',
    rgb: '255,0,230',
  },
  {
    href: '/flow-radar',
    icon: Layers,
    label: 'Flow Radar',
    sub: 'OI & SMARTLIST',
    color: '#bd00ff',
    rgb: '189,0,255',
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
        background: 'linear-gradient(180deg, #11131a 0%, #080a0f 100%)',
        borderRight: '1px solid rgba(0, 240, 255, 0.1)',
        boxShadow: '4px 0 20px rgba(0, 0, 0, 0.5)',
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
          {NAV_ITEMS.map(({ href, icon: Icon, label, sub, color, rgb }) => {
            const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
            return (
              <li key={href} className="mb-1">
                <Link
                  href={href}
                  className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg transition-all duration-300 group relative overflow-hidden"
                  style={
                    isActive
                      ? {
                          background: `rgba(${rgb}, 0.1)`,
                          boxShadow: `0 0 15px rgba(${rgb}, 0.2), inset 2px 0 0 ${color}`,
                          border: `1px solid rgba(${rgb}, 0.2)`,
                        }
                      : {
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid transparent',
                        }
                  }
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-all duration-300"
                    style={{
                      background: isActive
                        ? `rgba(${rgb}, 0.2)`
                        : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: isActive ? `0 0 12px rgba(${rgb}, 0.6)` : 'none',
                    }}
                  >
                    <Icon size={13} style={{ color: isActive ? '#fff' : 'var(--color-muted)', filter: isActive ? `drop-shadow(0 0 4px #fff)` : 'none' }} />
                  </div>
                  <div className="min-w-0">
                    <div
                      className="text-[12px] font-semibold leading-none truncate transition-all duration-300"
                      style={{ 
                        color: isActive ? '#ffffff' : 'var(--color-muted2)',
                        textShadow: isActive ? `0 0 8px rgba(255,255,255,0.5)` : 'none'
                      }}
                    >
                      {label}
                    </div>
                    <div
                      className="font-mono text-[9px] mt-1 truncate transition-all duration-300"
                      style={{ 
                        color: isActive ? color : 'var(--color-muted)',
                        textShadow: isActive ? `0 0 8px ${color}` : 'none'
                      }}
                    >
                      {sub}
                    </div>
                  </div>
                  {isActive && (
                    <ChevronRight size={12} className="ml-auto shrink-0 animate-pulse" style={{ color: '#fff', filter: `drop-shadow(0 0 5px #fff)` }} />
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
