import AutoRefresh from '../components/AutoRefresh';
import DatePicker from '../components/DatePicker';
import SectorSkyline from '../components/SectorSkyline';
import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import type { RadarStock, SectorStrength } from '../types/radar';
import { buildSectorData } from '../utils/sectorSkyline';
import { resolveSignalSide, toNumber } from '../utils/scanner';
import { getTradingViewUrl } from '../utils/tradingview';

export const revalidate = 60;

async function getRadarStocks(dateStr: string): Promise<RadarStock[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const raw = await res.json();
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function Pill({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'bull' | 'bear' }) {
  const color =
    tone === 'bull'
      ? 'var(--color-brand-bull)'
      : tone === 'bear'
        ? 'var(--color-brand-bear)'
        : 'var(--color-brand-text)';

  const glow =
    tone === 'bull'
      ? 'rgba(5,217,143,0.12)'
      : tone === 'bear'
        ? 'rgba(230,85,115,0.12)'
        : 'rgba(60,130,246,0.1)';

  return (
    <div
      className="rounded-[22px] border px-4 py-4 relative overflow-hidden"
      style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${glow}, transparent)` }}
      />
      <div className="font-mono text-[9px] tracking-[0.24em] mb-2" style={{ color: 'var(--color-brand-muted)' }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
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

function SectorCard({ sec }: { sec: SectorStrength }) {
  const liveCount = sec.count ?? sec.stocks.length;
  const isBull = sec.strength >= 0;
  const isLive = liveCount > 0;
  const accent = isLive
    ? isBull
      ? 'var(--color-brand-bull)'
      : 'var(--color-brand-bear)'
    : 'var(--color-brand-accent)';
  const accentBorder = isLive
    ? isBull
      ? 'rgba(5,217,143,0.3)'
      : 'rgba(230,85,115,0.3)'
    : 'rgba(60,130,246,0.28)';
  const accentBg = isLive
    ? isBull
      ? 'rgba(5,217,143,0.12)'
      : 'rgba(230,85,115,0.12)'
    : 'rgba(60,130,246,0.12)';
  const bullRatio = sec.bullRatio ?? 0.5;

  return (
    <div
      className="rounded-[26px] border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(24,41,68,0.96) 0%, rgba(15,24,39,0.98) 100%)',
        borderColor: accentBorder,
        boxShadow: isLive ? `0 14px 34px ${accentBg}` : 'none',
      }}
    >
      <div className="relative px-5 py-4 border-b" style={{ borderColor: 'rgba(47,71,108,0.85)' }}>
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
        />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-brand-text)' }}>
              {sec.name}
            </h3>
            <p className="mt-1 font-mono text-[10px] tracking-[0.14em]" style={{ color: 'var(--color-brand-muted)' }}>
              {liveCount} live signals across {sec.trackedCount} mapped stocks
            </p>
          </div>
          <div
            className="rounded-full px-3 py-1 font-mono text-[10px]"
            style={{ color: accent, background: accentBg }}
          >
            {liveCount > 0 ? (isBull ? 'BULL FLOW' : 'BEAR FLOW') : 'ON WATCH'}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: 'Strength', value: `${sec.strength > 0 ? '+' : ''}${sec.strength.toFixed(2)}`, color: accent },
            { label: 'Avg Edge', value: `${(sec.avgEdge ?? 0) > 0 ? '+' : ''}${(sec.avgEdge ?? 0).toFixed(2)}`, color: (sec.avgEdge ?? 0) >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' },
            { label: 'Bull', value: `${sec.bullishCount ?? 0}`, color: 'var(--color-brand-bull)' },
            { label: 'Bear', value: `${sec.bearishCount ?? 0}`, color: 'var(--color-brand-bear)' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border px-3 py-3"
              style={{ borderColor: 'rgba(47,71,108,0.75)', background: 'rgba(255,255,255,0.03)' }}
            >
              <div className="font-mono text-[9px] tracking-[0.16em]" style={{ color: 'var(--color-brand-muted)' }}>
                {stat.label}
              </div>
              <div className="mt-1.5 text-lg font-bold" style={{ color: stat.color }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between font-mono text-[9px] tracking-[0.16em]" style={{ color: 'var(--color-brand-muted)' }}>
            <span>BULL / BEAR SPLIT</span>
            <span>{(bullRatio * 100).toFixed(0)}% / {((1 - bullRatio) * 100).toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(47,71,108,0.75)' }}>
            <div className="h-full" style={{ width: `${bullRatio * 100}%`, background: 'var(--color-brand-bull)' }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 xl:grid-cols-[1.1fr,0.9fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-bold tracking-[0.16em] text-sm uppercase" style={{ color: 'var(--color-brand-text)' }}>
                Live Signals
              </div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                TradingView launch is available on every row
              </div>
            </div>
          </div>

          {sec.stocks.length === 0 ? (
            <div
              className="rounded-2xl border px-4 py-6 text-center font-mono text-[11px]"
              style={{ borderColor: 'rgba(47,71,108,0.75)', background: 'rgba(255,255,255,0.03)', color: 'var(--color-brand-muted)' }}
            >
              NO ACTIVE SIGNALS IN THIS SECTOR
            </div>
          ) : (
            <div className="space-y-2.5">
              {sec.stocks.slice(0, 5).map((stock, index) => {
                const side = resolveSignalSide(stock as Record<string, unknown>);
                const bullish = side !== 'BEARISH';
                const sideColor = bullish ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
                const sideBorder = bullish ? 'rgba(5,217,143,0.22)' : 'rgba(230,85,115,0.22)';
                const chartUrl =
                  (typeof stock.Chart === 'string' && stock.Chart.trim()) ||
                  getTradingViewUrl(String(stock.Ticker ?? stock.Symbol ?? stock.Name));

                return (
                  <div
                    key={`${stock.Name}-${index}`}
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
                            {stock.Name}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-[9px]"
                            style={{ color: sideColor, background: bullish ? 'rgba(5,217,143,0.12)' : 'rgba(230,85,115,0.12)' }}
                          >
                            {bullish ? 'BULL' : 'BEAR'}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                          <span>{stock.Ticker ?? stock.Symbol ?? '-'}</span>
                          <span>{stock.ModuleLabel ?? stock.Module ?? 'SCANNER'}</span>
                          <span>Conf {toNumber(stock.Confidence).toFixed(1)}</span>
                          <span>Edge {toNumber(stock.SignalEdge) > 0 ? '+' : ''}{toNumber(stock.SignalEdge).toFixed(1)}</span>
                        </div>
                      </div>
                      <SignalLink href={chartUrl} />
                    </div>
                  </div>
                );
              })}
              {sec.stocks.length > 5 && (
                <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                  +{sec.stocks.length - 5} more live signals in this sector
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3">
            <div className="font-bold tracking-[0.16em] text-sm uppercase" style={{ color: 'var(--color-brand-text)' }}>
              Mapped Stocks
            </div>
            <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
              Pulled from your research script sector map
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {(sec.trackedSymbols ?? []).map((symbol) => {
              const isLiveTicker = sec.stocks.some((stock) => String(stock.Ticker ?? stock.Symbol ?? '').replace(/[^A-Z0-9]/gi, '') === symbol.replace(/[^A-Z0-9]/gi, ''));

              return (
                <a
                  key={symbol}
                  href={getTradingViewUrl(symbol)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border px-3 py-1.5 font-mono text-[10px] inline-flex items-center gap-1.5"
                  style={{
                    color: isLiveTicker ? 'var(--color-brand-text)' : 'var(--color-brand-muted)',
                    borderColor: isLiveTicker ? 'rgba(60,130,246,0.3)' : 'rgba(47,71,108,0.85)',
                    background: isLiveTicker ? 'rgba(60,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  {symbol}
                  {isLiveTicker && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[8px]"
                      style={{ color: 'var(--color-brand-accent)', background: 'rgba(60,130,246,0.14)' }}
                    >
                      LIVE
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const stocks = await getRadarStocks(dateStr);
  const sectors = buildSectorData(stocks);
  const liveSectors = sectors.filter((sector) => (sector.count ?? sector.stocks.length) > 0);
  const bullSectors = liveSectors.filter((sector) => sector.strength > 0).length;
  const bearSectors = liveSectors.filter((sector) => sector.strength < 0).length;
  const leader = liveSectors[0];
  const totalSignals = liveSectors.reduce((sum, sector) => sum + (sector.count ?? sector.stocks.length), 0);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid gap-4 xl:grid-cols-[1.35fr,0.9fr] mb-8">
        <div
          className="rounded-[30px] border px-6 py-6"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(60,130,246,0.2), transparent 38%), linear-gradient(180deg, rgba(24,41,68,0.96) 0%, rgba(15,24,39,0.98) 100%)',
            borderColor: 'var(--color-brand-border)',
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1 h-6 rounded-full inline-block" style={{ background: 'var(--color-brand-accent)' }} />
                <h1 className="text-3xl font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--color-brand-text)' }}>
                  Sector Rotation
                </h1>
              </div>
              <p className="font-mono text-xs tracking-[0.24em]" style={{ color: 'var(--color-brand-muted)' }}>
                SCRIPT-SYNCED SECTOR MAP
                <span className="ml-2" style={{ color: 'var(--color-brand-accent)' }}>{dateStr}</span>
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-6" style={{ color: 'var(--color-brand-muted)' }}>
                Sector buckets now follow the exact mapping from your research script. The tower map ranks live sectors by signal participation and tower height, while each sector card keeps the mapped stock list and TradingView links side by side.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <DatePicker />
              <AutoRefresh interval={60000} />
            </div>
          </div>
        </div>

        <div
          className="rounded-[30px] border px-6 py-6"
          style={{
            background:
              'linear-gradient(180deg, rgba(24,41,68,0.96) 0%, rgba(15,24,39,0.98) 100%)',
            borderColor: leader
              ? leader.strength >= 0
                ? 'rgba(5,217,143,0.28)'
                : 'rgba(230,85,115,0.28)'
              : 'var(--color-brand-border)',
          }}
        >
          <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: 'var(--color-brand-muted)' }}>
            LEAD TOWER
          </div>
          <div className="mt-3 text-2xl font-bold" style={{ color: 'var(--color-brand-text)' }}>
            {leader?.name ?? 'No live sector'}
          </div>
          <div className="mt-2 font-mono text-[11px]" style={{ color: leader ? (leader.strength >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)') : 'var(--color-brand-muted)' }}>
            {leader ? `${leader.strength > 0 ? '+' : ''}${leader.strength.toFixed(2)} strength` : 'Waiting for live signals'}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'rgba(47,71,108,0.75)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="font-mono text-[9px] tracking-[0.18em]" style={{ color: 'var(--color-brand-muted)' }}>LIVE SIGNALS</div>
              <div className="mt-1 text-xl font-bold" style={{ color: 'var(--color-brand-text)' }}>{totalSignals}</div>
            </div>
            <div className="rounded-2xl border px-3 py-3" style={{ borderColor: 'rgba(47,71,108,0.75)', background: 'rgba(255,255,255,0.03)' }}>
              <div className="font-mono text-[9px] tracking-[0.18em]" style={{ color: 'var(--color-brand-muted)' }}>ACTIVE THEMES</div>
              <div className="mt-1 text-xl font-bold" style={{ color: 'var(--color-brand-text)' }}>{liveSectors.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Pill label="TRACKED SECTORS" value={sectors.length.toString()} />
        <Pill label="LIVE THEMES" value={liveSectors.length.toString()} />
        <Pill label="BULLISH" value={bullSectors.toString()} tone={bullSectors > 0 ? 'bull' : 'neutral'} />
        <Pill label="BEARISH" value={bearSectors.toString()} tone={bearSectors > 0 ? 'bear' : 'neutral'} />
        <Pill label="LIVE SIGNALS" value={totalSignals.toString()} />
      </div>

      <div className="mb-8">
        <SectorSkyline sectors={liveSectors} />
      </div>

      {sectors.length === 0 ? (
        <div
          className="rounded-[28px] border p-12 text-center"
          style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
        >
          <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
            NO SECTOR DATA FOR {dateStr}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: 'var(--color-brand-border)' }} />
            <span className="font-mono text-[9px] tracking-[0.25em] uppercase px-1" style={{ color: 'var(--color-brand-muted)' }}>
              Sector Mapping Detail
            </span>
            <div className="flex-1 h-px" style={{ background: 'var(--color-brand-border)' }} />
          </div>
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            {sectors.map((sector) => <SectorCard key={sector.key} sec={sector} />)}
          </div>
        </>
      )}
    </div>
  );
}
