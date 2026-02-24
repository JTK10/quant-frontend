import { NextRequest, NextResponse } from "next/server";
import { getTradingViewUrl } from "../../utils/tradingview";

export const dynamic = "force-dynamic";

type Side = "BULLISH" | "BEARISH" | "NEUTRAL";

type VelocityRow = Record<string, unknown>;

type VelocityItem = {
  Name: string;
  Price: number;
  OI: number;
  Break: string;
  Side: Side;
  Time: string;
  Chart: string;
};

const EMPTY_RESPONSE = {
  bias: "NEUTRAL" as Side,
  bulls: [] as VelocityItem[],
  bears: [] as VelocityItem[],
  asOf: null as string | null,
};

function toNumber(value: unknown): number {
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

function asRecord(value: unknown): VelocityRow {
  return value && typeof value === "object" ? (value as VelocityRow) : {};
}

function resolveName(row: VelocityRow): string {
  return (
    toText(row.Name) ||
    toText(row.Symbol) ||
    toText(row.Ticker) ||
    toText(row.InstrumentKey) ||
    "UNKNOWN"
  );
}

function classifySide(row: VelocityRow): Side {
  const side = toText(row.Side ?? row.side).toUpperCase();
  if (side.includes("BULL")) return "BULLISH";
  if (side.includes("BEAR")) return "BEARISH";

  const rankType = toText(row.RankType ?? row.rankType).toUpperCase();
  if (rankType.includes("TOP GAINER")) return "BULLISH";
  if (rankType.includes("TOP LOSER")) return "BEARISH";

  const breakType = toText(row.BreakType ?? row.breakType).toUpperCase();
  if (breakType.includes("PDH")) return "BULLISH";
  if (breakType.includes("PDL")) return "BEARISH";

  return "NEUTRAL";
}

function resolveTimeScore(value: unknown): number {
  const text = toText(value);
  if (!text) return -1;

  const ts = Date.parse(text);
  if (Number.isFinite(ts)) return ts;

  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return -1;

  const hour = Number(match[1]);
  const min = Number(match[2]);
  const sec = Number(match[3] ?? "0");
  return hour * 3600 + min * 60 + sec;
}

function toVelocityItem(row: VelocityRow, forcedSide?: Side): VelocityItem {
  const name = resolveName(row);
  const side = forcedSide ?? classifySide(row);

  return {
    Name: name,
    Price: toNumber(
      row.SignalPrice ?? row.Price ?? row.price ?? row.LTP ?? row.lastPrice ?? row.Close
    ),
    OI: toNumber(row.OI_Change ?? row.OI ?? row.oi_change ?? row.oi),
    Break: toText(row.BreakType ?? row.Status ?? row.RankType),
    Side: side,
    Time: toText(row.Time ?? row.SnapshotTime ?? row.Signal_Generated_At),
    Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(name),
  };
}

function sortAndTrim(items: VelocityItem[]): VelocityItem[] {
  return [...items].sort((a, b) => b.OI - a.OI).slice(0, 20);
}

function normalizeExistingVelocityPayload(payload: unknown) {
  const obj = asRecord(payload);
  if (!("bulls" in obj) && !("bears" in obj)) return null;

  const bullsRaw = Array.isArray(obj.bulls) ? obj.bulls : [];
  const bearsRaw = Array.isArray(obj.bears) ? obj.bears : [];

  const bulls = sortAndTrim(bullsRaw.map((item) => toVelocityItem(asRecord(item), "BULLISH")));
  const bears = sortAndTrim(bearsRaw.map((item) => toVelocityItem(asRecord(item), "BEARISH")));

  const biasRaw = toText(obj.bias).toUpperCase();
  const computedBias: Side =
    bulls.length + bears.length === 0
      ? "NEUTRAL"
      : bulls.length > bears.length
        ? "BULLISH"
        : "BEARISH";

  return {
    bias:
      biasRaw === "BULLISH" || biasRaw === "BEARISH" || biasRaw === "NEUTRAL"
        ? (biasRaw as Side)
        : computedBias,
    bulls,
    bears,
    asOf: toText(obj.asOf) || null,
  };
}

function extractRows(payload: unknown): VelocityRow[] {
  if (Array.isArray(payload)) return payload.map(asRecord);

  const obj = asRecord(payload);
  const candidates = ["data", "rows", "items", "result"];

  for (const key of candidates) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.map(asRecord);
    }
  }

  return [];
}

function pickLatestRows(rows: VelocityRow[]): VelocityRow[] {
  const scored = rows
    .map((row) => ({
      row,
      rawTime: toText(row.Time ?? row.SnapshotTime ?? row.Signal_Generated_At),
      score: resolveTimeScore(row.Time ?? row.SnapshotTime ?? row.Signal_Generated_At),
    }))
    .filter((entry) => entry.rawTime.length > 0);

  if (scored.length === 0) return rows;

  const latest = scored.reduce((best, current) => {
    return current.score > best.score ? current : best;
  });

  return scored
    .filter((entry) => entry.score === latest.score && entry.rawTime === latest.rawTime)
    .map((entry) => entry.row);
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.AWS_API_URL;
    const secret = process.env.RADAR_SECRET;

    if (!baseUrl || !secret) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const awsUrl = new URL(baseUrl);
    awsUrl.searchParams.set("route", "market-velocity");
    const date =
      request.nextUrl.searchParams.get("date") ??
      new Date().toISOString().split("T")[0];
    awsUrl.searchParams.set("date", date);
    awsUrl.searchParams.set("secret", secret);

    const res = await fetch(awsUrl.toString(), { cache: "no-store" });
    const payload = await parseJsonSafe(res);

    if (!res.ok) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const precomputed = normalizeExistingVelocityPayload(payload);
    if (precomputed) {
      return NextResponse.json(precomputed);
    }

    const rows = pickLatestRows(extractRows(payload));
    const enriched = rows.map((row) => toVelocityItem(row));

    const bulls = sortAndTrim(enriched.filter((item) => item.Side === "BULLISH"));
    const bears = sortAndTrim(enriched.filter((item) => item.Side === "BEARISH"));

    const bias: Side =
      bulls.length + bears.length === 0
        ? "NEUTRAL"
        : bulls.length > bears.length
          ? "BULLISH"
          : "BEARISH";

    const asOf = rows
      .map((row) => toText(row.Time ?? row.SnapshotTime ?? row.Signal_Generated_At))
      .find((time) => time.length > 0) ?? null;

    return NextResponse.json({ bias, bulls, bears, asOf });
  } catch (error: unknown) {
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
