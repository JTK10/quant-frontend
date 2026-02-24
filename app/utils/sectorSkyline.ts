import type { RadarStock, SectorStrength } from '../types/radar';

/* ── Direct ticker → sector map (covers ~200 common NSE stocks) ── */
const TICKER_MAP: Record<string, string> = {
  // Banking
  HDFCBANK:'Banking', ICICIBANK:'Banking', SBIN:'Banking', KOTAKBANK:'Banking',
  AXISBANK:'Banking', INDUSINDBK:'Banking', BANKBARODA:'Banking', BANKINDIA:'Banking',
  PNB:'Banking', CANBK:'Banking', UNIONBANK:'Banking', INDIANB:'Banking',
  IDFCFIRSTB:'Banking', FEDERALBNK:'Banking', RBLBANK:'Banking', BANDHANBNK:'Banking',
  AUBANK:'Banking', YESBANK:'Banking', JKBANK:'Banking', DCBBANK:'Banking',

  // Financials / NBFC
  BAJFINANCE:'Financials', BAJAJFINSV:'Financials', CHOLAFIN:'Financials',
  MUTHOOTFIN:'Financials', MANAPPURAM:'Financials', SHRIRAMFIN:'Financials',
  LICHSGFIN:'Financials', PNBHOUSING:'Financials', IIFL:'Financials',
  LTF:'Financials', ABCAPITAL:'Financials', JIOFIN:'Financials',
  ANGELONE:'Financials', NUVAMA:'Financials', MCX:'Financials',
  BSE:'Financials', CDSL:'Financials', KFINTECH:'Financials',
  CAMS:'Financials', '360ONE':'Financials',

  // Insurance
  SBILIFE:'Insurance', HDFCLIFE:'Insurance', ICICIPRULI:'Insurance',
  ICICIGI:'Insurance', LICI:'Insurance', MFSL:'Insurance', POLICYBZR:'Insurance',
  SBICARD:'Insurance',

  // IT & Technology
  TCS:'IT', INFY:'IT', WIPRO:'IT', HCLTECH:'IT', TECHM:'IT',
  LTIM:'IT', MPHASIS:'IT', COFORGE:'IT', PERSISTENT:'IT',
  TATATECH:'IT', KPITTECH:'IT', OFSS:'IT', NAUKRI:'IT',
  PAYTM:'IT', DIXON:'IT', KAYNES:'IT',

  // Automobile
  MARUTI:'Auto', TATAMOTORS:'Auto', M_M:'Auto', 'M&M':'Auto',
  BAJAJ_AUTO:'Auto', 'BAJAJ-AUTO':'Auto', BAJAJAUT:'Auto', EICHERMOT:'Auto',
  HEROMOTOCO:'Auto', TVSMOTOR:'Auto', ASHOKLEY:'Auto', MOTHERSON:'Auto',
  BOSCHLTD:'Auto', EXIDEIND:'Auto', SONACOMS:'Auto', UNOMINDA:'Auto',
  TIINDIA:'Auto', BHARATFORG:'Auto', AMARAJABAT:'Auto', OLECTRA:'Auto',

  // Pharma & Healthcare
  SUNPHARMA:'Pharma', DRREDDY:'Pharma', CIPLA:'Pharma', LUPIN:'Pharma',
  DIVISLAB:'Pharma', AUROPHARMA:'Pharma', BIOCON:'Pharma', ALKEM:'Pharma',
  TORNTPHARM:'Pharma', GLENMARK:'Pharma', LAURUSLABS:'Pharma',
  ZYDUSLIFE:'Pharma', MANKIND:'Pharma', IPCALAB:'Pharma',
  APOLLOHOSP:'Healthcare', FORTIS:'Healthcare', SYNGENE:'Healthcare',
  MAXHEALTH:'Healthcare', METROPOLIS:'Healthcare', LALPATHLAB:'Healthcare',

  // Metals & Mining
  TATASTEEL:'Metals', JSWSTEEL:'Metals', SAIL:'Metals', HINDALCO:'Metals',
  VEDL:'Metals', NATIONALUM:'Metals', NMDC:'Metals', HINDZINC:'Metals',
  COALINDIA:'Metals', JINDALSTEL:'Metals', APLAPOLLO:'Metals',

  // Energy / Oil & Gas
  ONGC:'Energy', IOC:'Energy', BPCL:'Energy', HINDPETRO:'Energy',
  GAIL:'Energy', OIL:'Energy', PETRONET:'Energy', IEX:'Energy',

  // Power & Utilities
  NTPC:'Power', POWERGRID:'Power', TATAPOWER:'Power', ADANIGREEN:'Power',
  ADANIENSOL:'Power', TORNTPOWER:'Power', NHPC:'Power', SJVN:'Power',
  CESC:'Power', RECLTD:'Power', PFC:'Power', HUDCO:'Power',
  IREDA:'Power', INOXWIND:'Power', SUZLON:'Power', WAAREEENER:'Power',
  JSWENERGY:'Power',

  // FMCG
  HINDUNILVR:'FMCG', ITC:'FMCG', NESTLEIND:'FMCG', BRITANNIA:'FMCG',
  DABUR:'FMCG', MARICO:'FMCG', COLPAL:'FMCG', GODREJCP:'FMCG', EMAMI:'FMCG',
  TATACONSUM:'FMCG', PATANJALI:'FMCG',

  // Consumer Discretionary
  TITAN:'Consumer', TRENT:'Consumer', DMART:'Consumer', VBL:'Consumer',
  UNITDSPR:'Consumer', JUBLFOOD:'Consumer', KALYANKJIL:'Consumer',
  NYKAA:'Consumer', SHOPERSTOP:'Consumer', PVRINOX:'Consumer',

  // Infrastructure / Construction
  LT:'Infrastructure', ADANIENT:'Infrastructure', ADANIPORTS:'Infrastructure',
  RVNL:'Infrastructure', IRFC:'Infrastructure',
  NBCC:'Infrastructure', GMRAIRPORT:'Infrastructure', BDL:'Infrastructure',
  CONCOR:'Infrastructure', NCC:'Infrastructure', KEC:'Infrastructure',
  PNCINFRA:'Infrastructure', HGINFRA:'Infrastructure',

  // Real Estate
  DLF:'Real Estate', GODREJPROP:'Real Estate', OBEROIRLTY:'Real Estate',
  PRESTIGE:'Real Estate', PHOENIXLTD:'Real Estate', LODHA:'Real Estate',
  BRIGADE:'Real Estate', SOBHA:'Real Estate',

  // Cement
  ULTRACEMCO:'Cement', SHREECEM:'Cement', AMBUJACEM:'Cement',
  GRASIM:'Cement', DALBHARAT:'Cement', JKCEMENT:'Cement',

  // Defense & Aerospace
  HAL:'Defense', BEL:'Defense', MAZDOCK:'Defense', BHEL:'Defense',
  COCHINSHIP:'Defense', MIDHANI:'Defense', PARAS:'Defense',

  // Capital Goods / Industrials
  CGPOWER:'Industrials', ABB:'Industrials', SIEMENS:'Industrials',
  CUMMINSIND:'Industrials', HAVELLS:'Industrials', POLYCAB:'Industrials',
  KEI:'Industrials', POWERINDIA:'Industrials', CROMPTON:'Industrials',
  BLUESTARCO:'Industrials', VOLTAS:'Industrials', AMBERENTER:'Industrials',
  THERMAX:'Industrials',

  // Telecom
  BHARTIARTL:'Telecom', IDEA:'Telecom',

  // Chemicals & Specialty
  PIDILITIND:'Chemicals', SRF:'Chemicals', PIIND:'Chemicals',
  UPL:'Chemicals', SOLARINDS:'Chemicals', ASTRAL:'Chemicals',
  AARTI:'Chemicals', DEEPAKNTR:'Chemicals', VINATIORGA:'Chemicals',
  TATACHEM:'Chemicals',

  // Paints
  ASIANPAINT:'Paints', BERGEPAINT:'Paints', AKZONOBEL:'Paints',

  // Logistics
  DELHIVERY:'Logistics', VRL:'Logistics', BLUEDART:'Logistics',

  // Travel & Hospitality
  INDIGO:'Travel', IRCTC:'Travel', MAHINDHOST:'Travel',
};

/* ── Keyword fallback (normalized name substring match) ── */
const KEYWORD_MAP: [string, string][] = [
  ['BANK',       'Banking'],
  ['FINANCE',    'Financials'],
  ['NBFC',       'Financials'],
  ['CAPITAL',    'Financials'],
  ['INSURANCE',  'Insurance'],
  ['LIFE',       'Insurance'],
  ['TECH',       'IT'],
  ['INFOTECH',   'IT'],
  ['SOFTWARE',   'IT'],
  ['DIGITAL',    'IT'],
  ['SYSTEM',     'IT'],
  ['MOTOR',      'Auto'],
  ['AUTO',       'Auto'],
  ['VEHICLE',    'Auto'],
  ['TRACTOR',    'Auto'],
  ['PHARMA',     'Pharma'],
  ['LAB',        'Pharma'],
  ['MEDIC',      'Healthcare'],
  ['HEALTH',     'Healthcare'],
  ['HOSPITAL',   'Healthcare'],
  ['STEEL',      'Metals'],
  ['METAL',      'Metals'],
  ['ALUM',       'Metals'],
  ['ZINC',       'Metals'],
  ['COPPER',     'Metals'],
  ['OIL',        'Energy'],
  ['PETRO',      'Energy'],
  ['REFIN',      'Energy'],
  ['GAS',        'Energy'],
  ['POWER',      'Power'],
  ['ENERGY',     'Power'],
  ['SOLAR',      'Power'],
  ['WIND',       'Power'],
  ['ELECTRIC',   'Power'],
  ['GRID',       'Power'],
  ['HINDUNILVR', 'FMCG'],
  ['FMCG',       'FMCG'],
  ['CONSUMER',   'Consumer'],
  ['JEWEL',      'Consumer'],
  ['RETAIL',     'Consumer'],
  ['FASHION',    'Consumer'],
  ['FOOD',       'Consumer'],
  ['RESTAURANT', 'Consumer'],
  ['INFRA',      'Infrastructure'],
  ['RAIL',       'Infrastructure'],
  ['PORT',       'Infrastructure'],
  ['AIRPORT',    'Infrastructure'],
  ['HIGHWAY',    'Infrastructure'],
  ['ROAD',       'Infrastructure'],
  ['REALTY',     'Real Estate'],
  ['ESTATE',     'Real Estate'],
  ['PROPERTY',   'Real Estate'],
  ['HOUSING',    'Real Estate'],
  ['CEMENT',     'Cement'],
  ['CONCRETE',   'Cement'],
  ['DEFENCE',    'Defense'],
  ['DEFENSE',    'Defense'],
  ['AERONAUT',   'Defense'],
  ['SHIPBUILD',  'Defense'],
  ['ORDNANCE',   'Defense'],
  ['TELECOM',    'Telecom'],
  ['AIRTEL',     'Telecom'],
  ['NETWORK',    'Telecom'],
  ['CHEM',       'Chemicals'],
  ['FERTILIZER', 'Chemicals'],
  ['PAINT',      'Paints'],
  ['LOGISTIC',   'Logistics'],
  ['COURIER',    'Logistics'],
];

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[%+,]/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeTicker(name: string): string {
  return name.toUpperCase().replace(/\s+|-|\./g, '').replace(/(LTD|LIMITED|INC|CORP)$/, '').trim();
}

function inferSector(stock: RadarStock): string {
  const stockName = typeof stock.Name === 'string' && stock.Name.trim() ? stock.Name : '';

  // 1. Direct sector field from API
  const direct = (typeof stock.Sector === 'string' && stock.Sector.trim())
    || (typeof stock.sector === 'string' && stock.sector.trim())
    || (typeof stock.Industry === 'string' && stock.Industry.trim())
    || (typeof stock.industry === 'string' && stock.industry.trim());
  if (direct) return direct;

  // 2. Exact ticker map
  if (!stockName) return 'Other';
  const norm = normalizeTicker(stockName);
  if (TICKER_MAP[norm]) return TICKER_MAP[norm];
  if (TICKER_MAP[stockName]) return TICKER_MAP[stockName];

  // 3. Keyword substring match
  for (const [kw, sector] of KEYWORD_MAP) {
    if (norm.includes(kw)) return sector;
  }

  return 'Other';
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
    const oiVals   = stocks.map(s => toNumber(s.OI ?? s['OI %']));
    const avgOi    = oiVals.reduce((a, b) => a + b, 0) / Math.max(oiVals.length, 1);
    const bullRatio= oiVals.filter(v => v > 0).length / Math.max(oiVals.length, 1);
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
