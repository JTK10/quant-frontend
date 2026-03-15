'use client';

import { useState } from 'react';
import type { SectorStrength } from '../types/radar';
import { resolveSignalSide, toNumber } from '../utils/scanner';

export default function SectorSkyline({ sectors }: { sectors: SectorStrength[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (!sectors.length) {
    return (
      <div
        className="rounded-xl border p-10 text-center"
        style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
      >
        <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-brand-muted)' }}>
          NO SECTOR DATA
        </p>
      </div>
    );
  }

  const sorted = [...sectors].sort((a, b) => b.strength - a.strength);
  const maxAbs = Math.max(...sorted.map((sector) => Math.abs(sector.strength)), 0.1);
  const active = openIdx !== null ? sorted[openIdx] : null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: 'var(--color-brand-surface)', borderColor: 'var(--color-brand-border)' }}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-brand-border)' }}>
        <div>
          <div className="font-bold tracking-wider text-sm" style={{ color: 'var(--color-brand-text)' }}>
            Sector Rotation Map
          </div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--color-brand-muted)' }}>
            Click a column to inspect the strongest signals
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px]" style={{ color: 'var(--color-brand-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--color-brand-bull)' }} />
            BULL
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--color-brand-bear)' }} />
            BEAR
          </span>
        </div>
      </div>

      <div className="px-6 py-5 overflow-x-auto">
        <div className="flex items-end gap-1.5" style={{ minWidth: `${sorted.length * 56}px`, height: '160px' }}>
          {sorted.map((sector, index) => {
            const pct = (Math.abs(sector.strength) / maxAbs) * 100;
            const isBull = sector.strength >= 0;
            const isOpen = openIdx === index;
            const topColor = isBull ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)';
            const bottomColor = isBull ? '#03845a' : '#8b1e2f';

            return (
              <div
                key={sector.name}
                className="flex flex-col items-center gap-1 cursor-pointer flex-1 min-w-[48px] group"
                style={{ alignSelf: 'flex-end' }}
                onClick={() => setOpenIdx(isOpen ? null : index)}
              >
                <div
                  className="w-full rounded-t-md relative overflow-hidden transition-opacity duration-200"
                  style={{
                    height: `${Math.max(pct, 4)}%`,
                    background: `linear-gradient(to top, ${bottomColor}, ${topColor})`,
                    boxShadow: `0 0 12px ${topColor}40`,
                    outline: isOpen ? `1px solid ${topColor}` : 'none',
                    opacity: openIdx !== null && !isOpen ? 0.4 : 1,
                    minHeight: '6px',
                  }}
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full"
                    style={{ transition: 'transform 0.7s ease' }}
                  />
                </div>
                <div className="font-mono text-[9px] tabular-nums font-bold" style={{ color: topColor }}>
                  {sector.strength > 0 ? '+' : ''}{sector.strength.toFixed(1)}
                </div>
                <div
                  className="font-mono text-[8px] text-center leading-tight break-words w-full px-0.5 transition-colors"
                  style={{ color: isOpen ? 'var(--color-brand-text)' : 'var(--color-brand-muted)', maxWidth: '52px' }}
                >
                  {sector.name.toUpperCase()}
                </div>
                <div className="font-mono text-[8px]" style={{ color: 'rgba(90,114,153,0.5)' }}>
                  {sector.stocks.length}s
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {active && (
        <div className="border-t" style={{ borderColor: 'var(--color-brand-border)', background: 'rgba(6,10,20,0.7)' }}>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ background: active.strength >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}
                />
                <span className="font-bold tracking-widest text-sm uppercase" style={{ color: 'var(--color-brand-text)' }}>
                  {active.name}
                </span>
                <span
                  className="font-mono text-[10px] px-2 py-0.5 rounded"
                  style={{ background: 'var(--color-brand-border)', color: 'var(--color-brand-muted)' }}
                >
                  {active.stocks.length} signal{active.stocks.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setOpenIdx(null)}
                className="font-mono text-[10px] tracking-widest px-2 py-1 rounded transition-colors"
                style={{ color: 'var(--color-brand-muted)', background: 'var(--color-brand-border)' }}
              >
                CLOSE X
              </button>
            </div>

            <div className="flex flex-wrap gap-6 mb-4 font-mono text-[11px]">
              <div style={{ color: 'var(--color-brand-muted)' }}>
                Strength:{' '}
                <span className="font-bold" style={{ color: active.strength >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}>
                  {active.strength > 0 ? '+' : ''}{active.strength.toFixed(2)}
                </span>
              </div>
              {typeof active.bullRatio === 'number' && (
                <div style={{ color: 'var(--color-brand-muted)' }}>
                  Bullish:{' '}
                  <span className="font-bold" style={{ color: 'var(--color-brand-text)' }}>
                    {(active.bullRatio * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              {typeof active.avgEdge === 'number' && (
                <div style={{ color: 'var(--color-brand-muted)' }}>
                  Avg Edge:{' '}
                  <span className="font-bold" style={{ color: active.avgEdge >= 0 ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}>
                    {active.avgEdge > 0 ? '+' : ''}{active.avgEdge.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {active.stocks.map((stock, index) => {
                const edge = toNumber(stock.SignalEdge);
                const side = resolveSignalSide(stock as Record<string, unknown>);
                const color = side === 'BEARISH' ? 'var(--color-brand-bear)' : 'var(--color-brand-bull)';

                return (
                  <div
                    key={`${stock.Name}-${index}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 border"
                    style={{
                      background: 'var(--color-brand-surface)',
                      borderColor: 'var(--color-brand-border)',
                    }}
                  >
                    <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-brand-text)' }}>
                      {stock.Name}
                    </span>
                    <span className="font-mono text-[10px] font-bold ml-1.5 shrink-0" style={{ color }}>
                      {edge > 0 ? '+' : ''}{edge.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
