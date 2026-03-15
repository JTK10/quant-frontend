import type { RadarStock } from "../types/radar";
import { getTradingViewUrl, resolveTickerSymbol } from "./tradingview";

export type SignalSide = "BULLISH" | "BEARISH" | "NEUTRAL";
export type SignalRow = Record<string, unknown>;

export function asSignalRecord(value: unknown): SignalRow {
  return value && typeof value === "object" ? (value as SignalRow) : {};
}

export function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[%+,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function toText(value: unknown, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = toText(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "y";
}

export function resolveSignalName(row: SignalRow): string {
  return (
    toText(row.Name) ||
    toText(row.Symbol) ||
    toText(row.Ticker) ||
    toText(row.InstrumentKey) ||
    "UNKNOWN"
  );
}

export function resolveSignalSide(row: SignalRow): SignalSide {
  const side = toText(row.Side ?? row.side).toUpperCase();
  if (side.includes("BULL")) return "BULLISH";
  if (side.includes("BEAR")) return "BEARISH";

  const direction = toText(row.Direction ?? row.direction).toUpperCase();
  if (direction === "BULL") return "BULLISH";
  if (direction === "BEAR") return "BEARISH";

  const direction945 = toText(row.Direction_945 ?? row.direction_945).toUpperCase();
  if (direction945 === "LONG") return "BULLISH";
  if (direction945 === "SHORT") return "BEARISH";

  const rankType = toText(row.RankType ?? row.rankType).toUpperCase();
  if (rankType.includes("TOP GAINER")) return "BULLISH";
  if (rankType.includes("TOP LOSER")) return "BEARISH";

  const breakType = toText(row.BreakType ?? row.breakType ?? row.Break).toUpperCase();
  if (breakType.includes("OR_BREAKOUT") || breakType.includes("BROKE_PDH") || breakType.includes("PDH")) {
    return "BULLISH";
  }
  if (breakType.includes("OR_BREAKDOWN") || breakType.includes("BROKE_PDL") || breakType.includes("PDL")) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

export function isScannerSignalRow(row: SignalRow): boolean {
  return Boolean(
    toText(row.Module) ||
    "Entry" in row ||
    "Target1" in row ||
    "Strike_Rec" in row ||
    "CallWall" in row ||
    "PutWall" in row
  );
}

export function parseSignalTime(value: unknown): number {
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

export function formatModuleLabel(value: unknown): string {
  const raw = toText(value).toUpperCase();
  switch (raw) {
    case "A_EXTREME_PCR":
      return "A / PCR";
    case "B_GAP_RUN":
      return "B / GAP";
    case "B_CONTINUATION":
      return "B / FLOW";
    case "C_GRINDER":
      return "C / GRIND";
    default:
      return raw ? raw.replace(/_/g, " ") : "SCANNER";
  }
}

export function computeSignalEdge(row: SignalRow): number {
  const side = resolveSignalSide(row);
  if (side === "NEUTRAL") return 0;

  const direction = side === "BULLISH" ? 1 : -1;
  const confidence = toNumber(row.Confidence ?? row.Signal_Generated_Score ?? row.AI_Confidence);
  const rvol = toNumber(row.RVOL);
  const rsScore = Math.abs(toNumber(row.RS_Score));
  const sectorThemeBoost = toBoolean(row.Sector_Theme) ? 4 : 0;

  const base = confidence * 2 + Math.max(rvol - 1, 0) * 5 + rsScore * 2 + sectorThemeBoost;
  return Number((direction * base).toFixed(2));
}

export function computeSignalRank(row: SignalRow): number {
  const existing = toNumber(row.SignalRank ?? row.SmartRank);
  if (existing > 0) return existing;

  const confidence = toNumber(row.Confidence ?? row.Signal_Generated_Score ?? row.AI_Confidence);
  const rvol = toNumber(row.RVOL);
  const rsScore = Math.abs(toNumber(row.RS_Score));
  const dayMove = Math.abs(toNumber(row.Day_Move_Pct ?? row.LiveMove));
  const breakType = toText(row.BreakType ?? row.Break).toUpperCase();
  const module = toText(row.Module).toUpperCase();
  let total = confidence * 10 + Math.max(rvol - 1, 0) * 12 + rsScore * 5 + dayMove * 2;

  if (toBoolean(row.Sector_Theme)) total += 15;
  if (breakType.includes("BROKE")) total += 6;
  if (module.startsWith("A_")) total += 8;
  if (module.startsWith("C_")) total += 4;

  return Number(total.toFixed(2));
}

export function normalizeRadarSignal(raw: unknown): RadarStock {
  const row = asSignalRecord(raw);
  const name = resolveSignalName(row);
  const symbol = toText(row.Symbol) || resolveTickerSymbol(name);
  const side = resolveSignalSide(row);
  const module = toText(row.Module);
  const breakType = toText(row.BreakType ?? row.Break) || "INSIDE";
  const time = toText(row.Time ?? row.Signal_Time);
  const firedAt = toText(row.Fired_At);
  const entry = toNumber(row.Entry ?? row["Current Price"] ?? row.Price ?? row.SignalPrice);
  const stopLoss = toNumber(row.SL ?? row.StopLoss);
  const target = toNumber(row.Target ?? row.Target1);
  const target2 = toNumber(row.Target2);
  const confidence = toNumber(row.Confidence ?? row.AI_Confidence ?? row.Signal_Generated_Score);
  const rvol = toNumber(row.RVOL);
  const dayMove = toNumber(row.Day_Move_Pct ?? row.LiveMove);
  const rsScore = toNumber(row.RS_Score);
  const pcr = toNumber(row.PCR ?? row.Option_PCR);
  const pcrAtOpen = toNumber(row.PCR_At_Open);
  const callWall = toText(row.CallWall ?? row.Option_Res);
  const putWall = toText(row.PutWall ?? row.Option_Sup);
  const notes = toText(row.Notes);
  const signalRank = computeSignalRank(row);
  const signalEdge = computeSignalEdge(row);
  const sector = toText(row.Sector) || "OTHER";
  const tvSymbol = symbol ? `NSE:${resolveTickerSymbol(name)}` : "";

  return {
    ...row,
    Name: name,
    Symbol: symbol,
    Module: module,
    ModuleLabel: formatModuleLabel(module),
    Side: side,
    Break: breakType,
    BreakType: breakType,
    Time: time,
    Fired_At: firedAt,
    Entry: entry,
    "Current Price": entry,
    Price: entry,
    SignalPrice: entry,
    SL: stopLoss,
    StopLoss: stopLoss,
    Target: target,
    Target1: target,
    Target2: target2,
    RiskReward: toText(row.RiskReward),
    Confidence: confidence,
    Signal_Generated_Score: confidence,
    RVOL: rvol,
    Body_Pct: toNumber(row.Body_Pct),
    Day_Move_Pct: dayMove,
    LiveMove: dayMove,
    RS_Score: rsScore,
    PCR: pcr,
    PCR_At_Open: pcrAtOpen,
    MaxPain: toText(row.MaxPain),
    CallWall: callWall,
    PutWall: putWall,
    Walls: `${callWall || "-"} / ${putWall || "-"}`,
    ATM_Strike: toText(row.ATM_Strike),
    Notes: notes,
    PE_OI_Surge: toNumber(row.PE_OI_Surge),
    Sector: sector,
    Sector_Theme: toBoolean(row.Sector_Theme),
    Strike_Rec: toText(row.Strike_Rec),
    SignalRank: signalRank,
    SignalEdge: signalEdge,
    SmartRank: signalRank,
    TV_Symbol: tvSymbol,
    Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(name),
    Decision: toText(row.Decision ?? row.Alert_Type ?? row.AI_Decision),
    Reason: toText(row.Reason ?? row.AI_Reason) || notes,
    OptionsPlay: toText(row.OptionsPlay ?? row.Options_Play ?? row.AI_Options_Play),
  };
}

export function sortSignalRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const rankDiff = toNumber(b.SignalRank ?? b.SmartRank) - toNumber(a.SignalRank ?? a.SmartRank);
    if (rankDiff !== 0) return rankDiff;

    const confDiff = toNumber(b.Confidence ?? b.Signal_Generated_Score) - toNumber(a.Confidence ?? a.Signal_Generated_Score);
    if (confDiff !== 0) return confDiff;

    const rvolDiff = toNumber(b.RVOL) - toNumber(a.RVOL);
    if (rvolDiff !== 0) return rvolDiff;

    return parseSignalTime(b.Fired_At ?? b.Time) - parseSignalTime(a.Fired_At ?? a.Time);
  });
}
