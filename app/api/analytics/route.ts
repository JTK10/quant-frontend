import { NextRequest, NextResponse } from "next/server";
import { getTradingViewUrl } from "../../utils/tradingview";

export const dynamic = "force-dynamic";

type BosRow = Record<string, unknown>;

type BosItem = {
  Name: string;
  Symbol: string;
  Direction: string;
  Signal_Time: string;
  Entry_Price: number;
  SL: number;
  Target: number;
  RiskReward: string;
  RVOL: number;
  PCR: number;
  Body_Pct: number;
  EMA_Gap_Pct: number;
  Coil_Score: number;
  Range_Expan: number;
  Opt_Vol_OI_Ratio: number;
  PCR_Aligned: boolean;
  Fired_At: string;
  InstrumentKey: string;
  Chart: string;
};

const EMPTY_RESPONSE = { items: [] as BosItem[] };

const ROUTE_CANDIDATES = [
  "bos-breakout",
  "bos-break-out",
  "bos-smart-radar",
  "bos-radar",
  "smart-radar-bos",
];

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%+,xX]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function asRecord(value: unknown): BosRow {
  return value && typeof value === "object" ? (value as BosRow) : {};
}

function extractRows(payload: unknown): BosRow[] {
  if (Array.isArray(payload)) return payload.map(asRecord);

  const obj = asRecord(payload);
  const candidates = ["items", "Items", "data", "rows", "result"];

  for (const key of candidates) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.map(asRecord);
    }
  }

  return [];
}

function looksLikeBosRow(row: BosRow): boolean {
  const alertType = toText(row.Alert_Type).toUpperCase();
  if (alertType.includes("BOS")) return true;

  return Boolean(
    toText(row.Signal_Time) ||
      row.RVOL !== undefined ||
      row.PCR !== undefined ||
      row.Coil_Score !== undefined ||
      row.Range_Expan !== undefined,
  );
}

function resolveTimeScore(value: unknown): number {
  const text = toText(value);
  if (!text) return -1;

  const ts = Date.parse(text);
  if (Number.isFinite(ts)) return ts;

  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return -1;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  return hour * 3600 + minute * 60 + second;
}

function normalizeDirection(value: unknown): string {
  const text = toText(value).toUpperCase();
  if (text.includes("BULL")) return "BULLISH";
  if (text.includes("BEAR")) return "BEARISH";
  return text || "UNKNOWN";
}

function toBosItem(row: BosRow): BosItem {
  const name = toText(row.Name) || toText(row.Symbol) || toText(row.InstrumentKey) || "UNKNOWN";
  const symbol = toText(row.Symbol) || name;

  return {
    Name: name,
    Symbol: symbol,
    Direction: normalizeDirection(row.Direction ?? row.Side),
    Signal_Time: toText(row.Signal_Time ?? row.Time ?? row.BreakoutTime),
    Entry_Price: toNumber(row.Entry_Price ?? row.Entry ?? row.SignalPrice),
    SL: toNumber(row.SL ?? row.StopLoss),
    Target: toNumber(row.Target ?? row.Target1),
    RiskReward: toText(row.RiskReward ?? row.RR) || "N/A",
    RVOL: toNumber(row.RVOL),
    PCR: toNumber(row.PCR ?? row.Option_PCR),
    Body_Pct: toNumber(row.Body_Pct),
    EMA_Gap_Pct: toNumber(row.EMA_Gap_Pct),
    Coil_Score: toNumber(row.Coil_Score),
    Range_Expan: toNumber(row.Range_Expan),
    Opt_Vol_OI_Ratio: toNumber(row.Opt_Vol_OI_Ratio),
    PCR_Aligned: toBoolean(row.PCR_Aligned),
    Fired_At: toText(row.Fired_At ?? row.Timestamp),
    InstrumentKey: toText(row.InstrumentKey),
    Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(symbol || name),
  };
}

function normalizePayload(payload: unknown): BosItem[] {
  const rows = extractRows(payload).filter(looksLikeBosRow);
  return rows
    .map(toBosItem)
    .sort((a, b) => {
      const timeDiff = resolveTimeScore(b.Signal_Time || b.Fired_At) - resolveTimeScore(a.Signal_Time || a.Fired_At);
      if (timeDiff !== 0) return timeDiff;
      return b.RVOL - a.RVOL;
    });
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

    const date =
      request.nextUrl.searchParams.get("date") ??
      new Date().toISOString().split("T")[0];

    for (const routeName of ROUTE_CANDIDATES) {
      const awsUrl = new URL(baseUrl);
      awsUrl.searchParams.set("route", routeName);
      awsUrl.searchParams.set("date", date);
      awsUrl.searchParams.set("secret", secret);

      try {
        const res = await fetch(awsUrl.toString(), { cache: "no-store" });
        const payload = await parseJsonSafe(res);
        if (!res.ok) continue;

        const items = normalizePayload(payload);
        if (items.length > 0) {
          return NextResponse.json({ items });
        }
      } catch {
        continue;
      }
    }

    return NextResponse.json(EMPTY_RESPONSE);
  } catch {
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
