'use client';

import { useState } from 'react';
import { Brain, Cpu, TrendingUp, TrendingDown, ExternalLink, Zap } from 'lucide-react';

type AIPick = {
  Name: string; Symbol: string; Side: string;
  Entry: number; Target: number; StopLoss: number;
  AI_Win_Probability: number; Time: string;
  Module?: string; Direction?: string;
};

function PickCard({ pick, rank }: { pick: AIPick; rank: number }) {
  const isBull = pick.Side?.includes('BULL') || pick.Direction === 'LONG';
  const accent = isBull ? 'var(--color-bull)' : 'var(--color-bear)';
  const prob = pick.AI_Win_Probability ?? 0;
  const probColor = prob >= 70 ? 'var(--color-bull)' : prob >= 50 ? 'var(--color-gold)' : 'var(--color-bear)';
  const tvUrl = `https://www.tradingview.com/chart/?symbol=NSE:${pick.Symbol ?? pick.Name}&interval=5`;

  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ background: 'var(--color-surface)', border: `1px solid ${accent}30` }}
    >
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}60, transparent)` }} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-mono text-xs font-bold shrink-0"
              style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}
            >
              #{rank}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base" style={{ color: 'var(--color-text2)' }}>{pick.Name}</span>
                <span
                  className="font-mono text-[8px] px-1.5 py-0.5 rounded tracking-widest"
                  style={{ color: accent, background: `${accent}18` }}
                >
                  {isBull ? 'LONG' : 'SHORT'}
                </span>
              </div>
              <div className="font-mono text-[9px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{pick.Time}</div>
            </div>
          </div>
          <a
            href={tvUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-mono text-[8px] px-2 py-1 rounded hover:opacity-70 transition-opacity"
            style={{ color: 'var(--color-accent)', background: 'var(--color-accentbg)', border: '1px solid rgba(45,142,255,0.2)' }}
          >
            TV <ExternalLink size={7} />
          </a>
        </div>

        {/* Win probability */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="font-mono text-[8px] tracking-widest" style={{ color: 'var(--color-muted)' }}>AI WIN PROBABILITY</span>
            <span className="font-mono text-lg font-bold" style={{ color: probColor }}>{prob.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(prob, 100)}%`, background: probColor, animation: 'bar-fill 0.8s ease both' }}
            />
          </div>
        </div>

        {/* Trade levels */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { l: 'ENTRY', v: pick.Entry ? `₹${pick.Entry.toFixed(2)}` : '—', c: 'var(--color-text2)' },
            { l: 'TARGET', v: pick.Target ? `₹${pick.Target.toFixed(2)}` : '—', c: 'var(--color-bull)' },
            { l: 'STOP LOSS', v: pick.StopLoss ? `₹${pick.StopLoss.toFixed(2)}` : '—', c: 'var(--color-bear)' },
          ].map(({ l, v, c }) => (
            <div key={l} className="rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
              <div className="font-mono text-[7px] tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>{l}</div>
              <div className="font-mono text-[11px] font-bold" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AIAnalysisPage() {
  const [picks, setPicks] = useState<AIPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState('');

  const todayIST = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  async function runAnalysis() {
    setLoading(true);
    setHasRun(true);
    setError('');
    try {
      const res = await fetch(`/api/ai?date=${todayIST}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.top_ai_picks ?? [];
      setPicks(rows.slice(0, 5));
      const now = new Date();
      setLastRun(new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const avgProb = picks.length ? picks.reduce((a, p) => a + p.AI_Win_Probability, 0) / picks.length : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div
        className="px-8 py-6 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="absolute top-0 left-0 w-96 h-full pointer-events-none" style={{
          background: 'radial-gradient(ellipse at left top, rgba(155,111,255,0.12) 0%, transparent 60%)',
        }} />
        <div className="relative flex items-start justify-between">
          <div>
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9px] tracking-[0.2em] mb-3"
              style={{ background: 'rgba(155,111,255,0.1)', border: '1px solid rgba(155,111,255,0.25)', color: 'var(--color-purple)' }}
            >
              <Brain size={9} /> AI INFERENCE ENGINE
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text2)' }}>AI Analysis</h1>
            <p className="font-mono text-[10px] tracking-widest mt-1" style={{ color: 'var(--color-muted)' }}>
              ML-POWERED TOP PICKS · CatBoost Inference · {todayIST}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastRun && (
              <span className="font-mono text-[9px]" style={{ color: 'var(--color-muted)' }}>
                LAST RUN {lastRun} IST
              </span>
            )}
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs tracking-wider font-semibold transition-all disabled:opacity-50"
              style={{
                background: loading ? 'rgba(155,111,255,0.1)' : 'rgba(155,111,255,0.15)',
                border: '1px solid rgba(155,111,255,0.35)',
                color: 'var(--color-purple)',
              }}
            >
              <Cpu size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'RUNNING AI...' : hasRun ? 'RUN AGAIN' : 'RUN AI ANALYSIS'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {/* Idle state */}
        {!hasRun && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(155,111,255,0.1)', border: '1px solid rgba(155,111,255,0.25)' }}
            >
              <Brain size={32} style={{ color: 'var(--color-purple)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text2)' }}>
                CatBoost Inference Ready
              </h2>
              <p className="text-sm max-w-md" style={{ color: 'var(--color-muted)' }}>
                Runs ML scoring on today's SIGNAL_ALL data. Ranks top 5 unique stocks by predicted win probability.
              </p>
            </div>
            <div className="flex gap-4">
              {['Confidence', 'RVOL', 'Day Move %', 'RS Score', 'PCR', 'Body %', 'Module', 'Direction', 'Sector'].map((f) => (
                <span
                  key={f}
                  className="font-mono text-[8px] px-2 py-1 rounded"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)' }}
                >
                  {f}
                </span>
              ))}
            </div>
            <button
              onClick={runAnalysis}
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-mono text-sm tracking-wider font-bold transition-all hover:scale-105"
              style={{
                background: 'rgba(155,111,255,0.15)',
                border: '1px solid rgba(155,111,255,0.4)',
                color: 'var(--color-purple)',
              }}
            >
              <Zap size={14} /> RUN AI ANALYSIS
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-2 h-8 rounded-full"
                  style={{
                    background: 'var(--color-purple)',
                    animation: `pulse-glow 0.8s ease ${i * 0.12}s infinite`,
                    opacity: 0.3 + i * 0.15,
                  }}
                />
              ))}
            </div>
            <p className="font-mono text-xs tracking-[0.3em]" style={{ color: 'var(--color-purple)' }}>
              RUNNING AI INFERENCE...
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && hasRun && error && (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-bearborder)' }}
          >
            <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-bear)' }}>
              AI INFERENCE FAILED: {error}
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && hasRun && !error && (
          <>
            {/* Summary stats */}
            {picks.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                  { l: 'TOP PICKS', v: picks.length, c: 'var(--color-text2)' },
                  { l: 'AVG WIN PROB', v: `${avgProb.toFixed(1)}%`, c: 'var(--color-purple)' },
                  { l: 'HIGH CONVICTION (≥70%)', v: picks.filter((p) => p.AI_Win_Probability >= 70).length, c: 'var(--color-bull)' },
                ].map(({ l, v, c }) => (
                  <div
                    key={l}
                    className="rounded-xl p-5"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="font-mono text-[8px] tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>{l}</div>
                    <div className="text-3xl font-bold" style={{ color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            {picks.length === 0 ? (
              <div
                className="rounded-xl p-12 text-center"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <p className="font-mono text-xs tracking-widest" style={{ color: 'var(--color-muted)' }}>
                  NO AI PICKS — NO SIGNALS AVAILABLE FOR TODAY
                </p>
              </div>
            ) : (
              <div className="grid xl:grid-cols-2 gap-5">
                {picks.map((pick, i) => (
                  <PickCard key={`${pick.Name}-${i}`} pick={pick} rank={i + 1} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
