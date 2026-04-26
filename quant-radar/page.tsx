import { Suspense } from 'react';
import { resolveDate, type DateSearchParams } from './utils/date';
import { getInternalApiUrl } from './utils/internalApi';
import PageHeader from './components/PageHeader';
import { DatePicker, AutoRefresh } from './components/Controls';
import SmartRadarTable from './components/SmartRadarTable';

export const dynamic = 'force-dynamic';

type Signal = {
  Name: string; Symbol: string; Side: 'BULL' | 'BEAR' | 'NEUTRAL';
  Module: string; Entry: number; SL: number; Target1: number; Target2: number;
  RR: string; Confidence: number; RVOL: number; PCR: number; PCR_Signal: string;
  BodyPct: number; DayMovePct: number; RSScore: number; CallWall: string; PutWall: string;
  ATMStrike: string; MaxPain: string; PEOISurge: number; StrikeRec: string; Notes: string;
  SectorTheme: boolean; Direction: string; LevelPrice: number; PDH: number; PDL: number;
  BreakTime: string; RetestTime: string; EntryTime: string; SLPct: number; T1MovePct: number;
  ATMIV: number; HasOptions: boolean; FiredAt: string; SignalRank: number; Chart: string;
};

async function getSignals(dateStr: string): Promise<Signal[]> {
  try {
    const url = await getInternalApiUrl(`/api/radar?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    return res.json();
  } catch { return []; }
}

export default async function RadarPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const signals = await getSignals(dateStr);

  const bulls = signals.filter((s) => s.Side === 'BULL').length;
  const bears = signals.filter((s) => s.Side === 'BEAR').length;
  const highConv = signals.filter((s) => s.Confidence >= 4).length;
  const withOptions = signals.filter((s) => s.HasOptions).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Smart Radar"
        subtitle="BREAKOUT RETEST SIGNALS · PCR CONFIRMED"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="var(--color-accent)"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>

      {/* Stats bar */}
      <div
        className="flex items-center gap-0 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        {[
          { label: 'TOTAL SIGNALS', value: signals.length, color: 'var(--color-text2)' },
          { label: 'BULLISH', value: bulls, color: 'var(--color-bull)' },
          { label: 'BEARISH', value: bears, color: 'var(--color-bear)' },
          { label: 'HIGH CONV (≥4)', value: highConv, color: 'var(--color-gold)' },
          { label: 'WITH OPTIONS', value: withOptions, color: 'var(--color-purple)' },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="flex-1 px-5 py-3 relative"
            style={{ borderRight: i < 4 ? '1px solid var(--color-border)' : 'none' }}
          >
            <div className="font-mono text-[8px] tracking-[0.22em] mb-0.5" style={{ color: 'var(--color-muted)' }}>
              {stat.label}
            </div>
            <div className="text-xl font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<LoadingState />}>
          <SmartRadarTable signals={signals} />
        </Suspense>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="font-mono text-xs tracking-[0.3em] mb-3" style={{ color: 'var(--color-accent)' }}>
          SCANNING MARKET
        </div>
        <div className="flex gap-1.5 justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--color-accent)',
                animation: `pulse-glow 1.2s ease ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
