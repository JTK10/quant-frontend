import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import SectorSkyline from '../components/SectorSkyline';
import type { RadarStock, SectorStrength } from '../types/radar';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import { buildSectorData } from '../utils/sectorSkyline';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[%+,]/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeStocks(rawStocks: unknown): RadarStock[] {
  if (!Array.isArray(rawStocks)) {
    return [];
  }

  const stocks: RadarStock[] = [];

  for (const item of rawStocks) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const name =
      (typeof record.Name === 'string' && record.Name) ||
      (typeof record.name === 'string' && record.name) ||
      (typeof record.Symbol === 'string' && record.Symbol) ||
      (typeof record.symbol === 'string' && record.symbol) ||
      (typeof record.ticker === 'string' && record.ticker) ||
      null;

    if (!name) {
      continue;
    }

    const oiValue =
      record.OI ??
      record['OI %'] ??
      record.oi ??
      record.oiPercent ??
      record.oi_change ??
      0;

    const chart =
      (typeof record.Chart === 'string' && record.Chart) ||
      (typeof record.chart === 'string' && record.chart) ||
      '';

    stocks.push({
      Name: name,
      SmartRank: toNumber(record.SmartRank),
      Peak_Score: toNumber(record.Peak_Score),
      Signal_Generated_Score: toNumber(record.Signal_Generated_Score),
      OI: toNumber(oiValue),
      'OI %': toNumber(oiValue),
      Chart: chart,
    });
  }

  return stocks;
}

function normalizeSectorData(data: unknown): SectorStrength[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const stockLike = data.some((item) => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const record = item as Record<string, unknown>;
    return (
      typeof record.Name === 'string' &&
      ('SmartRank' in record || 'Peak_Score' in record || 'Signal_Generated_Score' in record)
    );
  });

  if (stockLike) {
    return buildSectorData(data as RadarStock[]);
  }

  const sectors: SectorStrength[] = [];

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const name =
      (typeof record.Sector === 'string' && record.Sector) ||
      (typeof record.sector === 'string' && record.sector) ||
      (typeof record.Name === 'string' && record.Name) ||
      (typeof record.name === 'string' && record.name) ||
      null;

    if (!name) {
      continue;
    }

    const strengthValue =
      record.strength ??
      record.Strength ??
      record.OI ??
      record.oi ??
      record.OIChange ??
      record.oiChange ??
      record.oi_change ??
      record.value;

    const stocks =
      normalizeStocks(
        record.stocks ??
          record.Stocks ??
          record.constituents ??
          record.Constituents ??
          record.members ??
          record.Members
      ) ?? [];

    sectors.push({
      name,
      strength: toNumber(strengthValue),
      stocks,
    });
  }

  return sectors.sort((a, b) => b.strength - a.strength);
}

async function getSectorData(dateStr: string): Promise<SectorStrength[]> {
  const url = await getInternalApiUrl(`/api/sector?date=${encodeURIComponent(dateStr)}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];

  const data: unknown = await res.json();
  return normalizeSectorData(data);
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const sectors = await getSectorData(dateStr);

  return (
    <div className="font-sans w-full text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sector Scope</h2>
          <p className="text-brand-muted text-sm mt-1">
            Institutional sector heat engine for <span className="text-brand-accent">{dateStr}</span>.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      <SectorSkyline sectors={sectors} />
    </div>
  );
}
