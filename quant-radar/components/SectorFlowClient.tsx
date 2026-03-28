import { ExternalLink } from "lucide-react";
import type { SectorData } from "@/utils/backend";

function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "var(--color-border)" }}>
      <div className="font-mono text-[9px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export default function SectorFlowClient({ sectors }: { sectors: SectorData[] }) {
  if (!sectors.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-3xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            SECTOR FLOW
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No sector signals available for this date.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-5 lg:px-8">
      <div className="grid gap-5 xl:grid-cols-2">
        {sectors.map((sector) => {
          const accent = sector.isBullish ? "var(--color-bull)" : "var(--color-bear)";
          return (
            <article
              key={sector.key}
              className="rounded-3xl border p-5"
              style={{ borderColor: `${accent}40`, background: "var(--color-surface)" }}
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-semibold" style={{ color: "var(--color-text2)" }}>
                    {sector.label}
                  </h3>
                  <p className="mt-1 font-mono text-[10px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
                    {sector.symbols.slice(0, 6).join("  ")}
                  </p>
                </div>
                <span
                  className="rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.2em]"
                  style={{ color: accent, borderColor: `${accent}55`, background: `${accent}15` }}
                >
                  {sector.isBullish ? "BULLISH" : "BEARISH"}
                </span>
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Signals" value={String(sector.totalSignals)} color="var(--color-text2)" />
                <Stat label="Bull count" value={String(sector.bullCount)} color="var(--color-bull)" />
                <Stat label="Bear count" value={String(sector.bearCount)} color="var(--color-bear)" />
                <Stat label="Avg move" value={formatPct(sector.avgMove)} color="var(--color-gold)" />
              </div>

              <div className="space-y-3">
                {sector.signals.slice(0, 5).map((signal) => (
                  <div
                    key={`${sector.key}-${signal.sym}-${signal.time}`}
                    className="flex flex-col gap-3 rounded-2xl border px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
                    style={{ borderColor: "var(--color-border)", background: "rgba(30, 30, 30, 0.7)" }}
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--color-text2)" }}>
                        {signal.name}
                      </div>
                      <div className="mt-1 font-mono text-[10px] tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>
                        {signal.sym} {signal.module} {signal.time}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className="rounded-full border px-2 py-1 font-mono text-[10px] tracking-[0.18em]"
                        style={{
                          color: signal.side === "BULL" ? "var(--color-bull)" : "var(--color-bear)",
                          borderColor:
                            signal.side === "BULL" ? "var(--color-bullborder)" : "var(--color-bearborder)",
                          background:
                            signal.side === "BULL" ? "var(--color-bullbg)" : "var(--color-bearbg)",
                        }}
                      >
                        {signal.side}
                      </span>
                      <span className="font-mono text-xs" style={{ color: "var(--color-gold)" }}>
                        {signal.conf.toFixed(1)}
                      </span>
                      <a
                        href={signal.chart}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] tracking-[0.16em]"
                        style={{
                          color: "var(--color-accent)",
                          borderColor: "var(--color-bullborder)",
                          background: "var(--color-accentbg)",
                        }}
                      >
                        TV <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
