import { ExternalLink } from "lucide-react";
import type { PulseData, PulseRow } from "@/utils/backend";

function formatPrice(value: number): string {
  return value ? `Rs. ${value.toFixed(2)}` : "-";
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
      <div className="font-mono text-[9px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="mt-1 font-mono text-xs font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function PulseCard({ row }: { row: PulseRow }) {
  const bullish = row.Side === "BULL";
  const accent = bullish ? "var(--color-bull)" : "var(--color-bear)";

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: bullish ? "var(--color-bullborder)" : "var(--color-bearborder)",
        background: "var(--color-surface)",
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold" style={{ color: "var(--color-text2)" }}>
            {row.Name}
          </div>
          <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            {row.Symbol || row.Module}
          </div>
        </div>
        <span
          className="rounded-full border px-2 py-1 font-mono text-[10px] tracking-[0.2em]"
          style={{ color: accent, borderColor: `${accent}55`, background: `${accent}15` }}
        >
          {row.Side}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Metric label="Price" value={formatPrice(row.Price)} color="var(--color-text2)" />
        <Metric label="Confidence" value={row.Confidence ? row.Confidence.toFixed(1) : "-"} color="var(--color-gold)" />
        <Metric label="RVOL" value={row.RVOL ? `${row.RVOL.toFixed(1)}x` : "-"} color="var(--color-text)" />
        <Metric label="Break" value={row.Break || "-"} color={accent} />
        <Metric label="PCR" value={row.PCR ? row.PCR.toFixed(2) : "-"} color="var(--color-text)" />
        <Metric label="Time" value={row.Time || "-"} color="var(--color-muted2)" />
      </div>

      <a
        href={row.Chart}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.18em]"
        style={{
          color: "var(--color-accent)",
          borderColor: "var(--color-bullborder)",
          background: "var(--color-accentbg)",
        }}
      >
        OPEN CHART <ExternalLink size={10} />
      </a>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div
      className="rounded-2xl border px-6 py-8 text-center"
      style={{ borderColor: "var(--color-border)", background: "rgba(30, 30, 30, 0.7)" }}
    >
      <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
        {title}
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
        No rows available for the selected date.
      </p>
    </div>
  );
}

export default function SignalPulseClient({ data }: { data: PulseData }) {
  return (
    <div className="h-full overflow-y-auto px-5 py-5 lg:px-8">
      <div className="mb-6 flex flex-wrap gap-2">
        {data.watchlist.length ? (
          data.watchlist.map((item) => (
            <span
              key={`${item.Symbol}-${item.StoredAt}`}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.18em]"
              style={{
                color: item.Direction === "LONG" ? "var(--color-bull)" : "var(--color-bear)",
                borderColor:
                  item.Direction === "LONG" ? "var(--color-bullborder)" : "var(--color-bearborder)",
                background:
                  item.Direction === "LONG" ? "var(--color-bullbg)" : "var(--color-bearbg)",
              }}
            >
              {item.Symbol} {item.Direction}
            </span>
          ))
        ) : (
          <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>
            Watchlist will appear once live signals arrive.
          </span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
              Bull momentum
            </h2>
            <span className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-bull)" }}>
              {data.bulls.length} ROWS
            </span>
          </div>
          {data.bulls.length ? data.bulls.map((row) => <PulseCard key={`${row.Symbol}-${row.Time}`} row={row} />) : <EmptyState title="BULL MOMENTUM" />}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
              Bear momentum
            </h2>
            <span className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-bear)" }}>
              {data.bears.length} ROWS
            </span>
          </div>
          {data.bears.length ? data.bears.map((row) => <PulseCard key={`${row.Symbol}-${row.Time}`} row={row} />) : <EmptyState title="BEAR MOMENTUM" />}
        </section>
      </div>
    </div>
  );
}
