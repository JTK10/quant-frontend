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
  PDL_Break: string;
  PDH_Break: string;
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

type BackendRoute = "smart-radar" | "market-velocity" | "ai-signals" | "sector-heatmap" | "sector-sentiment" | "institutional-watchlist" | "rvol-pulse" | "sniper-signal" | "ob-signal" | "capitulation-signal" | "v6-signals";

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
      PDL_Break: textify(row.PDL_Break),
      PDH_Break: textify(row.PDH_Break),
    };
  });
}

