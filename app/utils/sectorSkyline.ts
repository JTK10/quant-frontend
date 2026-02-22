import type { RadarStock, SectorStrength } from "../types/radar";

const SECTOR_KEYWORDS: Array<{ name: string; keys: string[] }> = [
  { name: "Banking", keys: ["BANK", "HDFC", "ICICI", "KOTAK", "SBIN", "AXIS"] },
  { name: "Financials", keys: ["FINANCE", "INSURANCE", "BROKING", "MUTHOOT"] },
  { name: "IT", keys: ["INFY", "TCS", "WIPRO", "TECH", "SOFTWARE", "HCL"] },
  { name: "Auto", keys: ["MOTOR", "AUTO", "MARUTI", "BAJAJ-AUTO", "EICHER"] },
  { name: "Pharma", keys: ["PHARMA", "LAB", "CIPLA", "LUPIN", "BIOCON", "DRREDDY"] },
  { name: "Metals", keys: ["STEEL", "METAL", "HINDALCO", "VEDL", "SAIL", "JSW"] },
  { name: "Energy", keys: ["POWER", "OIL", "GAS", "ONGC", "IOC", "NTPC", "PETRO"] },
  { name: "FMCG", keys: ["HINDUNILVR", "ITC", "NESTLE", "DABUR", "MARICO", "COLPAL"] },
  { name: "Infrastructure", keys: ["LARSEN", "LT", "ADANI", "RAIL", "RVNL", "NBCC"] },
  { name: "Telecom", keys: ["AIRTEL", "IDEA", "TELECOM", "JIO"] },
  { name: "Consumer", keys: ["TITAN", "TRENT", "DMART", "VBL", "BRITANNIA"] },
];

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[%+,]/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function inferSectorFromName(name: string): string {
  const normalized = normalizeName(name);

  for (const sector of SECTOR_KEYWORDS) {
    if (sector.keys.some((key) => normalized.includes(normalizeName(key)))) {
      return sector.name;
    }
  }

  return "Other";
}

function readSector(stock: RadarStock): string {
  const directSector =
    (typeof stock.Sector === "string" && stock.Sector) ||
    (typeof stock.sector === "string" && stock.sector) ||
    (typeof stock.Industry === "string" && stock.Industry) ||
    (typeof stock.industry === "string" && stock.industry);

  if (directSector) {
    return directSector;
  }

  return inferSectorFromName(stock.Name);
}

export function buildSectorData(data: RadarStock[]): SectorStrength[] {
  if (!data.length) {
    return [];
  }

  const grouped = new Map<string, RadarStock[]>();

  for (const stock of data) {
    const sector = readSector(stock);
    const list = grouped.get(sector) ?? [];
    list.push(stock);
    grouped.set(sector, list);
  }

  type Aggregate = {
    name: string;
    stocks: RadarStock[];
    avgOi: number;
    bullishRatio: number;
    avgRank: number;
  };

  const aggregates: Aggregate[] = Array.from(grouped.entries()).map(([name, stocks]) => {
    const oiValues = stocks.map((s) => toNumber(s.OI ?? s["OI %"]));
    const rankValues = stocks.map((s) => toNumber(s.SmartRank));

    const avgOi =
      oiValues.reduce((sum, value) => sum + value, 0) / Math.max(oiValues.length, 1);
    const bullishRatio =
      oiValues.filter((value) => value > 0).length / Math.max(oiValues.length, 1);
    const avgRank =
      rankValues.reduce((sum, value) => sum + value, 0) / Math.max(rankValues.length, 1);

    return { name, stocks, avgOi, bullishRatio, avgRank };
  });

  const ranks = aggregates.map((item) => item.avgRank).filter((value) => Number.isFinite(value));
  const minRank = ranks.length ? Math.min(...ranks) : 0;
  const maxRank = ranks.length ? Math.max(...ranks) : 1;
  const rankRange = Math.max(maxRank - minRank, 1);

  const sectors: SectorStrength[] = aggregates.map((item) => {
    const bullishWeight = (item.bullishRatio - 0.5) * 30;
    const rankNorm = (maxRank - item.avgRank) / rankRange;
    const rankWeight = (rankNorm - 0.5) * 20;
    const strength = Number((item.avgOi + bullishWeight + rankWeight).toFixed(2));

    const sortedStocks = [...item.stocks].sort((a, b) => {
      const aScore = toNumber(a.Signal_Generated_Score);
      const bScore = toNumber(b.Signal_Generated_Score);
      return bScore - aScore;
    });

    return {
      name: item.name,
      strength,
      stocks: sortedStocks,
    };
  });

  return sectors.sort((a, b) => b.strength - a.strength);
}
