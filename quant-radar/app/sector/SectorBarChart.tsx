"use client";

import React, { useMemo, useState } from "react";

/**
 * Sector-strength bar chart -- SVG rebuild of tradefinder's Sector Scope
 * "Heatmap" view (an ECharts canvas bar chart, one bar per sector, height =
 * signed net sector score, green above zero / red below, sorted descending).
 * Built framework-free since no chart library is in this project's deps.
 */
export default function SectorBarChart({
  sectors,
  onSelect,
  selected,
}: {
  sectors: { sec: string; net: number; n: number }[];
  onSelect: (sec: string | null) => void;
  selected: string | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const data = useMemo(() => [...sectors].sort((a, b) => b.net - a.net), [sectors]);
  if (data.length === 0) return null;

  const W = 1180, H = 360, PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 90;
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const maxAbs = Math.max(6, ...data.map((d) => Math.abs(d.net)));
  // pick a "nice" tick step (1/2/5 x10^n) so we get ~6-8 gridlines regardless of scale
  const rawStep = maxAbs / 3.5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1e-9))));
  const norm = rawStep / mag;
  const niceNorm = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  const step = Math.max(1, Math.round(niceNorm * mag));
  const yMax = Math.ceil(maxAbs / step) * step;
  const yMin = -yMax;
  const yToPx = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin)) * plotH;
  const zeroY = yToPx(0);
  const barW = Math.min(28, (plotW / data.length) * 0.32);
  const gap = plotW / data.length;
  const ticks = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(Math.round(v * 100) / 100);

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[#ffffff14] bg-[#050506] p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 720 }}>
        {/* gridlines + y labels */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD_L} x2={W - PAD_R} y1={yToPx(v)} y2={yToPx(v)}
              stroke={v === 0 ? "#ffffff2a" : "#ffffff12"}
              strokeDasharray={v === 0 ? undefined : "3,4"}
            />
            <text x={PAD_L - 8} y={yToPx(v) + 3} textAnchor="end" fontSize="10" fill="#6b7280" fontFamily="monospace">
              {v}
            </text>
          </g>
        ))}
        {/* bars */}
        {data.map((d, i) => {
          const cx = PAD_L + gap * i + gap / 2;
          const y0 = yToPx(Math.max(0, d.net));
          const y1 = yToPx(Math.min(0, d.net));
          const h = Math.max(1, y1 - y0);
          const pos = d.net >= 0;
          const gradId = `g-${pos ? "up" : "dn"}`;
          const isActive = selected === d.sec || hover === d.sec;
          return (
            <g
              key={d.sec}
              role="button"
              tabIndex={0}
              aria-label={`Scroll to ${d.sec.replace(/^NIFTY_/, "").replace(/_/g, " ")}`}
              onMouseEnter={() => setHover(d.sec)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(d.sec)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(d.sec);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={cx - barW / 2}
                y={y0}
                width={barW}
                height={h}
                rx={pos ? 4 : 0}
                ry={pos ? 4 : 0}
                fill={`url(#${gradId})`}
                opacity={selected && !isActive ? 0.35 : 1}
              />
              {!pos && (
                <rect x={cx - barW / 2} y={y1 - 0} width={barW} height={h} rx={4} ry={4}
                      fill="none" />
              )}
              {/* invisible full-height hit target for easier hover */}
              <rect x={cx - gap / 2} y={PAD_T} width={gap} height={plotH} fill="transparent" />
              <text
                x={cx}
                y={zeroY + (pos ? -h - 6 : h + 14)}
                textAnchor="middle"
                fontSize="10"
                fontFamily="monospace"
                fontWeight={isActive ? 700 : 400}
                fill={isActive ? "#ffffff" : "#9ca3af"}
              >
                {d.net.toFixed(1)}
              </text>
              <text
                transform={`translate(${cx}, ${H - PAD_B + 12}) rotate(60)`}
                textAnchor="start"
                fontSize="10"
                fontFamily="monospace"
                fill={isActive ? "#fce205" : "#9ca3af"}
                fontWeight={isActive ? 700 : 400}
              >
                {d.sec.replace(/^NIFTY_/, "").replace(/_/g, " ")}
              </text>
            </g>
          );
        })}
        <defs>
          <linearGradient id="g-up" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>
          <linearGradient id="g-dn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#f87171" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
