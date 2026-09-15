"use client";

import { buildTradingViewUrl } from "@/utils/backend";

type JaguarRow = {
  sym: string;
  spot: number;
  ce_cr: number;
  pe_cr: number;
  diff_cr: number;
  capitulation: boolean;
  side: string;
};

const fmt = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "--"
    : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

function JaguarBoard({
  title,
  rows,
  tint,
}: {
  title: string;
  rows: JaguarRow[];
  tint: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline gap-3 px-1 pb-2">
        <h2 className="text-[13px] font-semibold tracking-[0.14em]" style={{ color: tint }}>
          {title}
        </h2>
        <span className="text-[11px] text-white/35">
          {rows.length} {rows.length === 1 ? "signal" : "signals"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-[#101013]">
            <tr className="text-[10px] uppercase tracking-[0.1em] text-white/40">
              <th className="px-3 py-2 text-left font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Spot</th>
              <th className="px-3 py-2 text-right font-medium">CE ₹Cr</th>
              <th className="px-3 py-2 text-right font-medium">PE ₹Cr</th>
              <th className="px-3 py-2 text-right font-medium">Diff ₹Cr</th>
              <th className="px-3 py-2 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[12px] text-white/30">
                  No signals met the strict capitulation criteria.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.sym} className="border-t border-white/[0.05] hover:bg-white/[0.03]">
                <td className="px-3 py-1.5 font-medium">
                  <a
                    href={buildTradingViewUrl(r.sym, r.sym)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-white/20 decoration-dotted underline-offset-[3px] transition hover:decoration-white/70"
                    title={`Open ${r.sym} on TradingView`}
                  >
                    {r.sym}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/80">{fmt(r.spot, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmt(r.ce_cr, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{fmt(r.pe_cr, 2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold" style={{ color: tint }}>
                  {fmt(Math.abs(r.diff_cr), 2)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {r.capitulation && (
                    <span
                      className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold tracking-wide"
                      style={{ background: `${tint}22`, color: tint }}
                      title="Opposite side is trapped (Notional flow is negative)"
                    >
                      CAPITULATION
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JaguarClient({
  bulls,
  bears,
}: {
  bulls: JaguarRow[];
  bears: JaguarRow[];
}) {
  return (
    <div className="absolute inset-0 flex flex-col gap-6 p-3 md:flex-row md:p-6 overflow-hidden">
      {/* Bull Board */}
      <JaguarBoard
        title="BULLISH BREAKOUTS"
        rows={bulls}
        tint="var(--color-bull)"
      />

      {/* Divider */}
      <div className="hidden w-[1px] bg-white/[0.07] md:block" />

      {/* Bear Board */}
      <JaguarBoard
        title="BEARISH BREAKOUTS"
        rows={bears}
        tint="var(--color-bear)"
      />
    </div>
  );
}
