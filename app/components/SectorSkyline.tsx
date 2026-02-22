'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SectorStrength } from '../types/radar';

export default function SectorSkyline({ sectors }: { sectors: SectorStrength[] }) {
  const [activeSector, setActiveSector] = useState<SectorStrength | null>(null);

  const sorted = [...sectors].sort((a, b) => b.strength - a.strength);
  const max = Math.max(...sorted.map((s) => Math.abs(s.strength)), 1);

  if (!sorted.length) {
    return (
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-8 text-center text-brand-muted italic">
        No sector heat data available for the selected date.
      </div>
    );
  }

  const parseOi = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[%+,]/g, '').trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  return (
    <div className="relative w-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-brand-muted">Sector Skyline Heat Engine</h2>
        <div className="text-xs text-brand-muted">Left: Bull Pressure | Right: Bear Pressure</div>
      </div>

      <div className="w-full overflow-x-auto pb-10">
        <div className="flex items-end justify-between gap-4 h-[320px] px-4 min-w-[760px]">
          {sorted.map((sector, i) => {
            const heightPercent = (Math.abs(sector.strength) / max) * 100;
            const isBull = sector.strength >= 0;

            return (
              <motion.div
                key={sector.name}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(heightPercent, 8)}%` }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
                onClick={() => setActiveSector(sector)}
                className={`w-10 rounded-t-xl cursor-pointer relative group shrink-0 ${
                  isBull
                    ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    : 'bg-gradient-to-t from-red-600 to-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)]'
                }`}
              >
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-gray-400 rotate-45 whitespace-nowrap">
                  {sector.name}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {activeSector && (
          <>
            <motion.button
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveSector(null)}
              className="fixed inset-0 bg-black/50 z-40"
              aria-label="Close sector drawer"
            />
            <motion.div
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed right-0 top-0 h-full w-[420px] max-w-[92vw] bg-[#0b1220] border-l border-gray-800 p-6 overflow-y-auto z-50"
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold text-white">{activeSector.name}</h2>
                <button
                  onClick={() => setActiveSector(null)}
                  className="text-gray-400 hover:text-white"
                >
                  x
                </button>
              </div>
              <div className="text-xs text-brand-muted mb-6">
                Sector strength: {activeSector.strength.toFixed(2)}
              </div>

              {activeSector.stocks.map((stock, idx) => {
                const oi = parseOi(stock.OI ?? stock['OI %']);

                return (
                  <div
                    key={`${stock.Name}-${idx}`}
                    className="flex justify-between py-2 border-b border-gray-800 text-sm"
                  >
                    <span className="text-gray-200">{stock.Name}</span>
                    <span className={oi > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {oi > 0 ? '+' : ''}
                      {oi.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
