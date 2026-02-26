import type { RadarStock, SectorStrength } from '../types/radar';
import { resolveTickerSymbol } from './tradingview';

// Mirror the Streamlit SECTOR_MAP so sector buckets are consistent.
const SECTOR_MAP_RAW: Record<string, string> = {
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', AXISBANK: 'Banking',
  KOTAKBANK: 'Banking', INDUSINDBK: 'Banking', BANKBARODA: 'Banking', PNB: 'Banking',
  AUBANK: 'Banking', BANDHANBNK: 'Banking', FEDERALBNK: 'Banking', IDFCFIRSTB: 'Banking',
  RBLBANK: 'Banking',

  BAJFINANCE: 'Finance', BAJAJFINSV: 'Finance', CHOLAFIN: 'Finance', SHRIRAMFIN: 'Finance',
  MUTHOOTFIN: 'Finance', SBICARD: 'Finance', PEL: 'Finance', MANAPPURAM: 'Finance',
  'L&TFH': 'Finance', 'M&MFIN': 'Finance', PFC: 'Finance', RECLTD: 'Finance', LTF: 'Finance',

  TCS: 'IT', INFY: 'IT', HCLTECH: 'IT', WIPRO: 'IT', TECHM: 'IT', LTIM: 'IT',
  LTTS: 'IT', PERSISTENT: 'IT', COFORGE: 'IT', MPHASIS: 'IT', TATAELXSI: 'IT',
  OFSS: 'IT', KPITTECH: 'IT',

  MARUTI: 'Auto', TATAMOTORS: 'Auto', 'M&M': 'Auto', 'BAJAJ-AUTO': 'Auto', EICHERMOT: 'Auto',
  HEROMOTOCO: 'Auto', TVSMOTOR: 'Auto', ASHOKLEY: 'Auto', BHARATFORG: 'Auto',
  BALKRISIND: 'Auto', MRF: 'Auto', APOLLOTYRE: 'Auto', MOTHERSON: 'Auto', BOSCHLTD: 'Auto',

  RELIANCE: 'Oil & Gas', ONGC: 'Oil & Gas', BPCL: 'Oil & Gas', IOC: 'Oil & Gas', HPCL: 'Oil & Gas',
  GAIL: 'Oil & Gas', PETRONET: 'Oil & Gas',

  NTPC: 'Power', POWERGRID: 'Power', TATAPOWER: 'Power', ADANIGREEN: 'Power',
  ADANIENSOL: 'Power', JSWENERGY: 'Power', NHPC: 'Power',

  ITC: 'FMCG', HINDUNILVR: 'FMCG', NESTLEIND: 'FMCG', BRITANNIA: 'FMCG', TATACONSUM: 'FMCG',
  DABUR: 'FMCG', GODREJCP: 'FMCG', MARICO: 'FMCG', COLPAL: 'FMCG', VBL: 'FMCG',

  ASIANPAINT: 'Consumer', BERGEPAINT: 'Consumer', PIDILITIND: 'Consumer', TITAN: 'Consumer',
  HAVELLS: 'Consumer', VOLTAS: 'Consumer', WHIRLPOOL: 'Consumer', PAGEIND: 'Consumer', TRENT: 'Consumer',

  SUNPHARMA: 'Pharma', CIPLA: 'Pharma', DRREDDY: 'Pharma', DIVISLAB: 'Pharma', TORNTPHARM: 'Pharma',
  LUPIN: 'Pharma', AUROPHARMA: 'Pharma', ALKEM: 'Pharma', BIOCON: 'Pharma', SYNGENE: 'Pharma',
  GLENMARK: 'Pharma', GRANULES: 'Pharma', LAURUSLABS: 'Pharma',

  APOLLOHOSP: 'Healthcare', METROPOLIS: 'Healthcare', LALPATHLAB: 'Healthcare',

  TATASTEEL: 'Metals', JSWSTEEL: 'Metals', HINDALCO: 'Metals', VEDL: 'Metals', JINDALSTEL: 'Metals',
  SAIL: 'Metals', NMDC: 'Metals', NATIONALUM: 'Metals', COALINDIA: 'Metals', HINDZINC: 'Metals',

  DLF: 'Realty', GODREJPROP: 'Realty', OBEROIRLTY: 'Realty', PHOENIXLTD: 'Realty', PRESTIGE: 'Realty',
  LODHA: 'Realty',

  LT: 'Infra', ADANIPORTS: 'Infra',
  HAL: 'Defence', BEL: 'Defence', MAZDOCK: 'Defence', COCHINSHIP: 'Defence', BDL: 'Defence',
  IRCTC: 'Railways', CONCOR: 'Logistics', INDIGO: 'Aviation',
  ADANIENT: 'Diversified',
};

const KEYWORD_MAP: [string, string][] = [
  ['BANK', 'Banking'],
  ['FINANCE', 'Finance'],
  ['NBFC', 'Finance'],
  ['CAPITAL', 'Finance'],
  ['INSURANCE', 'Finance'],
  ['LIFE', 'Finance'],
  ['TECH', 'IT'],
  ['INFOTECH', 'IT'],
  ['SOFTWARE', 'IT'],
  ['MOTOR', 'Auto'],
  ['AUTO', 'Auto'],
  ['VEHICLE', 'Auto'],
  ['PHARMA', 'Pharma'],
  ['LAB', 'Pharma'],
  ['HEALTH', 'Healthcare'],
  ['HOSPITAL', 'Healthcare'],
  ['STEEL', 'Metals'],
  ['METAL', 'Metals'],
  ['ALUM', 'Metals'],
  ['ZINC', 'Metals'],
  ['OIL', 'Oil & Gas'],
  ['PETRO', 'Oil & Gas'],
  ['GAS', 'Oil & Gas'],
  ['POWER', 'Power'],
  ['ENERGY', 'Power'],
  ['GRID', 'Power'],
  ['FMCG', 'FMCG'],
  ['CONSUMER', 'Consumer'],
  ['RETAIL', 'Consumer'],
  ['FOOD', 'Consumer'],
  ['REALTY', 'Realty'],
  ['ESTATE', 'Realty'],
  ['PROPERTY', 'Realty'],
  ['INFRA', 'Infra'],
  ['RAIL', 'Railways'],
  ['LOGISTIC', 'Logistics'],
  ['AIRPORT', 'Aviation'],
  ['AVIATION', 'Aviation'],
  ['DEFENCE', 'Defence'],
  ['DEFENSE', 'Defence'],
];

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[%+,]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function normalizeTicker(value: string): string {
  return value
    .toUpperCase()
    .replace(/^(NSE:|BSE:)/, '')
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(LTD|LIMITED|INC|CORP|CORPN|CORPORATION)$/, '')
    .trim();
}

const SECTOR_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SECTOR_MAP_RAW).map(([ticker, sector]) => [normalizeTicker(ticker), sector]),
);

function matchKeywordSector(norm: string): string | null {
  for (const [kw, sector] of KEYWORD_MAP) {
    if (norm.includes(kw)) return sector;
  }
  return null;
}

function inferSector(stock: RadarStock): string {
  const name = asString(stock.Name);
  const correctedTicker = resolveTickerSymbol(name);
  const tvSymbol = asString(stock['TV_Symbol']).replace(/^NSE:/i, '');
  const symbol = asString(stock['symbol']) || asString(stock['Symbol']);

  const tickerCandidates = [correctedTicker, tvSymbol, symbol, name];
  for (const candidate of tickerCandidates) {
    const normalized = normalizeTicker(candidate);
    if (normalized && SECTOR_MAP[normalized]) return SECTOR_MAP[normalized];
  }

  const direct = (typeof stock.Sector === 'string' && stock.Sector.trim())
    || (typeof stock.sector === 'string' && stock.sector.trim())
    || (typeof stock.Industry === 'string' && stock.Industry.trim())
    || (typeof stock.industry === 'string' && stock.industry.trim());
  if (direct) {
    const directMatch = matchKeywordSector(normalizeTicker(direct));
    return directMatch ?? direct;
  }

  const keywordMatch = matchKeywordSector(normalizeTicker(name));
  return keywordMatch ?? 'Others';
}

export function buildSectorData(data: RadarStock[]): SectorStrength[] {
  if (!data.length) return [];

  const grouped = new Map<string, RadarStock[]>();
  for (const stock of data) {
    const sec = inferSector(stock);
    const list = grouped.get(sec) ?? [];
    list.push(stock);
    grouped.set(sec, list);
  }

  const sectors: SectorStrength[] = Array.from(grouped.entries()).map(([name, stocks]) => {
    const oiVals = stocks.map(s => toNumber(s.OI ?? s['OI %']));
    const avgOi = oiVals.reduce((a, b) => a + b, 0) / Math.max(oiVals.length, 1);
    const bullRatio = oiVals.filter(v => v > 0).length / Math.max(oiVals.length, 1);
    const strength = Number((avgOi * 0.6 + (bullRatio - 0.5) * 30).toFixed(2));

    return {
      name,
      strength,
      stocks: [...stocks].sort((a, b) => toNumber(b.Signal_Generated_Score) - toNumber(a.Signal_Generated_Score)),
      count: stocks.length,
      avgOi,
      bullRatio,
    };
  });

  return sectors.sort((a, b) => b.strength - a.strength);
}
