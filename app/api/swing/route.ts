import { NextRequest, NextResponse } from "next/server";
import { getTradingViewUrl } from "../../utils/tradingview";

export const revalidate = 60;

type SwingRow = Record<string, unknown>;

type SwingItem = {
  Symbol: string;
  Direction: string;
  Confidence: number;
  Setup: string;
  Status: string;
  Trigger: string;
  Close: number;
  Chart: string;
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%+,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asRecord(value: unknown): SwingRow {
  return value && typeof value === "object" ? (value as SwingRow) : {};
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unwrapPayload(payload: unknown): unknown {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return unwrapPayload(tryParseJson(trimmed));
    }
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = asRecord(payload);
  for (const key of ["body", "Body", "data", "Data", "items", "Items", "rows", "Rows", "result", "Result"]) {
    if (!(key in obj)) continue;
    const nested = obj[key];
    if (nested !== undefined) {
      const unwrapped = unwrapPayload(nested);
      if (Array.isArray(unwrapped)) return unwrapped;
    }
  }

  return payload;
}

function extractRows(payload: unknown): SwingRow[] {
  const unwrapped = unwrapPayload(payload);
  if (Array.isArray(unwrapped)) {
    return unwrapped.map(asRecord);
  }
  return [];
}

function toSwingItem(row: SwingRow): SwingItem {
  const symbol =
    toText(row.Symbol) ||
    toText(row.Name) ||
    toText(row.InstrumentKey) ||
    "UNKNOWN";

  return {
    Symbol: symbol,
    Direction: toText(row.Direction) || "-",
    Confidence: toNumber(row.Confidence),
    Setup: toText(row.Setup) || "-",
    Status: toText(row.Status) || "-",
    Trigger: toText(row.Trigger ?? row.Entry_Trigger_Time ?? row.Trigger_Time) || "-",
    Close: toNumber(row.Close),
    Chart: symbol === "UNKNOWN" ? "" : getTradingViewUrl(symbol),
  };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return [];

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.AWS_API_URL;
    const secret = process.env.RADAR_SECRET;

    if (!baseUrl || !secret) {
      return NextResponse.json([]);
    }

    const awsUrl = new URL(baseUrl);
    awsUrl.searchParams.set("route", "swing");
    const date =
      request.nextUrl.searchParams.get("date") ??
      new Date().toISOString().split("T")[0];
    awsUrl.searchParams.set("date", date);
    awsUrl.searchParams.set("secret", secret);

    const res = await fetch(awsUrl.toString(), { next: { revalidate: 60 } });
    const payload = await parseJsonSafe(res);

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const items = extractRows(payload).map(toSwingItem);
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}
