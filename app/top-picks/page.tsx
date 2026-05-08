import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import type { RadarStock, SectorStrength } from '../types/radar';
import { buildSectorData, compareSectorStrength } from '../utils/sectorSkyline';
import { resolveSignalSide, toNumber } from '../utils/scanner';
import { getTradingViewUrl } from '../utils/tradingview';

export const dynamic = 'force-dynamic';

async function getRadarStocks(dateStr: string): Promise<RadarStock[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

async function getSectorSentiment(dateStr: string) {
  try {
    const url = await getInternalApiUrl(`/api/sector?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function SignalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors"
      style={{
        color: 'var(--color-brand-accent)',
        borderColor: 'rgba(60,130,246,0.3)',
        background: 'rgba(60,130,246,0.08)',
      }}
    >
      TV
    </a>
  );
}

export default async function TopPicksPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const [stocks, backendSectors] = await Promise.all([
    getRadarStocks(dateStr),
    getSectorSentiment(dateStr)
  ]);
  const sectors = buildSectorData(stocks);

  // Merge backend sector sentiment logic
  if (backendSectors?.length > 0) {
    backendSectors.forEach((bs: any) => {
      const bsSector = bs.Sector ?? bs.sector;
      if (!bsSector) return;
      
      const match = sectors.find(s => s.key === bsSector || s.name.toUpperCase() === String(bsSector).toUpperCase());
      if (match) {
        match.strength = typeof bs.strength === 'number' ? bs.strength : match.strength;
        match.avgEdge = typeof bs.strength === 'number' ? bs.strength : match.avgEdge;
        match.bullishCount = bs.bull_count ?? bs.GreenCount ?? match.bullishCount;
        match.bearishCount = bs.bear_count ?? bs.OrangeCount ?? match.bearishCount;
        match.bullRatio = bs.bull_pct ?? match.bullRatio;
        
        // Map new sector RVOL fields from DynamoDB
        match.rvol = parseFloat(bs.SectorRVOL) || 0;
        match.rvolColor = bs.RVOL_Color || "";
        match.topStock = bs.TopStock || "";
        match.topRvol = parseFloat(bs.TopStockRVOL) || 0;
      }
    });

    sectors.sort((a, b) => {
      const aRvol = a.rvol !== undefined ? a.rvol : 0;
      const bRvol = b.rvol !== undefined ? b.rvol : 0;
      if (aRvol !== bRvol) {
        return bRvol - aRvol;
      }
      return compareSectorStrength(a, b);
    });
  }

  const liveSectors = sectors.filter((sector) => (sector.count ?? sector.stocks.length) > 0);

  // Flatten the top 2 stocks from each sector
  const masterStocks: Array<{ stock: Record<string, unknown>; sectorName: string; sectorStrength: number; rvol: number }> = [];
  
  for (const sector of liveSectors) {
    const topStocks = sector.stocks.slice(0, 2);
    for (const stock of topStocks) {
      masterStocks.push({
        stock: stock as Record<string, unknown>,
        sectorName: sector.name,
        sectorStrength: sector.strength,
        rvol: sector.rvol || 0
      });
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1 h-5 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
            <h1 className="text-2xl font-bold tracking-wide text-white">Sector Master List</h1>
          </div>
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            TOP 2 STOCKS FROM ALL SECTORS
            <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>
              {dateStr}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker />
          <AutoRefresh interval={60000} />
        </div>
      </div>

      {masterStocks.length === 0 ? (
        <div
          className="rounded-[28px] border p-12 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            NO SECTOR DATA FOR {dateStr}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {masterStocks.map(({ stock, sectorName, sectorStrength }, index) => {
            const side = resolveSignalSide(stock);
            const bullish = side !== 'BEARISH';
            const sideColor = bullish ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
            const sideBorder = bullish ? 'rgba(5,217,143,0.22)' : 'rgba(230,85,115,0.22)';
            const chartUrl =
              (typeof stock.Chart === 'string' && stock.Chart.trim()) ||
              getTradingViewUrl(String(stock.Ticker ?? stock.Symbol ?? stock.Name));
              
            const sectorColor = sectorStrength >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';

            return (
              <div
                key={`${stock.Name}-${sectorName}-${index}`}
                className="rounded-2xl border px-4 py-3"
                style={{
                  borderColor: sideBorder,
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: 'var(--color-brand-text)' }}>
                        {stock.Name as string}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[9px]"
                        style={{ color: sideColor, background: bullish ? 'rgba(5,217,143,0.12)' : 'rgba(230,85,115,0.12)' }}
                      >
                        {bullish ? 'BULL' : 'BEAR'}
                      </span>
                      
                      <span className="text-[10px] mx-1" style={{ color: 'var(--color-brand-border)' }}>•</span>
                      
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase"
                        style={{ color: 'var(--color-brand-text)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        {sectorName}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[9px]"
                        style={{ color: sectorColor, background: sectorStrength >= 0 ? 'rgba(5,217,143,0.12)' : 'rgba(230,85,115,0.12)' }}
                      >
                        STR {sectorStrength > 0 ? '+' : ''}{sectorStrength.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                      <span>{stock.Ticker as string ?? stock.Symbol as string ?? '-'}</span>
                      <span>{stock.ModuleLabel as string ?? stock.Module as string ?? 'SCANNER'}</span>
                      <span>Conf {toNumber(stock.Confidence).toFixed(1)}</span>
                      <span>Edge {toNumber(stock.SignalEdge) > 0 ? '+' : ''}{toNumber(stock.SignalEdge).toFixed(1)}</span>
                    </div>
                  </div>
                  <SignalLink href={chartUrl} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
