import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle: string;
  badge: string;
  dateStr: string;
  accentColor: string;
  children?: ReactNode;
};

export default function PageHeader({
  title,
  subtitle,
  badge,
  dateStr,
  accentColor,
  children,
}: PageHeaderProps) {
  return (
    <header
      className="relative overflow-hidden border-b px-5 py-6 lg:px-8"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-full"
        style={{
          background: `radial-gradient(circle at 8% center, ${accentColor}16 0%, transparent 45%)`,
        }}
      />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div
            /* Resolved: Kept the shadow-sm and 0.13em tracking for the badge */
            className="mb-3 inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.13em] shadow-sm"
            style={{
              color: accentColor,
              borderColor: `${accentColor}55`,
              background: `${accentColor}10`,
            }}
          >
            {badge}
          </div>
          {/* Resolved: Retained the tighter letterSpacing (-0.02em) for a more modern heading look */}
          <h1 className="text-2xl font-semibold lg:text-3xl" style={{ color: "var(--color-text2)", letterSpacing: "-0.02em" }}>
            {title}
          </h1>
          <p
            className="mt-1 font-mono text-[10px] tracking-[0.16em]"
            style={{ color: "var(--color-muted)" }}
          >
            {subtitle}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="text-left lg:text-right">
            <div className="font-mono text-[9px] tracking-[0.16em]" style={{ color: "var(--color-muted)" }}>
              DATA DATE
            </div>
            <div className="font-mono text-sm font-semibold" style={{ color: "var(--color-text2)" }}>
              {dateStr}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        </div>
      </div>
    </header>
  );
}