'use client';

import Link from 'next/link';
import type { RadarStock } from '../types/radar';

export default function SmartRadarPremium({ data }: { data: RadarStock[] }) {
  const topFive = data.slice(0, 5);
  const rest = data.slice(5);

  const rankColor = (rank: number) => {
    if (rank === 0) return 'from-yellow-400 to-yellow-600';
    if (rank === 1) return 'from-gray-300 to-gray-500';
    if (rank === 2) return 'from-amber-600 to-amber-800';
    return 'from-brand-accent to-brand-accent';
  };

  const confidenceColor = (value: number) => {
    if (value > 80) return 'bg-emerald-500';
    if (value > 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[%+,]/g, '').trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  if (!data.length) {
    return (
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-8 text-center text-brand-muted italic">
        No Smart Radar data available for the selected date.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-semibold text-brand-muted mb-4">AI Champions</h2>

        <div className="grid md:grid-cols-3 gap-6">
          {topFive.map((stock, index) => {
            const peakScore = toNumber(stock.Peak_Score);
            const smartRank = toNumber(stock.SmartRank);
            const oi = toNumber(stock.OI ?? stock['OI %']);
            const signalScore = toNumber(stock.Signal_Generated_Score);

            return (
              <div
                key={stock.Name}
                className="relative bg-brand-surface border border-brand-border rounded-2xl p-6 hover:scale-[1.02] hover:shadow-2xl transition-all duration-300 group overflow-hidden"
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-20 bg-gradient-to-br from-brand-accent to-emerald-500 blur-2xl transition duration-500"></div>

                <div
                  className={`absolute top-4 right-4 px-3 py-1 text-xs font-bold rounded-full bg-gradient-to-r ${rankColor(index)} text-black`}
                >
                  #{index + 1}
                </div>

                <h3 className="text-xl font-bold text-white mb-2">{stock.Name}</h3>

                <div className="mb-4">
                  <div className="text-brand-muted text-xs tracking-wider">PEAK SCORE</div>
                  <div className="text-3xl font-black text-brand-accent">
                    {peakScore.toFixed(2)}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-brand-muted text-xs">SMART RANK</div>
                  <div className="text-lg font-mono text-white">{smartRank.toFixed(0)}</div>
                </div>

                <div className="mb-4 text-sm text-brand-muted">
                  OI Change: <span className="text-white font-semibold">{oi.toFixed(2)}%</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-brand-muted mb-1">
                    <span>CONFIDENCE</span>
                    <span>{signalScore.toFixed(0)}%</span>
                  </div>

                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`${confidenceColor(signalScore)} h-full transition-all duration-500`}
                      style={{ width: `${Math.min(signalScore, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Link
                    href={stock.Chart}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand-accent hover:underline"
                  >
                    View Chart -&gt;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-brand-muted mb-4">Full Rankings</h2>

        <div className="bg-brand-surface border border-brand-border rounded-2xl max-h-[600px] overflow-y-auto">
          {rest.map((stock, index) => {
            const peakScore = toNumber(stock.Peak_Score);
            const smartRank = toNumber(stock.SmartRank);
            const signalScore = toNumber(stock.Signal_Generated_Score);

            return (
              <div
                key={stock.Name}
                className="flex items-center justify-between px-6 py-4 border-b border-brand-border hover:bg-white/5 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="text-brand-muted font-mono text-sm">#{index + 6}</div>
                  <div className="text-white font-semibold">{stock.Name}</div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-brand-muted">Peak:</span>{' '}
                    <span className="text-white">{peakScore.toFixed(2)}</span>
                  </div>

                  <div>
                    <span className="text-brand-muted">Rank:</span>{' '}
                    <span className="text-white">{smartRank.toFixed(0)}</span>
                  </div>

                  <div className="w-24">
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bg-brand-accent h-full"
                        style={{ width: `${Math.min(signalScore, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
