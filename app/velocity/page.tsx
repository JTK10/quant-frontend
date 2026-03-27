import Link from "next/link";
import AutoRefresh from "../components/AutoRefresh";
import DatePicker from "../components/DatePicker";
import { resolveDate, type DateSearchParams } from "../utils/date";
import { getInternalApiUrl } from "../utils/internalApi";
import { toText } from "../utils/scanner";
import { getTradingViewUrl } from "../utils/tradingview";

export const dynamic = "force-dynamic";

type WatchlistItem = {
  SK: string;
  Direction: "LONG" | "SHORT";
  StoredAt: string;
};

function normalizeWatchlist(raw: unknown): WatchlistItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : {}))
    .map((row) => {
      const directionRaw = toText(row.Direction).toUpperCase();
      const direction: WatchlistItem["Direction"] = directionRaw === "SHORT" ? "SHORT" : "LONG";

      return {
        SK: toText(row.SK) || "UNKNOWN",
        Direction: direction,
        StoredAt: toText(row.StoredAt),
      };
    })
    .filter((row) => row.SK && row.StoredAt);
}

async function getInstitutionalWatchlist(dateStr: string): Promise<WatchlistItem[]> {
  try {
    const url = await getInternalApiUrl(`/api/institutional-watchlist?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const raw = await res.json();
    return normalizeWatchlist(raw);
  } catch {
    return [];
  }
}

function formatDetectedAt(dateTime: string): string {
  const parsed = new Date(dateTime);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(parsed);
}

export default async function VelocityPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const watchlist = await getInstitutionalWatchlist(dateStr);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: "var(--color-brand-accent)" }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Signal Pulse</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: "var(--color-brand-muted)" }}>
            INSTITUTIONAL MOMENTUM WATCHLIST
            <span className="ml-2" style={{ color: "var(--color-brand-accent)" }}>{dateStr}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={30000} />
        </div>
      </div>

      <section
        className="rounded-xl border mb-6 overflow-hidden"
        style={{ background: "var(--color-brand-surface)", borderColor: "var(--color-brand-border)" }}
      >
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--color-brand-border)" }}>
          <h2 className="text-lg font-semibold text-white tracking-wide">⚡ Institutional Smart Money Watchlist</h2>
          <p className="font-mono text-[10px] tracking-widest mt-1" style={{ color: "var(--color-brand-muted)" }}>
            PRE-POSITIONED CANDIDATES
          </p>
        </div>

        {watchlist.length > 0 ? (
          <div className="overflow-x-auto">
            <div
              className="grid gap-2 px-5 py-2 border-b font-mono text-[9px] tracking-[0.18em] min-w-[640px]"
              style={{
                gridTemplateColumns: "5rem minmax(10rem,1fr) 8rem 10rem",
                borderColor: "var(--color-brand-border)",
                background: "rgba(255,255,255,0.05)",
                color: "var(--color-brand-muted)",
              }}
            >
              <span>TRADINGVIEW</span>
              <span>STOCK SYMBOL</span>
              <span>DIRECTION</span>
              <span>TIME DETECTED</span>
            </div>

            <div className="divide-y" style={{ borderColor: "rgba(47,71,108,0.35)" }}>
              {watchlist.map((item, index) => {
                const isLong = item.Direction === "LONG";
                const chartUrl = getTradingViewUrl(item.SK);

                return (
                  <div
                    key={`${item.SK}-${item.StoredAt}-${index}`}
                    className="grid gap-2 px-5 py-3 items-center min-w-[640px] hover:bg-white/5 transition-colors"
                    style={{ gridTemplateColumns: "5rem minmax(10rem,1fr) 8rem 10rem" }}
                  >
                    <div>
                      <Link
                        href={chartUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 font-mono text-[9px] tracking-wider transition-colors hover:opacity-90"
                        style={{
                          color: "var(--color-brand-accent)",
                          borderColor: "rgba(60,130,246,0.28)",
                          background: "rgba(60,130,246,0.08)",
                        }}
                      >
                        TV
                      </Link>
                    </div>

                    <span className="font-semibold text-[13px] tracking-wide" style={{ color: "var(--color-brand-text)" }}>
                      {item.SK}
                    </span>

                    <span
                      className="inline-flex w-fit font-mono text-[10px] tracking-widest px-2 py-0.5 rounded"
                      style={{
                        color: isLong ? "var(--color-brand-bull)" : "var(--color-brand-bear)",
                        background: isLong ? "rgba(5,217,143,0.14)" : "rgba(230,85,115,0.14)",
                      }}
                    >
                      {item.Direction}
                    </span>

                    <span className="font-mono text-[11px]" style={{ color: "var(--color-brand-muted)" }}>
                      {formatDetectedAt(item.StoredAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="px-5 py-8 text-center font-mono text-xs" style={{ color: "var(--color-brand-muted)" }}>
            Scanning market for institutional momentum... Data populates between 09:20 - 09:40 AM IST.
          </div>
        )}
      </section>
    </div>
  );
}
