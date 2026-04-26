"use client";

import { Brain, Cpu, ExternalLink, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { DatePicker } from "@/components/Controls";
import type { AiPick, AiPayload } from "@/utils/backend";

function getTodayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatPrice(value: number): string {
  return value ? `Rs. ${value.toFixed(2)}` : "-";
}

function PickCard({ pick, rank }: { pick: AiPick; rank: number }) {
  const bullish = pick.Side === "BULL" || pick.Direction === "LONG";
  const accent = bullish ? "var(--color-bull)" : "var(--color-bear)";
  const probabilityTone =
    pick.AI_Win_Probability >= 70
      ? "var(--color-bull)"
      : pick.AI_Win_Probability >= 50
        ? "var(--color-gold)"
        : "var(--color-bear)";

  return (
    <div
      className="rounded-3xl border p-5"
      style={{ borderColor: `${accent}45`, background: "var(--color-surface)" }}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            #{rank} {pick.Name}
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            {pick.Symbol} {pick.Time}
          </div>
        </div>
        <span
          className="rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.18em]"
          style={{ color: accent, borderColor: `${accent}55`, background: `${accent}15` }}
        >
          {bullish ? "LONG" : "SHORT"}
        </span>
      </div>

      <div className="mb-4 rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[9px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
            AI WIN PROBABILITY
          </span>
          <span className="font-mono text-xl font-bold" style={{ color: probabilityTone }}>
            {pick.AI_Win_Probability.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: "rgba(255, 255, 255, 0.06)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(pick.AI_Win_Probability, 100)}%`,
              background: probabilityTone,
              animation: "bar-fill 0.7s ease both",
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniMetric label="Entry" value={formatPrice(pick.Entry)} color="var(--color-text2)" />
        <MiniMetric label="Target" value={formatPrice(pick.Target)} color="var(--color-bull)" />
        <MiniMetric label="Stop" value={formatPrice(pick.StopLoss)} color="var(--color-bear)" />
      </div>

      <a
        href={pick.Chart}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-[0.18em]"
        style={{
          color: "var(--color-accent)",
          borderColor: "rgba(45, 142, 255, 0.35)",
          background: "rgba(45, 142, 255, 0.1)",
        }}
      >
        OPEN CHART <ExternalLink size={10} />
      </a>
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border px-3 py-3" style={{ borderColor: "var(--color-border)" }}>
      <div className="font-mono text-[9px] tracking-[0.2em]" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="mt-1 font-mono text-xs font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export default function AIAnalysisPage() {
  return (
    <Suspense fallback={<AILoadingShell />}>
      <AIAnalysisPageContent />
    </Suspense>
  );
}

function AIAnalysisPageContent() {
  const searchParams = useSearchParams();
  const selectedDate = searchParams.get("date") ?? getTodayIstDate();

  const [payload, setPayload] = useState<AiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState("");

  const picks = payload?.top_ai_picks ?? [];
  const avgProbability = picks.length
    ? picks.reduce((sum, pick) => sum + pick.AI_Win_Probability, 0) / picks.length
    : 0;

  async function runAnalysis() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/ai?date=${selectedDate}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as AiPayload;
      setPayload(data);
      setLastRun(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="AI Analysis"
        subtitle="ML POWERED TOP PICKS · CATBOOST INFERENCE"
        badge="AI INFERENCE ENGINE"
        dateStr={selectedDate}
        accentColor="var(--color-purple)"
      >
        <DatePicker />
        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-mono text-[10px] tracking-[0.2em] disabled:opacity-60"
          style={{
            color: "var(--color-purple)",
            borderColor: "rgba(155, 111, 255, 0.35)",
            background: "rgba(155, 111, 255, 0.12)",
          }}
        >
          <Cpu size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "RUNNING" : "RUN AI"}
        </button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-5 py-5 lg:px-8">
        {!payload && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-3xl border"
              style={{
                color: "var(--color-purple)",
                borderColor: "rgba(155, 111, 255, 0.35)",
                background: "rgba(155, 111, 255, 0.12)",
              }}
            >
              <Brain size={34} />
            </div>
            <div>
              <h2 className="text-xl font-semibold" style={{ color: "var(--color-text2)" }}>
                CatBoost inference ready
              </h2>
              <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--color-muted2)" }}>
                Run AI scoring for the selected date and fetch the top unique trade ideas ranked by win probability.
              </p>
            </div>
            <button
              type="button"
              onClick={runAnalysis}
              className="inline-flex items-center gap-2 rounded-2xl border px-6 py-3 font-mono text-sm tracking-[0.18em]"
              style={{
                color: "var(--color-purple)",
                borderColor: "rgba(155, 111, 255, 0.35)",
                background: "rgba(155, 111, 255, 0.12)",
              }}
            >
              <Zap size={14} /> RUN AI ANALYSIS
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <div
                  key={index}
                  className="w-2 rounded-full"
                  style={{
                    height: `${20 + index * 6}px`,
                    background: "var(--color-purple)",
                    animation: `pulse-glow 0.8s ease ${index * 0.1}s infinite`,
                    opacity: 0.4 + index * 0.1,
                  }}
                />
              ))}
            </div>
            <p className="font-mono text-[11px] tracking-[0.28em]" style={{ color: "var(--color-purple)" }}>
              RUNNING AI INFERENCE
            </p>
          </div>
        ) : null}

        {!loading && error ? (
          <div
            className="rounded-3xl border px-6 py-8 text-center"
            style={{ borderColor: "var(--color-bearborder)", background: "var(--color-surface)" }}
          >
            <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-bear)" }}>
              AI INFERENCE FAILED
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
              {error}
            </p>
          </div>
        ) : null}

        {!loading && payload ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <MiniMetric label="Picks" value={String(picks.length)} color="var(--color-text2)" />
              <MiniMetric label="Avg win prob" value={`${avgProbability.toFixed(1)}%`} color="var(--color-purple)" />
              <MiniMetric label="Last run" value={lastRun || "-"} color="var(--color-muted2)" />
            </div>

            {picks.length ? (
              <div className="grid gap-5 xl:grid-cols-2">
                {picks.map((pick, index) => (
                  <PickCard key={`${pick.Symbol}-${index}`} pick={pick} rank={index + 1} />
                ))}
              </div>
            ) : (
              <div
                className="rounded-3xl border px-6 py-8 text-center"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
                  NO AI PICKS
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--color-muted2)" }}>
                  No signals were available for AI scoring on {selectedDate}.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AILoadingShell() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="font-mono text-[11px] tracking-[0.28em]" style={{ color: "var(--color-purple)" }}>
        LOADING AI MODULE
      </div>
    </div>
  );
}
