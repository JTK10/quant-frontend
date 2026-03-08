import Link from "next/link";
import AutoRefresh from "../components/AutoRefresh";
import DatePicker from "../components/DatePicker";
import { resolveDate, type DateSearchParams } from "../utils/date";
import { getInternalApiUrl } from "../utils/internalApi";

export const dynamic = "force-dynamic";

type VelocityStock = {
  Name: string;
  Price: number;
  OI: number;
  Break: string;
  Time: string;
  Chart: string;
  Side: "BULLISH" | "BEARISH";
};

type VelocityData = {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  bulls: VelocityStock[];
  bears: VelocityStock[];
  asOf: string | null;
};

const EMPTY_DATA: VelocityData = { bias: "NEUTRAL", bulls: [], bears: [], asOf: null };

function toNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%+,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStock(raw: unknown): VelocityStock {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sideRaw = toText(row.Side).toUpperCase();
  const side: VelocityStock["Side"] = sideRaw === "BEARISH" ? "BEARISH" : "BULLISH";
  return {
    Name: toText(row.Name) || toText(row.Symbol) || "UNKNOWN",
    Price: toNum(row.Price ?? row.SignalPrice ?? row.lastPrice ?? row.Close),
    OI: toNum(row.OI ?? row.OI_Change),
    Break: toText(row.Break ?? row.BreakType ?? row.Status),
    Time: toText(row.Time ?? row.Signal_Generated_At ?? row.SnapshotTime),
    Chart: toText(row.Chart),
    Side: side,
  };
}

function normalizeVelocityData(raw: unknown): VelocityData {
  const payload = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bulls = Array.isArray(payload.bulls) ? payload.bulls.map(normalizeStock) : [];
  const bears = Array.isArray(payload.bears) ? payload.bears.map(normalizeStock) : [];

  const biasRaw = toText(payload.bias).toUpperCase();
  const computedBias: VelocityData["bias"] =
    bulls.length + bears.length === 0
      ? "NEUTRAL"
      : bulls.length > bears.length
        ? "BULLISH"
        : "BEARISH";

  return {
    bias:
      biasRaw === "BULLISH" || biasRaw === "BEARISH" || biasRaw === "NEUTRAL"
        ? (biasRaw as VelocityData["bias"])
        : computedBias,
    bulls,
    bears,
    asOf: toText(payload.asOf) || null,
  };
}

async function getVelocityData(dateStr: string): Promise<VelocityData> {
  try {
    const url = await getInternalApiUrl(`/api/velocity?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return EMPTY_DATA;
    const raw = await res.json();
    return normalizeVelocityData(raw);
  } catch {
    return EMPTY_DATA;
  }
}

export default async function VelocityPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getVelocityData(dateStr);
  const scanRows = [...data.bulls, ...data.bears].sort((a, b) => Math.abs(b.OI) - Math.abs(a.OI));
  const bias = data.bias;
  const isBull = bias === "BULLISH";
  const isBear = bias === "BEARISH";
  const biasCol = isBull
    ? "var(--color-brand-bull)"
    : isBear
      ? "var(--color-brand-bear)"
      : "var(--color-brand-gold)";

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: "var(--color-brand-accent)" }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Market Velocity</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: "var(--color-brand-muted)" }}>
            MOMENTUM SCANNER
            <span className="ml-2" style={{ color: "var(--color-brand-accent)" }}>{dateStr}</span>
            {data.asOf && <span className="ml-2">AS OF {data.asOf}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={30000} />
        </div>
      </div>

      <div
        className="rounded-xl border px-6 py-5 mb-6 relative overflow-hidden"
        style={{
          background: `rgba(${isBull ? "5,217,143" : isBear ? "230,85,115" : "214,153,26"},0.08)`,
          borderColor: `rgba(${isBull ? "5,217,143" : isBear ? "230,85,115" : "214,153,26"},0.35)`,
        }}
      >
        <div
          className="absolute top-0 inset-x-0 h-px"
          style={{ background: `linear-gradient(90deg,transparent,${biasCol}80,transparent)` }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] tracking-[0.25em] mb-1" style={{ color: "var(--color-brand-muted)" }}>
              MARKET BIAS
            </div>
            <div className="text-4xl font-bold tracking-wider" style={{ color: biasCol }}>{bias}</div>
          </div>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: "var(--color-brand-muted)" }}>
                BULLS
              </div>
              <div className="text-3xl font-bold" style={{ color: "var(--color-brand-bull)" }}>{data.bulls.length}</div>
            </div>
            <div className="w-px h-10" style={{ background: "var(--color-brand-border)" }} />
            <div className="text-center">
              <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: "var(--color-brand-muted)" }}>
                BEARS
              </div>
              <div className="text-3xl font-bold" style={{ color: "var(--color-brand-bear)" }}>{data.bears.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--color-brand-surface)", borderColor: "var(--color-brand-border)" }}
      >
        <div
          className="grid gap-3 px-5 py-2.5 border-b font-mono text-[9px] tracking-widest"
          style={{
            gridTemplateColumns: "5.5rem minmax(11rem,2fr) 7rem 5.5rem 6.5rem 6rem 4.5rem",
            borderColor: "var(--color-brand-border)",
            background: "rgba(255,255,255,0.08)",
            color: "var(--color-brand-muted)",
          }}
        >
          <span>SIDE</span>
          <span>ASSET</span>
          <span>BREAK</span>
          <span>TIME</span>
          <span className="text-right">PRICE</span>
          <span className="text-right">OI</span>
          <span>CHART</span>
        </div>

        <div className="overflow-auto" style={{ maxHeight: "560px" }}>
          {scanRows.map((stock, i) => {
            const bull = stock.Side === "BULLISH";
            const sideColor = bull ? "var(--color-brand-bull)" : "var(--color-brand-bear)";
            const sideBg = bull ? "var(--color-brand-bullbg)" : "var(--color-brand-bearbg)";

            return (
              <div
                key={`${stock.Name}-${stock.Side}-${i}`}
                className="grid gap-3 px-5 py-2.5 border-b items-center hover:bg-white/5 transition-colors"
                style={{
                  gridTemplateColumns: "5.5rem minmax(11rem,2fr) 7rem 5.5rem 6.5rem 6rem 4.5rem",
                  borderColor: "rgba(47,71,108,0.4)",
                }}
              >
                <div>
                  <span
                    className="font-mono text-[10px] tracking-widest px-1.5 py-0.5 rounded"
                    style={{ color: sideColor, background: sideBg }}
                  >
                    {stock.Side === "BULLISH" ? "BULL" : "BEAR"}
                  </span>
                </div>

                <div className="font-semibold text-sm truncate" style={{ color: "var(--color-brand-text)" }} title={stock.Name}>
                  {stock.Name}
                </div>

                <div className="font-mono text-[10px] truncate" style={{ color: "var(--color-brand-muted)" }} title={stock.Break}>
                  {stock.Break || "-"}
                </div>

                <div className="font-mono text-[10px] tabular-nums" style={{ color: "var(--color-brand-muted)" }}>
                  {stock.Time || "-"}
                </div>

                <div className="font-mono text-sm tabular-nums text-right" style={{ color: "var(--color-brand-text)" }}>
                  {"\u20B9"}{stock.Price.toFixed(2)}
                </div>

                <div className="font-mono text-[11px] font-semibold text-right" style={{ color: sideColor }}>
                  {stock.OI > 0 ? "+" : ""}{stock.OI.toFixed(2)}%
                </div>

                <div>
                  {stock.Chart ? (
                    <Link
                      href={stock.Chart}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] tracking-wider transition-colors hover:opacity-90"
                      style={{ color: "var(--color-brand-accent)" }}
                    >
                      CHART
                    </Link>
                  ) : (
                    <span className="font-mono text-[10px]" style={{ color: "var(--color-brand-muted)" }}>
                      -
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {scanRows.length === 0 && (
            <div className="p-8 text-center font-mono text-xs" style={{ color: "var(--color-brand-muted)" }}>
              NO SIGNALS
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
