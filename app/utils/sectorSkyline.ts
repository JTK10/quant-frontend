import type { RadarStock, SectorStrength } from '../types/radar';
import { computeSignalEdge, resolveSignalSide, toNumber } from './scanner';
import { getTradingViewUrl, resolveTickerSymbol } from './tradingview';

type SectorDefinition = {
  key: string;
  label: string;
  symbols: string[];
};

const SECTOR_DEFINITIONS: SectorDefinition[] = [
  {
    key: 'PSU_POWER',
    label: 'PSU Power',
    symbols: ['NTPC', 'POWERGRID', 'NHPC', 'RECLTD', 'PFC', 'TORNTPOWER', 'ADANIGREEN', 'IREDA', 'INOXWIND', 'SUZLON', 'JSWENERGY', 'TATAPOWER', 'COALINDIA'],
  },
  {
    key: 'METALS',
    label: 'Metals',
    symbols: ['HINDALCO', 'HINDZINC', 'NATIONALUM', 'TATASTEEL', 'JSWSTEEL', 'SAIL', 'JINDALSTEL', 'VEDL', 'NMDC'],
  },
  {
    key: 'BANKS',
    label: 'Banks',
    symbols: ['HDFCBANK', 'ICICIBANK', 'AXISBANK', 'KOTAKBANK', 'SBIN', 'INDUSINDBK', 'FEDERALBNK', 'CANBK', 'BANDHANBNK', 'IDFCFIRSTB', 'YESBANK', 'RBLBANK'],
  },
  {
    key: 'AUTO',
    label: 'Auto',
    symbols: ['MARUTI', 'TVSMOTOR', 'BAJAJ-AUTO', 'EICHERMOT', 'TATAMOTORS', 'HEROMOTOCO', 'ASHOKLEY', 'M&M'],
  },
  {
    key: 'IT',
    label: 'IT',
    symbols: ['INFY', 'TCS', 'WIPRO', 'TECHM', 'HCLTECH', 'LTIM', 'COFORGE', 'PERSISTENT', 'MPHASIS'],
  },
  {
    key: 'PHARMA',
    label: 'Pharma',
    symbols: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'LUPIN', 'DIVISLAB', 'BIOCON', 'AUROPHARMA', 'ALKEM'],
  },
  {
    key: 'FMCG',
    label: 'FMCG',
    symbols: ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'GODREJCP', 'COLPAL'],
  },
  {
    key: 'INFRA',
    label: 'Infra',
    symbols: ['LT', 'ABB', 'SIEMENS', 'BHEL', 'BEL', 'HAL', 'BDL', 'MAZDOCK', 'POLYCAB', 'HAVELLS', 'AMBER', 'KAYNES', 'BLUESTARCO'],
  },
  {
    key: 'REALTY',
    label: 'Realty',
    symbols: ['DLF', 'LODHA', 'GODREJPROP', 'OBEROIRLTY', 'PHOENIXLTD', 'PRESTIGE', 'HUDCO'],
  },
  {
    key: 'NBFC',
    label: 'NBFC',
    symbols: ['BAJFINANCE', 'BAJAJFINSV', 'CHOLAFIN', 'LTF', 'SHRIRAMFIN', 'MUTHOOTFIN', 'MANAPPURAM'],
  },
  {
    key: 'OIL_GAS',
    label: 'Oil & Gas',
    symbols: ['RELIANCE', 'ONGC', 'IOC', 'BPCL', 'HINDPETRO', 'GAIL', 'OIL', 'PETRONET'],
  },
  {
    key: 'CEMENT',
    label: 'Cement',
    symbols: ['ULTRACEMCO', 'AMBUJACEM', 'SHREECEM', 'GRASIM'],
  },
  {
    key: 'CONSUMER',
    label: 'Consumer',
    symbols: ['TITAN', 'DMART', 'TRENT', 'VBL'],
  },
];

const UNMAPPED_SECTOR: SectorDefinition = {
  key: 'UNMAPPED',
  label: 'Unmapped',
  symbols: [],
};

function normalizeTicker(value: string): string {
  return value
    .toUpperCase()
    .replace(/^(NSE:|BSE:)/, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function normalizeSectorKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const TICKER_TO_SECTOR = new Map<string, SectorDefinition>();
const SECTOR_KEY_LOOKUP = new Map<string, SectorDefinition>();

for (const definition of SECTOR_DEFINITIONS) {
  SECTOR_KEY_LOOKUP.set(normalizeSectorKey(definition.key), definition);
  SECTOR_KEY_LOOKUP.set(normalizeSectorKey(definition.label), definition);

  for (const symbol of definition.symbols) {
    TICKER_TO_SECTOR.set(normalizeTicker(symbol), definition);
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveStockTicker(stock: RadarStock): string {
  const name = asString(stock.Name);
  const directSymbol = asString(stock.Symbol);
  const ticker =
    directSymbol ||
    asString(stock.Ticker) ||
    asString(stock.TV_Symbol).replace(/^NSE:/i, '') ||
    resolveTickerSymbol(name);

  return ticker;
}

function resolveSectorDefinition(stock: RadarStock): SectorDefinition | null {
  for (const rawSector of [asString(stock.Sector), asString(stock.sector), asString(stock.Industry), asString(stock.industry)]) {
    if (!rawSector) continue;
    const match = SECTOR_KEY_LOOKUP.get(normalizeSectorKey(rawSector));
    if (match) return match;
  }

  for (const candidate of [resolveStockTicker(stock), asString(stock.Name)]) {
    const normalized = normalizeTicker(candidate);
    if (!normalized) continue;
    const match = TICKER_TO_SECTOR.get(normalized);
    if (match) return match;
  }

  return null;
}

function getStockEdge(stock: RadarStock): number {
  const existing = toNumber(stock.SignalEdge);
  if (existing !== 0) return existing;

  const fallback = computeSignalEdge(stock as Record<string, unknown>);
  if (fallback !== 0) return fallback;

  const confidence = toNumber(stock.Confidence ?? stock.Signal_Generated_Score ?? stock.SignalRank);
  const side = resolveSignalSide(stock as Record<string, unknown>);
  const direction = side === 'BEARISH' ? -1 : 1;
  return Number((direction * confidence).toFixed(2));
}

function withDerivedSignalFields(stock: RadarStock, definition: SectorDefinition | null): RadarStock {
  const ticker = resolveStockTicker(stock);
  const name = asString(stock.Name);
  const chart = asString(stock.Chart) || (name || ticker ? getTradingViewUrl(name || ticker) : '');

  return {
    ...stock,
    Ticker: ticker,
    Symbol: asString(stock.Symbol) || ticker,
    Sector: definition?.label ?? UNMAPPED_SECTOR.label,
    SignalEdge: getStockEdge(stock),
    Chart: chart,
  };
}

function buildSectorStrength(definition: SectorDefinition, stocks: RadarStock[]): SectorStrength {
  const enrichedStocks = [...stocks].sort((a, b) => Math.abs(toNumber(b.SignalEdge)) - Math.abs(toNumber(a.SignalEdge)));
  const edgeValues = enrichedStocks.map((stock) => toNumber(stock.SignalEdge));
  const avgEdge =
    edgeValues.reduce((sum, value) => sum + value, 0) /
    Math.max(edgeValues.length, 1);
  const bullishCount = edgeValues.filter((value) => value > 0).length;
  const bearishCount = edgeValues.filter((value) => value < 0).length;
  const bullRatio = bullishCount / Math.max(edgeValues.length, 1);

  return {
    key: definition.key,
    name: definition.label,
    strength: Number(avgEdge.toFixed(2)),
    stocks: enrichedStocks,
    count: enrichedStocks.length,
    avgEdge: Number(avgEdge.toFixed(2)),
    bullRatio,
    bullishCount,
    bearishCount,
    trackedSymbols: definition.symbols,
    trackedCount: definition.symbols.length,
  };
}

export function compareSectorStrength(a: SectorStrength, b: SectorStrength): number {
  const activeDiff = (b.count ?? b.stocks.length) - (a.count ?? a.stocks.length);
  if (activeDiff !== 0) return activeDiff;

  const towerDiff = Math.abs(b.strength) - Math.abs(a.strength);
  if (towerDiff !== 0) return towerDiff;

  const signedDiff = b.strength - a.strength;
  if (signedDiff !== 0) return signedDiff;

  return a.name.localeCompare(b.name);
}

export function buildSectorData(data: RadarStock[]): SectorStrength[] {
  const grouped = new Map<string, RadarStock[]>();

  for (const definition of SECTOR_DEFINITIONS) {
    grouped.set(definition.key, []);
  }

  const unmappedStocks: RadarStock[] = [];

  for (const stock of data) {
    const definition = resolveSectorDefinition(stock);
    const enriched = withDerivedSignalFields(stock, definition);

    if (!definition) {
      unmappedStocks.push(enriched);
      continue;
    }

    grouped.get(definition.key)?.push(enriched);
  }

  const sectors = SECTOR_DEFINITIONS
    .map((definition) => buildSectorStrength(definition, grouped.get(definition.key) ?? []));

  if (unmappedStocks.length > 0) {
    sectors.push(buildSectorStrength(UNMAPPED_SECTOR, unmappedStocks));
  }

  return sectors.sort(compareSectorStrength);
}
