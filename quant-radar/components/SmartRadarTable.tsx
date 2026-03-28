"use client";

import { ExternalLink } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import type { RadarSignal } from "@/utils/backend";

type SortKey = "rank" | "name" | "side" | "module" | "entry" | "conf" | "rvol" | "pcr" | "move" | "time";

function formatPrice(value: number): string {
  return value ? `Rs. ${value.toFixed(2)}` : "-";
}

function formatPct(value: number): string {
  return value ? `${value > 0 ? "+" : ""}${value.toFixed(2)}%` : "-";
}

function shortTime(value: string): string {
  if (!value) {
    return "-";
  }

  if (value.includes("T")) {
    return value.slice(11, 16);
  }

  return value.length > 5 ? value.slice(0, 5) : value;
}

function sideTone(side: RadarSignal["Side"]) {
  if (side === "BULL") {
    return {
      color: "var(--color-bull)",
      bg: "var(--color-bullbg)",
      border: "var(--color-bullborder)",
    };
  }

  if (side === "BEAR") {
    return {
      color: "var(--color-bear)",
      bg: "var(--color-bearbg)",
      border: "var(--color-bearborder)",
    };
  }

  return {
    color: "var(--color-muted)",
    bg: "rgba(255, 255, 255, 0.04)",
    border: "var(--color-border)",
  };
}

export default function SmartRadarTable({ signals }: { signals: RadarSignal[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [ascending, setAscending] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const filtered = signals.filter((signal) => filter === "ALL" || signal.Side === filter);
  const sorted = [...filtered].sort((left, right) => {
    const compare = (() => {
      switch (sortKey) {
        case "name":
          return left.Name.localeCompare(right.Name);
        case "side":
          return left.Side.localeCompare(right.Side);
        case "module":
          return left.Module.localeCompare(right.Module);
        case "entry":
          return left.Entry - right.Entry;
        case "conf":
          return left.Confidence - right.Confidence;
        case "rvol":
          return left.RVOL - right.RVOL;
        case "pcr":
          return left.PCR - right.PCR;
        case "move":
          return left.DayMovePct - right.DayMovePct;
        case "time":
          return (left.FiredAt || left.EntryTime).localeCompare(right.FiredAt || right.EntryTime);
        case "rank":
        default:
          return left.SignalRank - right.SignalRank;
      }
    })();

    return ascending ? compare : -compare;
  });

  if (!signals.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="rounded-3xl border px-8 py-10 text-center"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
            SMART RADAR
          </div>
          <p className="mt-3 text-lg font-semibold" style={{ color: "var(--color-text2)" }}>
            No signals for the selected date.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex flex-wrap items-center gap-2 border-b px-4 py-3"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
      >
        {(["ALL", "BULL", "BEAR"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className="rounded-xl border px-3 py-1.5 font-mono text-[10px] tracking-[0.18em]"
            style={{
              color:
                filter === value
                  ? value === "BULL"
                    ? "var(--color-bull)"
                    : value === "BEAR"
                      ? "var(--color-bear)"
                      : "var(--color-accent)"
                  : "var(--color-muted)",
              borderColor:
                filter === value
                  ? value === "BULL"
                    ? "var(--color-bullborder)"
                    : value === "BEAR"
                      ? "var(--color-bearborder)"
                      : "rgba(45, 142, 255, 0.35)"
                  : "var(--color-border)",
              background:
                filter === value
                  ? value === "BULL"
                    ? "var(--color-bullbg)"
                    : value === "BEAR"
                      ? "var(--color-bearbg)"
                      : "var(--color-accentbg)"
                  : "rgba(255, 255, 255, 0.03)",
            }}
          >
            {value}
          </button>
        ))}

        <span className="ml-auto font-mono text-[10px] tracking-[0.22em]" style={{ color: "var(--color-muted)" }}>
          {sorted.length} SIGNALS
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="min-w-[1040px] w-full">
          <thead
            className="sticky top-0 z-10"
            style={{ background: "rgba(12, 18, 32, 0.96)", backdropFilter: "blur(10px)" }}
          >
            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
              {[
                ["time", "TIME"],
                ["name", "STOCK"],
                ["side", "SIDE"],
                ["module", "MODULE"],
                ["entry", "ENTRY"],
                ["conf", "CONF"],
                ["rvol", "RVOL"],
                ["pcr", "PCR"],
                ["move", "MOVE"],
                ["rank", "RANK"],
              ].map(([key, label]) => {
                const typedKey = key as SortKey;
                const active = sortKey === typedKey;
                return (
                  <th key={key} className="px-3 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => {
                        if (sortKey === typedKey) {
                          setAscending((current) => !current);
                        } else {
                          setSortKey(typedKey);
                          setAscending(false);
                        }
                      }}
                      className="font-mono text-[10px] tracking-[0.24em]"
                      style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
                    >
                      {label} {active ? (ascending ? "UP" : "DOWN") : ""}
                    </button>
                  </th>
                );
              })}
              <th
                className="px-3 py-3 text-right font-mono text-[10px] tracking-[0.24em]"
                style={{ color: "var(--color-muted)" }}
              >
                CHART
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((signal, index) => {
              const rowId = `${signal.Symbol || signal.Name}-${signal.FiredAt}-${index}`;
              const tone = sideTone(signal.Side);
              const isOpen = expanded === rowId;

              return (
                <Fragment key={rowId}>
                  <tr
                    onClick={() => setExpanded((current) => (current === rowId ? null : rowId))}
                    className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                    style={{
                      borderBottom: isOpen ? "none" : "1px solid rgba(28, 45, 69, 0.6)",
                      background: isOpen ? "rgba(45, 142, 255, 0.04)" : "transparent",
                    }}
                  >
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--color-muted2)" }}>
                      {shortTime(signal.FiredAt || signal.EntryTime)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm font-semibold" style={{ color: "var(--color-text2)" }}>
                        {signal.Name}
                      </div>
                      <div className="font-mono text-[10px] tracking-[0.18em]" style={{ color: "var(--color-muted)" }}>
                        {signal.Symbol || signal.Sector}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="inline-flex rounded-full border px-2 py-1 font-mono text-[10px] tracking-[0.2em]"
                        style={{ color: tone.color, background: tone.bg, borderColor: tone.border }}
                      >
                        {signal.Side}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--color-text2)" }}>
                      {signal.Module}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--color-text2)" }}>
                      {formatPrice(signal.Entry)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--color-gold)" }}>
                      {signal.Confidence.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--color-text)" }}>
                      {signal.RVOL ? `${signal.RVOL.toFixed(1)}x` : "-"}
                    </td>
                    <td
                      className="px-3 py-3 font-mono text-xs"
                      style={{
                        color:
                          signal.PCR < 0.65
                            ? "var(--color-bull)"
                            : signal.PCR > 1.2
                              ? "var(--color-bear)"
                              : "var(--color-text)",
                      }}
                    >
                      {signal.PCR ? signal.PCR.toFixed(2) : "-"}
                    </td>
                    <td
                      className="px-3 py-3 font-mono text-xs"
                      style={{
                        color:
                          signal.DayMovePct > 0
                            ? "var(--color-bull)"
                            : signal.DayMovePct < 0
                              ? "var(--color-bear)"
                              : "var(--color-muted)",
                      }}
                    >
                      {formatPct(signal.DayMovePct)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color: "var(--color-accent)" }}>
                      {signal.SignalRank.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <a
                        href={signal.Chart}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] tracking-[0.18em]"
                        style={{
                          color: "var(--color-accent)",
                          borderColor: "rgba(45, 142, 255, 0.35)",
                          background: "rgba(45, 142, 255, 0.1)",
                        }}
                      >
                        TV <ExternalLink size={10} />
                      </a>
                    </td>
                  </tr>

                  {isOpen ? (
                    <tr style={{ borderBottom: "1px solid rgba(28, 45, 69, 0.6)" }}>
                      <td colSpan={11} className="px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-4">
                          <InfoCard title="TRADE LEVELS">
                            <InfoRow label="Entry" value={formatPrice(signal.Entry)} tone="var(--color-text2)" />
                            <InfoRow label="Stop" value={formatPrice(signal.SL)} tone="var(--color-bear)" />
                            <InfoRow label="Target 1" value={formatPrice(signal.Target1)} tone="var(--color-bull)" />
                            <InfoRow label="Target 2" value={formatPrice(signal.Target2)} tone="rgba(0, 232, 154, 0.65)" />
                            <InfoRow label="R:R" value={signal.RR || "-"} tone="var(--color-text)" />
                          </InfoCard>

                          <InfoCard title="OPTIONS">
                            <InfoRow label="PCR" value={signal.PCR ? signal.PCR.toFixed(3) : "-"} tone="var(--color-text)" />
                            <InfoRow label="PCR signal" value={signal.PCRSignal || "-"} tone="var(--color-text)" />
                            <InfoRow label="ATM strike" value={signal.ATMStrike || "-"} tone="var(--color-text2)" />
                            <InfoRow label="Max pain" value={signal.MaxPain || "-"} tone="var(--color-text)" />
                            <InfoRow label="Strike rec" value={signal.StrikeRec || "-"} tone="var(--color-gold)" />
                          </InfoCard>

                          <InfoCard title="MARKET CONTEXT">
                            <InfoRow label="Sector" value={signal.Sector || "-"} tone="var(--color-text2)" />
                            <InfoRow label="RVOL" value={signal.RVOL ? `${signal.RVOL.toFixed(1)}x` : "-"} tone="var(--color-text)" />
                            <InfoRow label="RS score" value={signal.RSScore ? signal.RSScore.toFixed(1) : "-"} tone="var(--color-text)" />
                            <InfoRow label="Move" value={formatPct(signal.DayMovePct)} tone="var(--color-gold)" />
                            <InfoRow label="PE OI surge" value={signal.PEOISurge ? `${signal.PEOISurge.toFixed(1)}%` : "-"} tone="var(--color-text)" />
                          </InfoCard>

                          <InfoCard title="NOTES">
                            <InfoRow label="Direction" value={signal.Direction || signal.Side} tone="var(--color-text2)" />
                            <InfoRow label="Break" value={signal.BreakType || "-"} tone="var(--color-text)" />
                            <InfoRow label="Fired" value={signal.FiredAt || "-"} tone="var(--color-muted2)" />
                            <InfoRow label="Theme" value={signal.SectorTheme ? "Yes" : "No"} tone="var(--color-purple)" />
                            <p className="mt-3 text-xs" style={{ color: "var(--color-muted2)" }}>
                              {signal.Notes || "No notes available."}
                            </p>
                          </InfoCard>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)" }}>
      <div className="mb-2 font-mono text-[10px] tracking-[0.24em]" style={{ color: "var(--color-muted)" }}>
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3 font-mono text-xs">
      <span style={{ color: "var(--color-muted)" }}>{label}</span>
      <span style={{ color: tone }}>{value}</span>
    </div>
  );
}
