import { resolveDate, type DateSearchParams } from '../utils/date';
import { getInternalApiUrl } from '../utils/internalApi';
import PageHeader from '../components/PageHeader';
import { DatePicker, AutoRefresh } from '../components/Controls';
import SignalPulseClient from '../components/SignalPulseClient';

export const dynamic = 'force-dynamic';

type WatchlistItem = {
  Symbol: string;
  Direction: 'LONG' | 'SHORT';
  StoredAt: string;
};

type VelocityRow = {
  Name: string; Symbol: string; Side: 'BULL' | 'BEAR' | 'NEUTRAL';
  Module: string; Price: number; Confidence: number; RVOL: number;
  PCR: number; PCRAtOpen: number; ATMStrike: string; RR: string;
  RSScore: number; Time: string; Break: string; Chart: string;
};

type PulseData = {
  watchlist: WatchlistItem[];
  bulls: VelocityRow[];
  bears: VelocityRow[];
  bias: string;
  asOf: string | null;
};

async function getPulseData(dateStr: string): Promise<PulseData> {
  try {
    const url = await getInternalApiUrl(`/api/pulse?date=${encodeURIComponent(dateStr)}`);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { watchlist: [], bulls: [], bears: [], bias: 'NEUTRAL', asOf: null };
    return res.json();
  } catch {
    return { watchlist: [], bulls: [], bears: [], bias: 'NEUTRAL', asOf: null };
  }
}

export default async function PulsePage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const data = await getPulseData(dateStr);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="Signal Pulse"
        subtitle="PCR WATCHLIST · BULL/BEAR CONVICTION"
        badge="LIVE VELOCITY"
        dateStr={dateStr}
        accentColor="var(--color-bull)"
      >
        <DatePicker />
        <AutoRefresh interval={30000} />
      </PageHeader>

      {/* Bias strip */}
      <div
        className="flex items-center gap-6 px-6 py-3 border-b shrink-0"
        style={{
          borderColor: 'var(--color-border)',
          background: data.bias === 'BULLISH'
            ? 'rgba(0,232,154,0.06)'
            : data.bias === 'BEARISH'
            ? 'rgba(255,59,107,0.06)'
            : 'var(--color-surface)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] tracking-[0.25em]" style={{ color: 'var(--color-muted)' }}>
            MARKET BIAS
          </span>
          <span
            className="font-mono text-sm font-bold tracking-widest"
            style={{
              color: data.bias === 'BULLISH' ? 'var(--color-bull)'
                : data.bias === 'BEARISH' ? 'var(--color-bear)'
                : 'var(--color-gold)',
            }}
          >
            {data.bias}
          </span>
        </div>
        <div className="w-px h-4" style={{ background: 'var(--color-border)' }} />
        <div className="flex items-center gap-4">
          <div>
            <span className="font-mono text-[8px] tracking-widest" style={{ color: 'var(--color-muted)' }}>BULLS </span>
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-bull)' }}>{data.bulls.length}</span>
          </div>
          <div>
            <span className="font-mono text-[8px] tracking-widest" style={{ color: 'var(--color-muted)' }}>BEARS </span>
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-bear)' }}>{data.bears.length}</span>
          </div>
          <div>
            <span className="font-mono text-[8px] tracking-widest" style={{ color: 'var(--color-muted)' }}>WATCHLIST </span>
            <span className="font-mono text-sm font-bold" style={{ color: 'var(--color-accent)' }}>{data.watchlist.length}</span>
          </div>
        </div>
        {data.asOf && (
          <>
            <div className="w-px h-4" style={{ background: 'var(--color-border)' }} />
            <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>
              AS OF {data.asOf.slice(11, 16) || data.asOf}
            </span>
          </>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <SignalPulseClient data={data} />
      </div>
    </div>
  );
}
