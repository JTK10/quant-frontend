import { NextRequest, NextResponse } from "next/server";
import {
  asSignalRecord,
  isScannerSignalRow,
  normalizeRadarSignal,
  parseSignalTime,
  resolveSignalName,
  resolveSignalSide,
  sortSignalRows,
  toNumber,
  toText,
} from "../../utils/scanner";
import { getTradingViewUrl } from "../../utils/tradingview";

export const dynamic = "force-dynamic";

type Side = "BULLISH" | "BEARISH" | "NEUTRAL";

type VelocityRow = Record<string, unknown>;

type VelocityItem = {
  Name: string;
  Price: number;
  Confidence: number;
  RVOL: number;
  RiskReward: string;
  Break: string;
  Module: string;
  ModuleLabel: string;
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

function classifyLegacySide(row: VelocityRow): Side {
  const side = resolveSignalSide(row);
  if (side !== "NEUTRAL") return side;
  return "NEUTRAL";
}

function toVelocityItem(raw: unknown, forcedSide?: Side): VelocityItem {
  const row = asSignalRecord(raw);

  if (isScannerSignalRow(row)) {
    const base = normalizeRadarSignal(row);
    return {
      Name: base.Name,
      Price: toNumber(base.Entry ?? base.Price),
      Confidence: toNumber(base.Confidence),
      RVOL: toNumber(base.RVOL),
      RiskReward: toText(base.RiskReward, "-"),
      Break: toText(base.Break ?? base.BreakType, "INSIDE"),
      Module: toText(base.Module),
      ModuleLabel: toText(base.ModuleLabel, "SCANNER"),
      Side: forcedSide ?? (base.Side as Side),
      Time: toText(base.Time ?? base.Fired_At),
      Chart: toText(base.Chart),
    };
  }

  const name = resolveSignalName(row);
  return {
    Name: name,
    Price: toNumber(
      row.SignalPrice ?? row.Price ?? row.price ?? row.LTP ?? row.lastPrice ?? row.Close
    ),
    Confidence: Math.abs(toNumber(row.Score_945 ?? row.Score ?? row.Signal_Generated_Score)),
    RVOL: 0,
    RiskReward: "-",
    Break: toText(row.Break ?? row.BreakType ?? row.Status ?? row.RankType, "INSIDE"),
    Module: "",
    ModuleLabel: "LEGACY",
    Side: forcedSide ?? classifyLegacySide(row),
    Time: toText(row.Signal_Generated_At ?? row.Time),
    Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(name),
  };
}

function sortAndTrim(items: VelocityItem[]): VelocityItem[] {
  return [...items]
    .sort((a, b) => {
      const confDiff = b.Confidence - a.Confidence;
      if (confDiff !== 0) return confDiff;

      const rvolDiff = b.RVOL - a.RVOL;
      if (rvolDiff !== 0) return rvolDiff;

      return parseSignalTime(b.Time) - parseSignalTime(a.Time);
    })
    .slice(0, 20);
}

function normalizeVelocityPayload(payload: unknown) {
  const obj = asSignalRecord(payload);

  if (Array.isArray(payload)) {
    const rows = payload.map(asSignalRecord);
    const normalizedRows = rows.some(isScannerSignalRow)
      ? sortSignalRows(rows.map((row) => normalizeRadarSignal(row)))
      : rows;
    const items = normalizedRows.map((row) => toVelocityItem(row));
    const bulls = sortAndTrim(items.filter((item) => item.Side === "BULLISH"));
    const bears = sortAndTrim(items.filter((item) => item.Side === "BEARISH"));
    const bias: Side =
      bulls.length + bears.length === 0
        ? "NEUTRAL"
        : bulls.reduce((sum, item) => sum + item.Confidence, 0) >= bears.reduce((sum, item) => sum + item.Confidence, 0)
          ? "BULLISH"
          : "BEARISH";

    const asOf = items
      .map((item) => item.Time)
      .sort((a, b) => parseSignalTime(b) - parseSignalTime(a))[0] ?? null;

    return { bias, bulls, bears, asOf };
  }

  if (!("bulls" in obj) && !("bears" in obj)) return null;

  const bullsRaw = Array.isArray(obj.bulls) ? obj.bulls : [];
  const bearsRaw = Array.isArray(obj.bears) ? obj.bears : [];

  const bulls = sortAndTrim(bullsRaw.map((item) => toVelocityItem(item, "BULLISH")));
  const bears = sortAndTrim(bearsRaw.map((item) => toVelocityItem(item, "BEARISH")));

  const biasRaw = toText(obj.bias).toUpperCase();
  const computedBias: Side =
    bulls.length + bears.length === 0
      ? "NEUTRAL"
      : bulls.reduce((sum, item) => sum + item.Confidence, 0) >= bears.reduce((sum, item) => sum + item.Confidence, 0)
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

    const normalized = normalizeVelocityPayload(payload);
    return NextResponse.json(normalized ?? EMPTY_RESPONSE);
  } catch {
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
