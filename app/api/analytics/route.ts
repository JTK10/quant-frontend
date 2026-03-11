import { NextRequest, NextResponse } from "next/server";
import { getTradingViewUrl } from "../../utils/tradingview";

export const revalidate = 30;

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

type RequestVariant = {
  routeName: string;
  dateValue: string;
};

const EMPTY_RESPONSE = { items: [] as BosItem[] };

const PRIMARY_ROUTES = [
  "bos-smart-radar",
  "bos-radar",
  "bos-breakout",
  "bos",
];

const FALLBACK_ROUTES = [
  "bos-break-out",
  "bos_breakout",
  "bos_break_out",
  "smart-radar-bos",
  "smart_radar_bos",
  "analytics",
];

function getRequestSignal(timeoutMs: number): AbortSignal | undefined {
  const timeoutFactory = (AbortSignal as typeof AbortSignal & {
    timeout?: (ms: number) => AbortSignal;
  }).timeout;

  return typeof timeoutFactory === "function" ? timeoutFactory(timeoutMs) : undefined;
}

function buildDateCandidates(date: string): string[] {
  const values = new Set<string>();
  values.add(date);

  const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    values.add(`${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`);
  }

  const dmyMatch = date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    values.add(`${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`);
  }

  return Array.from(values);
}

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

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unwrapDynamoValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => unwrapDynamoValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 1) {
    const onlyKey = keys[0];
    const nested = record[onlyKey];

    if (onlyKey === "S" || onlyKey === "BOOL") return nested;
    if (onlyKey === "N") return typeof nested === "string" ? Number(nested) : nested;
    if (onlyKey === "NULL") return null;
    if (onlyKey === "L" && Array.isArray(nested)) {
      return nested.map((item) => unwrapDynamoValue(item));
    }
    if (onlyKey === "M" && nested && typeof nested === "object") {
      return unwrapDynamoValue(nested);
    }
  }

  const unwrappedEntries = Object.entries(record).map(([key, nested]) => [key, unwrapDynamoValue(nested)]);
  return Object.fromEntries(unwrappedEntries);
}

function asRecord(value: unknown): BosRow {
  return value && typeof value === "object" ? (value as BosRow) : {};
}

function looksLikeBosRow(row: BosRow): boolean {
  const alertType = toText(row.Alert_Type ?? row.alert_type ?? row.AlertType).toUpperCase();
  if (alertType.includes("BOS")) return true;

  return Boolean(
    toText(row.Signal_Time ?? row.signal_time ?? row.BreakoutTime ?? row.breakout_time) ||
      row.RVOL !== undefined ||
      row.rvol !== undefined ||
      row.PCR !== undefined ||
      row.pcr !== undefined ||
      row.Coil_Score !== undefined ||
      row.coil_score !== undefined ||
      row.Range_Expan !== undefined ||
      row.range_expan !== undefined,
  );
}

function unwrapPayload(payload: unknown): unknown {
  const normalized = unwrapDynamoValue(payload);

  if (typeof normalized === "string") {
    const trimmed = normalized.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return unwrapPayload(tryParseJson(trimmed));
    }
    return normalized;
  }

  if (Array.isArray(normalized)) {
    return normalized.map((item) => unwrapPayload(item));
  }

  const obj = asRecord(normalized);
  const nestedKeys = ["body", "Body", "payload", "Payload", "data", "Data", "result", "Result"];
  for (const key of nestedKeys) {
    if (!(key in obj)) continue;
    const nested = obj[key];
    if (typeof nested === "string" || Array.isArray(nested) || (nested && typeof nested === "object")) {
      const unwrapped = unwrapPayload(nested);
      if (unwrapped) return unwrapped;
    }
  }

  return normalized;
}

function extractRows(payload: unknown): BosRow[] {
  const unwrapped = unwrapPayload(payload);
  if (Array.isArray(unwrapped)) return unwrapped.map(asRecord);

  const obj = asRecord(unwrapped);
  const arrayKeys = ["items", "Items", "rows", "Rows", "records", "Records", "result", "Result"];

  for (const key of arrayKeys) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value.map(asRecord);
    }
  }

  return looksLikeBosRow(obj) ? [obj] : [];
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
    Direction: normalizeDirection(row.Direction ?? row.direction ?? row.Side ?? row.side),
    Signal_Time: toText(row.Signal_Time ?? row.signal_time ?? row.Time ?? row.time ?? row.BreakoutTime ?? row.breakout_time),
    Entry_Price: toNumber(row.Entry_Price ?? row.entry_price ?? row.Entry ?? row.entry ?? row.SignalPrice ?? row.signal_price),
    SL: toNumber(row.SL ?? row.sl ?? row.StopLoss ?? row.stop_loss),
    Target: toNumber(row.Target ?? row.target ?? row.Target1 ?? row.target1),
    RiskReward: toText(row.RiskReward ?? row.risk_reward ?? row.RR ?? row.rr) || "N/A",
    RVOL: toNumber(row.RVOL ?? row.rvol),
    PCR: toNumber(row.PCR ?? row.pcr ?? row.Option_PCR ?? row.option_pcr),
    Body_Pct: toNumber(row.Body_Pct ?? row.body_pct),
    EMA_Gap_Pct: toNumber(row.EMA_Gap_Pct ?? row.ema_gap_pct),
    Coil_Score: toNumber(row.Coil_Score ?? row.coil_score),
    Range_Expan: toNumber(row.Range_Expan ?? row.range_expan),
    Opt_Vol_OI_Ratio: toNumber(row.Opt_Vol_OI_Ratio ?? row.opt_vol_oi_ratio),
    PCR_Aligned: toBoolean(row.PCR_Aligned ?? row.pcr_aligned),
    Fired_At: toText(row.Fired_At ?? row.fired_at ?? row.Timestamp ?? row.timestamp),
    InstrumentKey: toText(row.InstrumentKey ?? row.instrument_key),
    Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(symbol || name),
  };
}

function sortBosItems(items: BosItem[]): BosItem[] {
  return [...items].sort((a, b) => {
    const timeDiff = resolveTimeScore(b.Signal_Time || b.Fired_At) - resolveTimeScore(a.Signal_Time || a.Fired_At);
    if (timeDiff !== 0) return timeDiff;
    return b.RVOL - a.RVOL;
  });
}

function normalizePayload(payload: unknown): BosItem[] {
  const rows = extractRows(payload).filter(looksLikeBosRow);
  return sortBosItems(rows.map(toBosItem));
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchVariant(baseUrl: string, secret: string, variant: RequestVariant): Promise<BosItem[]> {
  const awsUrl = new URL(baseUrl);
  awsUrl.searchParams.set("route", variant.routeName);
  awsUrl.searchParams.set("date", variant.dateValue);
  awsUrl.searchParams.set("secret", secret);

  const response = await fetch(awsUrl.toString(), {
    next: { revalidate: 30 },
    signal: getRequestSignal(4000),
  });

  if (!response.ok) {
    return [];
  }

  const payload = await parseJsonSafe(response);
  return normalizePayload(payload);
}

async function loadBosItems(baseUrl: string, secret: string, date: string): Promise<BosItem[]> {
  const dateCandidates = buildDateCandidates(date);

  const runBatch = async (routes: string[]) => {
    const variants: RequestVariant[] = routes.flatMap((routeName) =>
      dateCandidates.map((dateValue) => ({ routeName, dateValue })),
    );

    const settled = await Promise.allSettled(
      variants.map((variant) => fetchVariant(baseUrl, secret, variant)),
    );

    const deduped = new Map<string, BosItem>();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const item of result.value) {
        const key = `${item.Symbol}|${item.Signal_Time}|${item.Entry_Price}`;
        if (!deduped.has(key)) {
          deduped.set(key, item);
        }
      }
    }

    return sortBosItems(Array.from(deduped.values()));
  };

  const primaryItems = await runBatch(PRIMARY_ROUTES);
  if (primaryItems.length > 0) return primaryItems;

  return runBatch(FALLBACK_ROUTES);
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

    const items = await loadBosItems(baseUrl, secret, date);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
