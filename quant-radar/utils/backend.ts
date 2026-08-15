const INDIA_TZ = "Asia/Kolkata";
import symbolMapData from "./symbolMap.json";
const symbolMap: Record<string, string> = symbolMapData;

type GenericRecord = Record<string, unknown>;

export type RadarSignal = {
  Name: string;
  Symbol: string;
  Side: "BULL" | "BEAR" | "NEUTRAL";
  Module: string;
  Entry: number;
  SL: number;
  Target1: number;
  Target2: number;
  RR: string;
  Confidence: number;
  RVOL: number;
  PCR: number;
  PCRSignal: string;
  BodyPct: number;
  DayMovePct: number;
  RSScore: number;
  CallWall: string;
  PutWall: string;
  ATMStrike: string;
  MaxPain: string;
  PEOISurge: number;
  StrikeRec: string;
  Notes: string;
  Sector: string;
  SectorTheme: boolean;
  Direction: string;
  BreakType: string;
  EntryTime: string;
  FiredAt: string;
  HasOptions: boolean;
  SignalRank: number;
  Chart: string;
};

export type PulseWatchlistItem = {
  Symbol: string;
  Direction: "LONG" | "SHORT";
  StoredAt: string;
};

export type PulseRow = {
  Name: string;
  Symbol: string;
  Side: "BULL" | "BEAR";
  Module: string;
  Price: number;
  Confidence: number;
  RVOL: number;
  PCR: number;
  PCRAtOpen: number;
  ATMStrike: string;
  RR: string;
  RSScore: number;
  Time: string;
  Break: string;
  Chart: string;
};

export type PulseData = {
  watchlist: PulseWatchlistItem[];
  bulls: PulseRow[];
  bears: PulseRow[];
  bias: string;
  asOf: string | null;
};

export type SectorData = {
  key: string;
  label: string;
  symbols: string[];
  signals: {
    name: string;
    sym: string;
    side: "BULL" | "BEAR" | "NEUTRAL";
    conf: number;
    rvol: number;
    move: number;
    time: string;
    module: string;
    chart: string;
  }[];
  totalSignals: number;
  bullCount: number;
  bearCount: number;
  avgMove: number;
  bullRatio: number;
  isBullish: boolean;
};

export type AiPick = {
  Name: string;
  Symbol: string;
  Side: "BULL" | "BEAR" | "NEUTRAL";
  Entry: number;
  Target: number;
  StopLoss: number;
  AI_Win_Probability: number;
  Time: string;
  Module: string;
  Direction: string;
  Chart: string;
};

export type AiPayload = {
  date: string;
  total_signals_analyzed: number;
  top_ai_picks: AiPick[];
};

export type FlowRadarRow = {
  Symbol: string;
  Name: string;
  Sector: string;
  Engines: string;
  SignalDir: string;
  Buildup: string;
  Verdict: string;
  VerdictReason: string;
  OI: number;
  OIChgPct: number;
  PriceChgPct: number;
  FadeLongCandidate: boolean;
  CleanScore: number;
  CompositeScore: number;
  StoredAt: string;
};

export type FlowSmartlistCategory = {
  count: number;
  rows: GenericRecord[];
  stored_at: string;
};

export type RvolPulseItem = {
  stock: string;
  rms: number;
  rvol: number;
  chg: number;
  color: "GREEN" | "ORANGE" | "YELLOW" | "GRAY";
  dir: "LONG" | "SHORT";
  signal: boolean;
};

export type RvolPulseData = {
  lastUpdated: string | null;
  top25Board: RvolPulseItem[];
  longBoard: RvolPulseItem[];
  shortBoard: RvolPulseItem[];
};

export type SniperRow = {
  Name: string;
  Symbol: string;
  Direction: "LONG" | "SHORT";
  SignalTime: string;
  EntryPrice: number;
  EMA9: number;
  RVOL: number;
  RVOL_Color: string;
  RMS: number;
  MaxMovePct: number;
  Chart: string;
  TriggerMode: string;
  Conviction: number;
  Sector: string;
  RSScore: number;
  SectorPressure: number;
  CompositeScore: number;
  IsBestInSector: boolean;
  IsTopMover: boolean;
  EarlyAbsPct: number;
  EarlyRVOL: number;
  B0_Range_Pct: number;
  B0_CloseStr: number;
  PDRange_Pct: number;
  Open_vs_Ref: number;
};


export type CapitulationRow = {
  Name: string;
  Symbol: string;
  Direction: "LONG" | "SHORT" | "NEUTRAL";
  SignalTime: string;
  EntryPrice: number;
  Triggers: string;
  Chart: string;
};

export type V6Row = {
  Name: string;
  Direction: string;
  Lane: string;
  ScoreV3: number;
  Entry: number;
  SL: number;
  Target1: number;
  RiskReward: string;
  ConvCandleTime: string;
  EntryTime: string;
  VolExp: number;
  RVOL_hist: number;
  Confluence: number;
  CoilBars: number;
  DelayBars: number;
  ConvBR: number;
  ORL_Held: string;
  Broke: string;
  PremiumQualified: string;
  Chart: string;
  Symbol: string;
};

export type ObSignalRow = {
  Name: string;
  Symbol: string;
  Side: "BULL" | "BEAR" | "NEUTRAL";
  Direction: string;
  SignalTime: string;
  Entry: number;
  PDL: number;
  PDH: number;
  PDL_Brk_Pct: number;
  OB_High: number;
  OB_Low: number;
  OB_Pen_Pct: number;
  Gap_Pct: number;
  Score: number;
  OB_Date: string;
  FiredAt: string;
  RMS: number;
  Sector: string;
  Sector_RMS_Rank: number;
  Sector_Size: number;
  Chart: string;
};


export function getTodayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function textify(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

export function numberify(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").replace(/%/g, "").trim();
    if (!cleaned) {
      return fallback;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

export function truthy(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const raw = textify(value).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "y";
}

function toRecord(value: unknown): GenericRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as GenericRecord)
    : {};
}

function toArray(value: unknown): GenericRecord[] {
  return Array.isArray(value) ? value.map(toRecord) : [];
}

function prettySectorLabel(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeSignalSide(value: unknown): "BULL" | "BEAR" | "NEUTRAL" {
  const raw = textify(value).toUpperCase();

  if (raw.includes("BULL") || raw === "LONG") {
    return "BULL";
  }

  if (raw.includes("BEAR") || raw === "SHORT") {
    return "BEAR";
  }

  return "NEUTRAL";
}

export function buildTradingViewUrl(symbol: string, name?: string): string {
  const token = textify(symbol) || textify(name) || "NIFTY";
  const cleaned = token.replace(/\s+/g, "").toUpperCase();

  // Cross-reference with the master mapping dictionary
  const finalSymbol = symbolMap[cleaned] || cleaned;

  return `https://www.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(finalSymbol)}&interval=5`;
}

type BackendRoute = "smart-radar" | "market-velocity" | "ai-signals" | "sector-heatmap" | "flow-radar" | "flow-smartlist" | "sector-sentiment" | "institutional-watchlist" | "rvol-pulse" | "sniper-signal" | "ob-signal" | "capitulation-signal" | "v6-signals";

export async function fetchBackendRoute(route: BackendRoute, dateStr: string, extraParams: Record<string, string> = {}): Promise<unknown> {
  const rawApiUrl = process.env.AWS_API_URL;
  const secret = process.env.RADAR_SECRET;

  if (!rawApiUrl) {
    throw new Error("Missing AWS_API_URL environment variable.");
  }

  if (!secret) {
    throw new Error("Missing RADAR_SECRET environment variable.");
  }

  const url = new URL(rawApiUrl);
  url.searchParams.set("route", route);
  url.searchParams.set("date", dateStr);

  Object.entries(extraParams).forEach(([k, v]) => {
    url.searchParams.set(k, v);
  });

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      "x-radar-secret": secret,
    },
  });

  const body = await response.text();
  const payload = body ? JSON.parse(body) : null;

  if (!response.ok) {
    const message =
      textify(toRecord(payload).error) ||
      `Backend request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

export function normalizeRadarSignals(payload: unknown): RadarSignal[] {
  const rows = toArray(payload);

  return rows.map((row, index) => {
    const symbol = textify(row.Symbol);
    const name = textify(row.Name, symbol || `Signal ${index + 1}`);
    const side = normalizeSignalSide(row.Side ?? row.Direction);
    const pcr = numberify(row.PCR);
    const atmStrike = textify(row.ATM_Strike ?? row.ATMStrike);
    const maxPain = textify(row.MaxPain);

    return {
      Name: name,
      Symbol: symbol,
      Side: side,
      Module: textify(row.Module, "MOD"),
      Entry: numberify(row.Entry ?? row["Current Price"]),
      SL: numberify(row.SL),
      Target1: numberify(row.Target1),
      Target2: numberify(row.Target2),
      RR: textify(row.RiskReward ?? row.RR),
      Confidence: numberify(row.Confidence),
      RVOL: numberify(row.RVOL),
      PCR: pcr,
      PCRSignal: textify(row.PCR_Signal ?? row.PCRSignal ?? row.Status),
      BodyPct: numberify(row.Body_Pct ?? row.BodyPct),
      DayMovePct: numberify(row.Day_Move_Pct ?? row.DayMovePct),
      RSScore: numberify(row.RS_Score ?? row.RSScore),
      CallWall: textify(row.CallWall),
      PutWall: textify(row.PutWall),
      ATMStrike: atmStrike,
      MaxPain: maxPain,
      PEOISurge: numberify(row.PE_OI_Surge ?? row.PEOISurge),
      StrikeRec: textify(row.Strike_Rec ?? row.StrikeRec),
      Notes: textify(row.Notes),
      Sector: textify(row.Sector, "OTHER"),
      SectorTheme: truthy(row.Sector_Theme ?? row.SectorTheme),
      Direction: textify(row.Direction),
      BreakType: textify(row.BreakoutType ?? row.BreakType ?? row.Break),
      EntryTime: textify(row.EntryTime ?? row.Time),
      FiredAt: textify(row.Fired_At ?? row.FiredAt ?? row.Time),
      HasOptions: truthy(row.HasOptions) || Boolean(pcr || atmStrike || maxPain),
      SignalRank: numberify(row.SignalRank ?? row.SmartRank ?? row.Confidence, rows.length - index),
      Chart: textify(row.Chart, buildTradingViewUrl(symbol, name)),
    };
  });
}

function normalizePulseRow(input: GenericRecord): PulseRow {
  const symbol = textify(input.Symbol);
  const name = textify(input.Name, symbol || "Unnamed");
  const side = normalizeSignalSide(input.Side ?? input.Direction);

  return {
    Name: name,
    Symbol: symbol,
    Side: side === "BEAR" ? "BEAR" : "BULL",
    Module: textify(input.Module, "MOD"),
    Price: numberify(input.Price ?? input.Entry),
    Confidence: numberify(input.Confidence),
    RVOL: numberify(input.RVOL),
    PCR: numberify(input.PCR),
    PCRAtOpen: numberify(input.PCR_At_Open ?? input.PCRAtOpen),
    ATMStrike: textify(input.ATM_Strike ?? input.ATMStrike),
    RR: textify(input.RiskReward ?? input.RR),
    RSScore: numberify(input.RS_Score ?? input.RSScore),
    Time: textify(input.Fired_At ?? input.Time),
    Break: textify(input.Break, "INSIDE"),
    Chart: textify(input.Chart, buildTradingViewUrl(symbol, name)),
  };
}

export function normalizePulseData(payload: unknown): PulseData {
  const root = toRecord(payload);
  const bulls = toArray(root.bulls).map(normalizePulseRow);
  const bears = toArray(root.bears).map(normalizePulseRow);

  const watchlist: PulseWatchlistItem[] = [...bulls.slice(0, 4), ...bears.slice(0, 4)].map((row) => ({
    Symbol: row.Symbol || row.Name,
    Direction: row.Side === "BEAR" ? "SHORT" : "LONG",
    StoredAt: row.Time,
  }));

  return {
    watchlist,
    bulls,
    bears,
    bias: textify(root.bias, "NEUTRAL"),
    asOf: textify(root.asOf) || null,
  };
}

export function buildSectorData(signals: RadarSignal[]): SectorData[] {
  const groups = new Map<string, SectorData>();

  for (const signal of signals) {
    const rawSector = textify(signal.Sector, "OTHER");
    const key = rawSector.toUpperCase().replace(/\s+/g, "_");
    const existing = groups.get(key) ?? {
      key,
      label: prettySectorLabel(rawSector),
      symbols: [],
      signals: [],
      totalSignals: 0,
      bullCount: 0,
      bearCount: 0,
      avgMove: 0,
      bullRatio: 0,
      isBullish: false,
    };

    existing.totalSignals += 1;
    if (signal.Side === "BULL") {
      existing.bullCount += 1;
    }
    if (signal.Side === "BEAR") {
      existing.bearCount += 1;
    }

    if (signal.Symbol && !existing.symbols.includes(signal.Symbol)) {
      existing.symbols.push(signal.Symbol);
    }

    existing.signals.push({
      name: signal.Name,
      sym: signal.Symbol,
      side: signal.Side,
      conf: signal.Confidence,
      rvol: signal.RVOL,
      move: signal.DayMovePct,
      time: signal.FiredAt || signal.EntryTime,
      module: signal.Module,
      chart: signal.Chart,
    });

    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((sector) => {
      const moveSum = sector.signals.reduce((sum, item) => sum + item.move, 0);
      const totalDirectional = sector.bullCount + sector.bearCount;

      sector.avgMove = sector.signals.length ? moveSum / sector.signals.length : 0;
      sector.bullRatio = totalDirectional ? (sector.bullCount / totalDirectional) * 100 : 0;
      sector.isBullish = sector.bullCount >= sector.bearCount;
      sector.signals = sector.signals.sort(
        (left, right) => right.conf - left.conf || right.rvol - left.rvol,
      );

      return sector;
    })
    .sort(
      (left, right) =>
        right.totalSignals - left.totalSignals || right.bullRatio - left.bullRatio,
    );
}

export function normalizeAiPayload(payload: unknown, dateStr: string): AiPayload {
  const root = toRecord(payload);
  const picks = toArray(root.top_ai_picks).map((pick) => {
    const symbol = textify(pick.Symbol);
    const name = textify(pick.Name, symbol || "Unnamed");

    return {
      Name: name,
      Symbol: symbol,
      Side: normalizeSignalSide(pick.Side ?? pick.Direction),
      Entry: numberify(pick.Entry),
      Target: numberify(pick.Target ?? pick.Target1),
      StopLoss: numberify(pick.StopLoss ?? pick.SL),
      AI_Win_Probability: numberify(pick.AI_Win_Probability),
      Time: textify(pick.Time),
      Module: textify(pick.Module, "AI"),
      Direction: textify(pick.Direction),
      Chart: textify(pick.Chart, buildTradingViewUrl(symbol, name)),
    };
  });

  return {
    date: textify(root.date, dateStr),
    total_signals_analyzed: numberify(root.total_signals_analyzed),
    top_ai_picks: picks,
  };
}

export function normalizeFlowRadar(payload: unknown): FlowRadarRow[] {
  const rows = toArray(payload);
  
  return rows.map((row) => ({
    Symbol: textify(row.Symbol),
    Name: textify(row.Name),
    Sector: textify(row.Sector, "OTHER"),
    Engines: textify(row.Engines),
    SignalDir: textify(row.SignalDir),
    Buildup: textify(row.Buildup),
    Verdict: textify(row.Verdict, "NEUTRAL"),
    VerdictReason: textify(row.VerdictReason),
    OI: numberify(row.OI),
    OIChgPct: numberify(row.OIChgPct),
    PriceChgPct: numberify(row.PriceChgPct),
    FadeLongCandidate: truthy(row.FadeLongCandidate),
    CleanScore: numberify(row.CleanScore),
    CompositeScore: numberify(row.CompositeScore),
    StoredAt: textify(row.StoredAt),
  }));
}

export function normalizeFlowSmartlist(payload: unknown): Record<string, FlowSmartlistCategory> {
  const root = toRecord(payload);
  const result: Record<string, FlowSmartlistCategory> = {};
  
  for (const [key, value] of Object.entries(root)) {
    const category = toRecord(value);
    result[key] = {
      count: numberify(category.count),
      rows: toArray(category.rows),
      stored_at: textify(category.stored_at),
    };
  }
  
  return result;
}

export function normalizeInstitutionalWatchlist(payload: unknown): PulseData {
  const rows = toArray(payload);
  const bulls: PulseRow[] = [];
  const bears: PulseRow[] = [];

  for (const item of rows) {
    const symbol = textify(item.SK);
    const side = normalizeSignalSide(item.Direction);
    const time = textify(item.StoredAt);

    const pulseRow: PulseRow = {
      Name: symbol,
      Symbol: symbol,
      Side: side === "BEAR" ? "BEAR" : "BULL",
      Module: "PCR",
      Price: 0,
      Confidence: 0,
      RVOL: 0,
      PCR: numberify(item.PCR),
      PCRAtOpen: 0,
      ATMStrike: "-",
      RR: "-",
      RSScore: 0,
      Time: time,
      Break: "-",
      Chart: buildTradingViewUrl(symbol, symbol)
    };

    if (side === "BEAR") {
      bears.push(pulseRow);
    } else {
      bulls.push(pulseRow);
    }
  }

  return {
    watchlist: [],
    bulls,
    bears,
    bias: bulls.length >= bears.length ? "BULLISH" : "BEARISH",
    asOf: rows.length > 0 ? textify(rows[0].StoredAt) : null,
  };
}

export function normalizeRvolPulseItem(input: GenericRecord): RvolPulseItem {
  const dir = textify(input.dir).toUpperCase();
  return {
    stock: textify(input.stock),
    rms: numberify(input.rms),
    rvol: numberify(input.rvol),
    chg: numberify(input.chg),
    color: (textify(input.color) || "GRAY") as "GREEN" | "ORANGE" | "YELLOW" | "GRAY",
    dir: dir === "SHORT" ? "SHORT" : "LONG",
    signal: truthy(input.signal),
  };
}

export function normalizeRvolPulseData(payload: unknown): RvolPulseData {
  const root = toRecord(payload);
  return {
    lastUpdated: textify(root.lastUpdated) || null,
    top25Board: toArray(root.top25Board).map(normalizeRvolPulseItem),
    longBoard: toArray(root.longBoard).map(normalizeRvolPulseItem),
    shortBoard: toArray(root.shortBoard).map(normalizeRvolPulseItem),
  };
}

export function normalizeSniperSignals(payload: unknown): SniperRow[] {
  const rows = toArray(payload);

  return rows.map((row) => {
    const symbol = textify(row.Symbol);
    const name = textify(row.Name, symbol || "Unnamed");
    const direction = textify(row.Direction).toUpperCase();

    return {
      Name: name,
      Symbol: symbol,
      Direction: direction === "SHORT" ? "SHORT" : "LONG",
      SignalTime: textify(row.SignalTime),
      EntryPrice: numberify(row.EntryPrice),
      EMA9: numberify(row.EMA9),
      RVOL: numberify(row.RVOL),
      RVOL_Color: textify(row.RVOL_Color, "GRAY"),
      RMS: numberify(row.RMS),
      MaxMovePct: numberify(row.MaxMove_Pct),
      Chart: buildTradingViewUrl(symbol, name),
      TriggerMode: textify(row.TriggerMode),
      Conviction: numberify(row.Conviction),
      Sector: textify(row.Sector, "OTHER"),
      RSScore: numberify(row.RS_Score),
      SectorPressure: numberify(row.SectorPressure),
      CompositeScore: numberify(row.CompositeScore),
      IsBestInSector: truthy(row.IsBestInSector),
      IsTopMover: truthy(row.IsTopMover),
      EarlyAbsPct: numberify(row.EarlyAbsPct),
      EarlyRVOL: numberify(row.EarlyRVOL),
      B0_Range_Pct: numberify(row.B0_Range_Pct),
      B0_CloseStr: numberify(row.B0_CloseStr),
      PDRange_Pct: numberify(row.PDRange_Pct),
      Open_vs_Ref: numberify(row.Open_vs_Ref),
    };
  });
}
export function normalizeObSignals(payload: unknown): ObSignalRow[] {
  const rows = toArray(payload);

  return rows.map((row) => {
    const symbol = textify(row.Symbol);
    const name = textify(row.Name, symbol || "Unnamed");
    const direction = textify(row.Direction).toUpperCase();
    const side = direction.includes("BULL") ? "BULL" : direction.includes("BEAR") ? "BEAR" : "NEUTRAL";

    return {
      Name: name,
      Symbol: symbol,
      Side: side as "BULL" | "BEAR" | "NEUTRAL",
      Direction: direction,
      SignalTime: textify(row.Signal_Time),
      Entry: numberify(row.Entry),
      PDL: numberify(row.PDL),
      PDH: numberify(row.PDH),
      PDL_Brk_Pct: numberify(row.PDL_Brk_Pct),
      OB_High: numberify(row.OB_High),
      OB_Low: numberify(row.OB_Low),
      OB_Pen_Pct: numberify(row.OB_Pen_Pct),
      Gap_Pct: numberify(row.Gap_Pct),
      Score: numberify(row.Score),
      OB_Date: textify(row.OB_Date),
      FiredAt: textify(row.Fired_At),
      RMS: numberify(row.RMS),
      Sector: textify(row.Sector),
      Sector_RMS_Rank: numberify(row.Sector_RMS_Rank),
      Sector_Size: numberify(row.Sector_Size),
      Chart: buildTradingViewUrl(symbol, name),
    };
  });
}


export function normalizeCapitulationSignals(payload: unknown): CapitulationRow[] {
  const rows = toArray(payload);

  return rows.map((row) => {
    const symbol = textify(row.Symbol);
    const name = textify(row.Name, symbol || "Unnamed");
    const direction = textify(row.Direction).toUpperCase();

    return {
      Name: name,
      Symbol: symbol,
      Direction: direction === "SHORT" ? "SHORT" : direction === "LONG" ? "LONG" : "NEUTRAL",
      SignalTime: textify(row.Signal_Time),
      EntryPrice: numberify(row.Entry),
      Triggers: textify(row.Triggers),
      Chart: buildTradingViewUrl(symbol, name),
    };
  });
}

export function normalizeV6Signals(payload: unknown): V6Row[] {
  const rows = toArray(payload);

  return rows.map((row) => {
    const symbol = textify(row.Symbol ?? row.Name);
    const name = textify(row.Name, symbol || "Unnamed");
    const direction = textify(row.Direction).toUpperCase();

    return {
      Name: name,
      Symbol: symbol,
      Direction: direction === "SHORT" ? "SHORT" : direction === "LONG" ? "LONG" : textify(row.Side, "NEUTRAL"),
      Lane: textify(row.Lane, "CONVICTION"),
      ScoreV3: numberify(row.ScoreV3),
      Entry: numberify(row.Entry),
      SL: numberify(row.SL),
      Target1: numberify(row.Target1),
      RiskReward: textify(row.RiskReward ?? row.RR),
      ConvCandleTime: textify(row.ConvCandleTime),
      EntryTime: textify(row.EntryTime),
      VolExp: numberify(row.VolExp),
      RVOL_hist: numberify(row.RVOL_hist),
      Confluence: numberify(row.Confluence),
      CoilBars: numberify(row.CoilBars),
      DelayBars: numberify(row.DelayBars),
      ConvBR: numberify(row.ConvBR),
      ORL_Held: textify(row.ORL_Held),
      Broke: textify(row.Broke),
      PremiumQualified: textify(row.PremiumQualified),
      Chart: textify(row.Chart, buildTradingViewUrl(symbol, name)),
    };
  });
}

export type PantherRow = {
  ts: number;
  time: string;
  side: "LONG" | "SHORT" | "NEUTRAL";
  k_level: string;
  instrument_key: string;
  name: string;
  entry: number;
  surge: number;
  win60s_cr: number;
  spread_bps: number;
  spread_vs_norm: number;
  source: string;
  Chart: string;
  aligator?: string;
  cap?: any;
  mass_cr?: any;
  delta?: any;
  imb?: any;
  event?: any;
  detail?: any;
  // SERVAL causal fields
  flag_time?: any;
  dpoc?: any;
  vol_ahead?: any;
  rvol?: any;
  chg_pct?: any;
  rt5?: any;
  atr?: any;
  dyn_ratio?: any;
  tier?: any;
  target?: any;
  stop?: any;
  // CARACAL v3 ("skeleton") fields -- published by caracal3_live_scanner.py.
  // WATCH/FLAG rows carry `level` (the broken prev-day body level); ENTRY rows
  // carry pullback_hm / pre_pullback_ext (+ dpoc / vol_ahead, already above).
  level?: any;
  watch_time?: any;
  pullback_hm?: any;
  pre_pullback_ext?: any;
  first3_level?: any;
  // FABLE paper-bot fields
  kind?: any;
  signal_id?: any;
  reason?: any;
  entry_fill?: any;
  lot?: any;
  pnl?: any;
  u_entry?: any;
  u_target?: any;
  u_stop?: any;
  underlying?: any;
  // AFAC.2 snapshot fields
  rows?: any;
  sectors?: any;
  // Smart List snapshot fields
  category?: any;
  count?: any;
  // STRIKE picker + paper-bot fields. normalizePantherSignals rebuilds every
  // row from an explicit key list, so a field absent from BOTH this type and
  // that list is dropped in transit -- which is how /strike shipped rendering
  // em-dashes for every number on 2026-08-06.
  spot?: any;
  day_open?: any;
  moved_pct?: any;
  strike?: any;
  otm_pct?: any;
  prem?: any;
  bid?: any;
  ask?: any;
  cost_lot?: any;
  expiry?: any;
  opt_key?: any;
  opt_symbol?: any;
  tier_note?: any;
  why?: any;
  u_symbol?: any;
  slip_pct?: any;
  ref_prem?: any;
  held_min?: any;
};

export function normalizePantherSignals(payload: unknown): PantherRow[] {
  const rows = toArray(payload);

  return rows.map((row) => {
    const symbol = textify(row.name || row.stock);
    const sideRaw = textify(row.side).toUpperCase();
    const side = sideRaw === "SHORT" ? "SHORT" : sideRaw === "LONG" ? "LONG" : "NEUTRAL";

    return {
      ts: numberify(row.ts, 0),
      time: textify(row.time || row.sig_time),
      side,
      k_level: textify(row.k_level, "K6"),
      instrument_key: textify(row.instrument_key || ""),
      name: symbol,
      entry: numberify(row.entry),
      surge: numberify(row.surge),
      win60s_cr: numberify(row.win60s_cr),
      spread_bps: numberify(row.spread_bps),
      spread_vs_norm: numberify(row.spread_vs_norm),
      source: textify(row.source, "panther"),
      Chart: buildTradingViewUrl(symbol, symbol),
      aligator: textify(row.aligator),
      // Preserve Caps fields so they aren't stripped before hitting the frontend
      cap: row.cap,
      mass_cr: row.mass_cr,
      delta: row.delta,
      imb: row.imb,
      // Preserve CARACAL event-stream fields
      event: row.event,
      detail: row.detail,
      // Preserve SERVAL causal fields
      flag_time: row.flag_time,
      dpoc: row.dpoc,
      vol_ahead: row.vol_ahead,
      rvol: row.rvol,
      chg_pct: row.chg_pct,
      rt5: row.rt5,
      atr: row.atr,
      dyn_ratio: row.dyn_ratio,
      tier: row.tier,
      target: row.target,
      stop: row.stop,
      // Preserve CARACAL v3 skeleton fields
      level: row.level,
      watch_time: row.watch_time,
      pullback_hm: row.pullback_hm,
      pre_pullback_ext: row.pre_pullback_ext,
      first3_level: row.first3_level,
      // Preserve FABLE paper-bot fields
      kind: row.kind,
      signal_id: row.signal_id,
      reason: row.reason,
      entry_fill: row.entry_fill,
      lot: row.lot,
      pnl: row.pnl,
      u_entry: row.u_entry,
      u_target: row.u_target,
      u_stop: row.u_stop,
      underlying: row.underlying,
      // Preserve AFAC.2 snapshot fields
      rows: row.rows,
      sectors: row.sectors,
      // Preserve Smart List snapshot fields (Upstox smartlist buckets)
      category: row.category,
      count: row.count,
      // Preserve STRIKE picker + paper-bot fields.
      //
      // This normalizer REBUILDS each row from an explicit key list, so any
      // field not named here is silently dropped. On 2026-08-06 the /strike
      // page went live rendering em-dashes for every number: strike_scan.py
      // was publishing spot/strike/otm_pct/prem/cost_lot correctly and they
      // were reaching PANTHER, but none of them survived this function. Only
      // side/name/tier/lot rendered because those happened to already be
      // listed. Any NEW publisher must add its fields here.
      spot: row.spot,
      day_open: row.day_open,
      moved_pct: row.moved_pct,
      strike: row.strike,
      otm_pct: row.otm_pct,
      prem: row.prem,
      bid: row.bid,
      ask: row.ask,
      cost_lot: row.cost_lot,
      expiry: row.expiry,
      opt_key: row.opt_key,
      opt_symbol: row.opt_symbol,
      tier_note: row.tier_note,
      why: row.why,
      u_symbol: row.u_symbol,
      slip_pct: row.slip_pct,
      ref_prem: row.ref_prem,
      held_min: row.held_min,
      // Preserve LYNX snapshot fields. Hit by the trap the STRIKE note above
      // describes, on 2026-08-16: LYNX published cut/universe/gated/
      // config_session/stale/scoring/replay correctly and they reached PANTHER,
      // but none survived here. `rows` did (it was already listed for AFAC.2),
      // so the cards rendered while every header value came back undefined --
      // and the trail's column labels printed "fined", which is
      // "undefined".slice(-5). The snapshot's own `cut` being lost also broke
      // the page's sort, so it selected the 09:45 doc as "latest".
      cut: row.cut,
      universe: row.universe,
      gated: row.gated,
      config_session: row.config_session,
      stale: row.stale,
      scoring: row.scoring,
      replay: row.replay,
    };
  });
}
