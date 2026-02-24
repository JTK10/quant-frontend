'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, LineChart, PieChart, Cpu, LayoutGrid } from 'lucide-react';

const NAV_GROUPS = [
  {
    label: 'LIVE INTELLIGENCE',
    items: [
      { href: '/',         icon: Activity,    label: 'Smart Radar' },
      { href: '/velocity', icon: BarChart3,   label: 'Market Velocity' },
      { href: '/sector',   icon: LayoutGrid,  label: 'Sector View' },
    ],
  },
  {
    label: 'STRATEGY & AI',
    items: [
      { href: '/swing',     icon: LineChart,  label: 'Swing Engine' },
      { href: '/analytics', icon: PieChart,   label: 'Analytics' },
      { href: '/ai-signals',icon: Cpu,        label: 'AI Signals' },
    ],
  },
];

export default function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 shrink-0 h-screen sticky top-0 flex flex-col border-r"
      style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
    >
      {/* ── Logo → HOME (FIX #5) ──────────────────── */}
      <Link
        href="/"
        className="group flex flex-col gap-0.5 px-5 pt-6 pb-5 border-b select-none"
        style={{ borderColor: 'var(--color-brand-border)' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Radar icon */}
          <div className="relative w-7 h-7 flex items-center justify-center shrink-0">
            <div className="absolute inset-0 rounded-full border-2 opacity-20 group-hover:opacity-40 transition-opacity"
              style={{ borderColor: 'var(--color-brand-accent)' }} />
            <div className="absolute inset-1 rounded-full border opacity-40"
              style={{ borderColor: 'var(--color-brand-accent)' }} />
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-brand-accent)' }} />
            {/* Sweep line */}
            <div className="absolute inset-0 rounded-full border-r-2 rotate-[40deg] opacity-60"
              style={{ borderColor: 'var(--color-brand-accent)' }} />
          </div>
          <div>
            <div className="text-white font-bold tracking-[0.18em] text-[13px] leading-none">QUANT</div>
            <div className="font-bold tracking-[0.3em] text-[10px] leading-none mt-0.5"
              style={{ color: 'var(--color-brand-accent)' }}>RADAR</div>
          </div>
        </div>
        <div className="font-mono text-[9px] tracking-widest mt-2"
          style={{ color: 'var(--color-brand-muted)' }}>
          Institutional Intelligence
        </div>
      </Link>

      {/* ── Navigation ────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="font-mono text-[9px] tracking-[0.22em] px-2 mb-2"
              style={{ color: 'var(--color-brand-muted)' }}>
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map(({ href, icon: Icon, label }) => {
                const isActive = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium tracking-wide transition-all duration-150 relative"
                      style={isActive ? {
                        background: 'var(--color-brand-accentbg)',
                        color: 'var(--color-brand-accent)',
                        boxShadow: 'inset 2px 0 0 var(--color-brand-accent)',
                      } : {
                        color: 'var(--color-brand-muted)',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--color-brand-text)'; }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--color-brand-muted)'; }}
                    >
                      <Icon size={14} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Footer live indicator ─────────────────── */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--color-brand-border)' }}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: 'var(--color-brand-bull)' }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5"
              style={{ background: 'var(--color-brand-bull)' }} />
          </span>
          <span className="font-mono text-[9px] tracking-[0.2em]"
            style={{ color: 'var(--color-brand-muted)' }}>LIVE · NSE · F&O</span>
        </div>
        <div className="font-mono text-[9px] tracking-widest mt-2"
          style={{ color: 'var(--color-brand-muted)', opacity: 0.5 }}>
          PRO SUBSCRIBER
        </div>
      </div>
    </aside>
  );
}
