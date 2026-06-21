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
      className="relative overflow-hidden border-b px-4 py-4 md:px-6 md:py-5"
      style={{
        borderColor: "var(--color-border)",
        background:
          "linear-gradient(180deg, var(--color-surface2), var(--color-surface))",
        boxShadow: "0 8px 24px -16px rgba(0,0,0,0.8)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-60"
        style={{
          background: `radial-gradient(circle at left center, ${accentColor}12 0%, transparent 70%)`,
        }}
      />

      <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] tracking-[0.14em]"
              style={{
                color: accentColor,
                borderColor: `${accentColor}35`,
                background: `${accentColor}0a`,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full animate-ping"
                style={{ background: accentColor }}
              />
              {badge}
            </div>
            <h1 className="text-lg font-semibold md:text-xl" style={{ color: "var(--color-text2)" }}>
              {title}
            </h1>
          </div>
          <p
            className="mt-1 font-mono text-[9px] tracking-[0.16em]"
            style={{ color: "var(--color-muted)" }}
          >
            {subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="font-mono text-[10px]" style={{ color: "var(--color-muted2)" }}>
            {dateStr}
          </div>
          {children}
        </div>
      </div>
    </header>
  );
}
