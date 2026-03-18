import { NextRequest, NextResponse } from "next/server";
import {
  asSignalRecord,
  isScannerSignalRow,
  normalizeRadarSignal,
  sortSignalRows,
  toNumber,
  toText,
} from "../../utils/scanner";
import { getTradingViewUrl } from "../../utils/tradingview";

export const revalidate = 30;

type AiRow = Record<string, unknown>;

type AiItem = {
  Name: string;
  Side: string;
  Entry: string;
  Decision: string;
  Time: string;
  Reason: string;
  Target: string;
  StopLoss: string;
  RiskReward: string;
  Confidence: number;
  LiveMove: number;
  OI: number;
  PCR: string;
  Walls: string;
  Module: string;
  Chart: string;
};

function toDisplayText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
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

  if (Array.isArray(payload)) return payload;

  const obj = asSignalRecord(payload);
  for (const key of ["body", "Body", "data", "Data", "items", "Items", "rows", "Rows", "result", "Result", "top_ai_picks", "TopAiPicks"]) {
    if (!(key in obj)) continue;
    const nested = obj[key];
    if (nested !== undefined) {
      const unwrapped = unwrapPayload(nested);
      if (Array.isArray(unwrapped)) return unwrapped;
    }
  }

  return payload;
}

function extractRows(payload: unknown): AiRow[] {
  const unwrapped = unwrapPayload(payload);
  return Array.isArray(unwrapped) ? unwrapped.map(asSignalRecord) : [];
}

function inferModule(row: AiRow): string {
  const decision = toText(row.Decision ?? row.AI_Decision).toUpperCase();
  if (decision.includes("FALLBACK")) return "FALLBACK";
  if (decision.includes("RECALL")) return "RECALL";
  return "AI SIGNAL";
}

function normalizeLegacyAiRow(row: AiRow): AiItem {
  const name =
    toText(row.Name) ||
    toText(row.Symbol) ||
    toText(row.InstrumentKey) ||
    "UNKNOWN";

  const resistance = toDisplayText(row.Option_Res, "-");
  const support = toDisplayText(row.Option_Sup, "-");

  return {
    Name: name,
    Side: toText(row.Side) || "-",
    Entry: toDisplayText(row.Entry ?? row.SignalPrice ?? row.Signal_Price, "N/A"),
    Decision: toText(row.Decision ?? row.AI_Decision, "N/A"),
    Time: toText(row.Time ?? row.Signal_Generated_At, "-"),
    Reason: toText(row.Reason ?? row.AI_Reason, "No AI rationale provided."),
    Target: toDisplayText(row.Target, "N/A"),
    StopLoss: toDisplayText(row.StopLoss, "N/A"),
    RiskReward: toDisplayText(row.RiskReward, "N/A"),
    Confidence: toNumber(row.Confidence ?? row.AI_Win_Probability ?? row.AI_Confidence),
    LiveMove: toNumber(row.LiveMove ?? row.Live_Move),
    OI: toNumber(row.OI ?? row.OI_Change),
    PCR: toDisplayText(row.PCR ?? row.Option_PCR, "-"),
    Walls: toText(row.Walls) || `${resistance} / ${support}`,
    Module: toText(row.Module, inferModule(row)),
    Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(name),
  };
}

function normalizeAiRow(row: AiRow): AiItem {
  if (!isScannerSignalRow(row)) {
    return normalizeLegacyAiRow(row);
  }

  const base = normalizeRadarSignal(row);
  return {
    Name: toText(base.Name, "UNKNOWN"),
    Side: toText(base.Side, "-"),
    Entry: toDisplayText(row.Entry ?? base.Entry, "N/A"),
    Decision: toText(row.Decision ?? row.Alert_Type ?? row.AI_Decision, "AI_SELECTED"),
    Time: toText(row.Time ?? row.Signal_Time ?? row.Fired_At, "-"),
    Reason: toText(row.Reason ?? row.AI_Reason ?? row.Notes, "-"),
    Target: toDisplayText(row.Target ?? row.Target1 ?? base.Target1, "N/A"),
    StopLoss: toDisplayText(row.StopLoss ?? row.SL ?? base.SL, "N/A"),
    RiskReward: toDisplayText(row.RiskReward ?? base.RiskReward, "N/A"),
    Confidence: toNumber(row.Confidence ?? row.AI_Confidence ?? base.Confidence),
    LiveMove: toNumber(row.LiveMove ?? row.Day_Move_Pct ?? base.Day_Move_Pct),
    OI: toNumber(row.OI ?? row.OI_Change),
    PCR: toDisplayText(row.PCR ?? row.Option_PCR ?? base.PCR, "-"),
    Walls: toText(row.Walls) || `${toText(base.CallWall, "-")} / ${toText(base.PutWall, "-")}`,
    Module: toText(base.ModuleLabel ?? row.Module ?? base.Module, inferModule(row)),
    Chart: toText(base.Chart),
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
    awsUrl.searchParams.set("route", "ai-signals");
    const date =
      request.nextUrl.searchParams.get("date") ??
      new Date().toISOString().split("T")[0];
    awsUrl.searchParams.set("date", date);
    awsUrl.searchParams.set("secret", secret);

    const res = await fetch(awsUrl.toString(), { next: { revalidate: 30 } });
    const payload = await parseJsonSafe(res);

    if (!res.ok) {
      return NextResponse.json([]);
    }

    const rows = extractRows(payload);
    const normalized = rows.map(normalizeAiRow);
    const sorted = sortSignalRows(
      normalized.map((item) => ({
        ...item,
        SignalRank: item.Confidence,
      }))
    ).sort((a, b) => {
      const confidenceDiff = b.Confidence - a.Confidence;
      if (confidenceDiff !== 0) return confidenceDiff;
      return Math.abs(b.LiveMove) - Math.abs(a.LiveMove);
    });

    return NextResponse.json(sorted);
  } catch {
    return NextResponse.json([]);
  }
}
