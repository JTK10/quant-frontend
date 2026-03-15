'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { RadarStock, SectorStrength } from '../types/radar';
import { resolveSignalSide, toNumber } from '../utils/scanner';
import { compareSectorStrength } from '../utils/sectorSkyline';
import { getTradingViewUrl } from '../utils/tradingview';

function normalizeTicker(value: string): string {
  return value.toUpperCase().replace(/^(NSE:|BSE:)/, '').replace(/[^A-Z0-9]/g, '').trim();
}

function getSignalChart(stock: RadarStock): string {
  if (typeof stock.Chart === 'string' && stock.Chart.trim()) return stock.Chart;
  if (typeof stock.Ticker === 'string' && stock.Ticker.trim()) return getTradingViewUrl(stock.Ticker);
  return getTradingViewUrl(stock.Name);
}

export default function SectorSkyline({ sectors }: { sectors: SectorStrength[] }) {
  const liveSectors = [...sectors]
    .filter((sector) => (sector.count ?? sector.stocks.length) > 0)
    .sort(compareSectorStrength);
  const [selectedKey, setSelectedKey] = useState<string | null>(liveSectors[0]?.key ?? null);

  if (!liveSectors.length) {
    return (
      <div
        className="rounded-[28px] border p-10 text-center"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
          NO LIVE SECTOR SIGNALS
        </p>
      </div>
    );
  }

  const sorted = liveSectors;
  const maxAbs = Math.max(...sorted.map((sector) => Math.abs(sector.strength)), 1);
  const active = sorted.find((sector) => sector.key === selectedKey) ?? sorted[0];
  const activeTickers = new Set(
    active.stocks.map((stock) => normalizeTicker(String(stock.Ticker ?? stock.Symbol ?? stock.Name ?? ''))),
  );

  return (
    <div
      className="rounded-[28px] border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(24,41,68,0.96) 0%, rgba(13,21,37,0.96) 100%)',
        borderColor: 'var(--color-brand-border)',
      }}
    >
      <div
        className="px-6 py-5 border-b"
        style={{
          borderColor: 'rgba(47,71,108,0.9)',
          background: 'linear-gradient(90deg, rgba(60,130,246,0.1), rgba(0,0,0,0))',
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-bold tracking-[0.18em] text-sm uppercase" style={{ color: 'var(--color-brand-text)' }}>
              Sector Tower Map
            </div>
            <div className="font-mono text-[10px] mt-1" style={{ color: 'var(--color-brand-muted)' }}>
              Towers sorted by live signal count first, then tower height
            </div>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[10px]">
            <span
              className="rounded-full px-3 py-1 border"
              style={{ color: 'var(--color-brand-bull)', borderColor: 'rgba(5,217,143,0.3)', background: 'rgba(5,217,143,0.08)' }}
            >
              GREEN = BULLISH FLOW
            </span>
            <span
              className="rounded-full px-3 py-1 border"
              style={{ color: 'var(--color-brand-bear)', borderColor: 'rgba(230,85,115,0.28)', background: 'rgba(230,85,115,0.08)' }}
            >
              RED = BEARISH FLOW
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-6">
        <div className="overflow-x-auto">
          <div className="flex gap-3 pb-2" style={{ minWidth: `${sorted.length * 92}px` }}>
            {sorted.map((sector) => {
              const isBull = sector.strength >= 0;
              const isSelected = sector.key === active.key;
              const towerHeight = Math.max(12, (Math.abs(sector.strength) / maxAbs) * 42);
              const towerColor = isBull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
              const towerShade = isBull ? 'rgba(5,217,143,0.18)' : 'rgba(230,85,115,0.18)';
              const towerBase = isBull ? '#02724a' : '#8f1f36';
              const towerBorder = isBull ? 'rgba(5,217,143,0.35)' : 'rgba(230,85,115,0.35)';
              const selectionOutline = isBull ? 'rgba(5,217,143,0.55)' : 'rgba(230,85,115,0.55)';

              return (
                <button
                  key={sector.key}
                  type="button"
                  className="group flex-1 min-w-[80px] rounded-[22px] px-2.5 pt-3 pb-2 transition-all text-left"
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.04)' : 'transparent',
                    boxShadow: isSelected ? `inset 0 0 0 1px ${selectionOutline}` : 'inset 0 0 0 1px transparent',
                  }}
                  onClick={() => setSelectedKey(sector.key)}
                >
                  <div className="relative h-[260px]">
                    <div
                      className="absolute inset-x-0 top-[12%] h-px"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(155,177,207,0.12), transparent)' }}
                    />
                    <div
                      className="absolute inset-x-0 top-1/2 h-px"
                      style={{ background: 'linear-gradient(90deg, rgba(155,177,207,0.18), rgba(155,177,207,0.7), rgba(155,177,207,0.18))' }}
                    />
                    <div
                      className="absolute inset-x-0 bottom-[12%] h-px"
                      style={{ background: 'linear-gradient(90deg, transparent, rgba(155,177,207,0.12), transparent)' }}
                    />

                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-[54px] rounded-[18px] transition-all duration-300"
                      style={{
                        height: `${towerHeight}%`,
                        background: `linear-gradient(180deg, ${towerColor}, ${towerBase})`,
                        boxShadow: `0 12px 32px ${towerShade}`,
                        ...(isBull
                          ? { bottom: '50%', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }
                          : { top: '50%', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }),
                      }}
                    >
                      <div
                        className="absolute inset-x-1 top-2 h-5 rounded-full"
                        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22), transparent)' }}
                      />
                    </div>

                    <div
                      className="absolute left-1/2 -translate-x-1/2 rounded-full px-2 py-1 font-mono text-[10px] font-bold"
                      style={{
                        color: towerColor,
                        border: `1px solid ${towerBorder}`,
                        background: 'rgba(10,17,30,0.92)',
                        ...(isBull
                          ? { bottom: `calc(50% + ${towerHeight}% + 10px)` }
                          : { top: `calc(50% + ${towerHeight}% + 10px)` }),
                      }}
                    >
                      {sector.strength > 0 ? '+' : ''}
                      {sector.strength.toFixed(1)}
                    </div>
                  </div>

                  <div className="mt-2 text-center">
                    <div
                      className="font-mono text-[9px] tracking-[0.18em] uppercase"
                      style={{ color: isSelected ? 'var(--color-brand-text)' : 'var(--color-brand-muted)' }}
                    >
                      {sector.name}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--color-brand-text)' }}>
                      {sector.count} live / {sector.trackedCount}
                    </div>
                    <div className="mt-1 font-mono text-[9px]" style={{ color: towerColor }}>
                      {sector.bullishCount} bull | {sector.bearishCount} bear
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="border-t px-6 py-5"
        style={{
          borderColor: 'rgba(47,71,108,0.9)',
          background: 'linear-gradient(180deg, rgba(5,10,18,0.22), rgba(5,10,18,0.5))',
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: active.strength >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}
              />
              <h3 className="text-lg font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--color-brand-text)' }}>
                {active.name}
              </h3>
            </div>
            <p className="mt-1 font-mono text-[10px] tracking-[0.18em]" style={{ color: 'var(--color-brand-muted)' }}>
              {active.count} ACTIVE SIGNALS ACROSS {active.trackedCount} TRACKED STOCKS
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 min-w-0">
            {[
              { label: 'Strength', value: `${active.strength > 0 ? '+' : ''}${active.strength.toFixed(2)}`, color: active.strength >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' },
              { label: 'Avg Edge', value: `${(active.avgEdge ?? 0) > 0 ? '+' : ''}${(active.avgEdge ?? 0).toFixed(2)}`, color: (active.avgEdge ?? 0) >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' },
              { label: 'Bullish', value: `${active.bullishCount ?? 0}`, color: 'var(--color-brand-bull)' },
              { label: 'Bearish', value: `${active.bearishCount ?? 0}`, color: 'var(--color-brand-bear)' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border px-3 py-3"
                style={{ borderColor: 'rgba(47,71,108,0.9)', background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="font-mono text-[9px] tracking-[0.18em]" style={{ color: 'var(--color-brand-muted)' }}>
                  {stat.label}
                </div>
                <div className="mt-1 text-lg font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1.3fr,0.9fr]">
          <div
            className="rounded-[24px] border p-4"
            style={{ borderColor: 'rgba(47,71,108,0.9)', background: 'rgba(255,255,255,0.03)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-bold tracking-[0.16em] text-sm uppercase" style={{ color: 'var(--color-brand-text)' }}>
                  Live Signals
                </div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                  Every active signal opens directly in TradingView
                </div>
              </div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                {active.count} rows
              </div>
            </div>

            <div className="space-y-2.5">
              {active.stocks.map((stock, index) => {
                const side = resolveSignalSide(stock as Record<string, unknown>);
                const bullish = side !== 'BEARISH';
                const edge = toNumber(stock.SignalEdge);
                const chartUrl = getSignalChart(stock);
                const badgeColor = bullish ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
                const badgeBg = bullish ? 'rgba(5,217,143,0.12)' : 'rgba(230,85,115,0.12)';
                const badgeBorder = bullish ? 'rgba(5,217,143,0.22)' : 'rgba(230,85,115,0.22)';

                return (
                  <div
                    key={`${stock.Name}-${index}`}
                    className="rounded-2xl border px-4 py-3"
                    style={{
                      borderColor: badgeBorder,
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: 'var(--color-brand-text)' }}>
                            {stock.Name}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.12em]"
                            style={{ color: badgeColor, background: badgeBg }}
                          >
                            {bullish ? 'BULL' : 'BEAR'}
                          </span>
                          {stock.ModuleLabel && (
                            <span
                              className="rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[0.12em]"
                              style={{ color: 'var(--color-brand-accent)', background: 'rgba(60,130,246,0.12)' }}
                            >
                              {stock.ModuleLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                          <span>{stock.Ticker ?? stock.Symbol ?? '-'}</span>
                          <span>{stock.Time || stock.Fired_At || 'LIVE'}</span>
                          <span>Conf {toNumber(stock.Confidence).toFixed(1)}</span>
                          <span>Edge {edge > 0 ? '+' : ''}{edge.toFixed(1)}</span>
                        </div>
                      </div>

                      <a
                        href={chartUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] transition-colors inline-flex items-center gap-1.5"
                        style={{
                          color: 'var(--color-brand-accent)',
                          borderColor: 'rgba(60,130,246,0.28)',
                          background: 'rgba(60,130,246,0.08)',
                        }}
                      >
                        TV <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="rounded-[24px] border p-4"
            style={{ borderColor: 'rgba(47,71,108,0.9)', background: 'rgba(255,255,255,0.03)' }}
          >
            <div className="mb-3">
              <div className="font-bold tracking-[0.16em] text-sm uppercase" style={{ color: 'var(--color-brand-text)' }}>
                Sector Members
              </div>
              <div className="font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
                Tracked names from the research sector map
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(active.trackedSymbols ?? []).map((symbol) => {
                const normalized = normalizeTicker(symbol);
                const isLive = activeTickers.has(normalized);

                return (
                  <a
                    key={symbol}
                    href={getTradingViewUrl(symbol)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] transition-colors inline-flex items-center gap-1.5"
                    style={{
                      color: isLive ? 'var(--color-brand-text)' : 'var(--color-brand-muted)',
                      borderColor: isLive ? 'rgba(60,130,246,0.32)' : 'rgba(47,71,108,0.9)',
                      background: isLive ? 'rgba(60,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    {symbol}
                    {isLive && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[8px]"
                        style={{ color: 'var(--color-brand-accent)', background: 'rgba(60,130,246,0.14)' }}
                      >
                        LIVE
                      </span>
                    )}
                    <ExternalLink size={11} />
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
