"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import symbolMapData from "@/utils/symbolMap.json";

const symbolMap: Record<string, string> = symbolMapData as any;
const ACCENT = "#38bdf8";
const GLASS = "rgba(255,255,255,0.03)";
const HEAD_BG = "rgba(56,189,248,0.10)";

type Name = {
  sym: string;
  side?: string;
  n_top3?: number;
  first?: string;
  tier: string;
};

const LAYOUTS = [
  { key: "1", label: "1", cols: 1, panes: 1 },
  { key: "2", label: "2", cols: 2, panes: 2 },
  { key: "3", label: "3", cols: 3, panes: 3 },
  { key: "4", label: "4", cols: 2, panes: 4 },
] as const;

const INTERVALS = ["1", "3", "5", "15", "60", "D"] as const;

/** LYNX publishes futures underlyings (POWERINDIA); TradingView wants the cash
 * ticker (POWERINDIA -> POWERINDIA, but SWIGGY/TMPV style renames differ). The
 * same symbolMap the TradingView links already use is reused here so a name
 * clicked on the LYNX page and a name loaded into a pane resolve identically. */
function tvSymbol(raw: string): string {
  const cleaned = (raw || "").replace(/\s+/g, "").toUpperCase();
  return `NSE:${symbolMap[cleaned] || cleaned}`;
}

function Pane({
  symbol,
  interval,
  theme,
}: {
  symbol: string;
  interval: string;
  theme: string;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";
    // TradingView's embed script reads its config from the script tag's own
    // text content and replaces the container -- it is not a React component,
    // so the node is rebuilt on every symbol/interval change rather than
    // mutated. Cheap: one iframe per pane.
    const s = document.createElement("script");
    s.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Asia/Kolkata",
      theme,
      style: "1",
      locale: "en",
      hide_side_toolbar: true,
      allow_symbol_change: false,
      save_image: false,
      details: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });
    el.appendChild(s);
    return () => {
      el.innerHTML = "";
    };
  }, [symbol, interval, theme]);

  return (
    <div
      className="tradingview-widget-container h-full w-full"
      ref={host}
      style={{ minHeight: 0 }}
    />
  );
}

export default function ChartsClient({ names }: { names: Name[] }) {
  const [layout, setLayout] = useState<string>("4");
  const [interval, setInterval] = useState<string>("5");
  const [slots, setSlots] = useState<string[]>([
    "NIFTY",
    "BANKNIFTY",
    "RELIANCE",
    "HDFCBANK",
  ]);
  const [active, setActive] = useState(0);
  const [typed, setTyped] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [full, setFull] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Real fullscreen on the GRID, not a CSS fake: the nav rail and page header
  // live outside this component and cannot be hidden from here, and a
  // position:fixed overlay would still sit under them in the stacking order.
  const toggleFull = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Restore from the URL so a grid can be bookmarked or shared. Runs once;
  // writes below are replaceState so the back button is not filled with noise.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("s");
    if (s) setSlots(s.split(",").slice(0, 4).map((x) => x.toUpperCase()));
    if (p.get("l")) setLayout(p.get("l") as string);
    if (p.get("i")) setInterval(p.get("i") as string);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set("s", slots.join(","));
    p.set("l", layout);
    p.set("i", interval);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [slots, layout, interval]);

  const cfg = LAYOUTS.find((l) => l.key === layout) || LAYOUTS[3];

  const setSlot = useCallback(
    (i: number, sym: string) => {
      const v = (sym || "").trim().toUpperCase();
      if (!v) return;
      setSlots((prev) => {
        const next = [...prev];
        next[i] = v;
        return next;
      });
    },
    []
  );

  const ranked = useMemo(() => names.filter((n) => n.tier === "RANKED"), [names]);
  const gated = useMemo(() => names.filter((n) => n.tier !== "RANKED"), [names]);

  const chip = (n: Name) => (
    <button
      key={n.sym}
      onClick={() => setSlot(active, n.sym)}
      title={`load into pane ${active + 1}`}
      className="rounded border px-2 py-1 text-[11px] transition hover:brightness-125"
      style={{
        borderColor: "rgba(255,255,255,0.12)",
        background:
          n.side === "LONG" ? "rgba(74,222,128,0.10)" : "rgba(248,113,113,0.10)",
        color: "#e5e7eb",
      }}
    >
      {n.sym}
      {n.n_top3 ? (
        <span style={{ color: ACCENT }}> ×{n.n_top3}</span>
      ) : (
        <span className="text-zinc-600"> {n.first ?? ""}</span>
      )}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
      {/* ---- controls ---------------------------------------------------- */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 px-2 py-1"
        style={{ background: GLASS }}
      >
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-500">
            Panes
          </span>
          {LAYOUTS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLayout(l.key)}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: layout === l.key ? HEAD_BG : "transparent",
                color: layout === l.key ? ACCENT : "#9ca3af",
                border: `1px solid ${layout === l.key ? ACCENT : "rgba(255,255,255,0.10)"}`,
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-500">
            TF
          </span>
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval(iv)}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: interval === iv ? HEAD_BG : "transparent",
                color: interval === iv ? ACCENT : "#9ca3af",
                border: `1px solid ${interval === iv ? ACCENT : "rgba(255,255,255,0.10)"}`,
              }}
            >
              {iv}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">
            Target pane
          </span>
          {Array.from({ length: cfg.panes }).map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: active === i ? HEAD_BG : "transparent",
                color: active === i ? ACCENT : "#9ca3af",
                border: `1px solid ${active === i ? ACCENT : "rgba(255,255,255,0.10)"}`,
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowPicker((v) => !v)}
          className="rounded px-2 py-1 text-[11px]"
          style={{
            border: `1px solid ${showPicker ? ACCENT : "rgba(255,255,255,0.10)"}`,
            color: showPicker ? ACCENT : "#9ca3af",
            background: showPicker ? HEAD_BG : "transparent",
          }}
        >
          LYNX {names.length ? `(${names.length})` : ""} {showPicker ? "▴" : "▾"}
        </button>

        <button
          onClick={toggleFull}
          title="fullscreen grid"
          className="rounded px-2 py-1 text-[11px]"
          style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}
        >
          {full ? "✕ exit" : "⛶ full"}
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSlot(active, typed);
            setTyped("");
          }}
          className="flex items-center gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`symbol -> pane ${active + 1}`}
            className="w-44 rounded border border-white/10 bg-black/30 px-2 py-1 text-[12px] outline-none focus:border-sky-400"
          />
          <button
            type="submit"
            className="rounded px-2 py-1 text-[11px]"
            style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}
          >
            load
          </button>
        </form>
      </div>

      {/* ---- LYNX picker ------------------------------------------------- */}
      {showPicker && (ranked.length > 0 || gated.length > 0) && (
        <div
          className="rounded-lg border border-white/10 px-3 py-2"
          style={{ background: GLASS }}
        >
          {ranked.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-500">
                LYNX ranked
              </span>
              {ranked.map(chip)}
            </div>
          )}
          {gated.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] uppercase tracking-widest text-zinc-500">
                Early gate
              </span>
              {gated.map(chip)}
            </div>
          )}
        </div>
      )}

      {/* ---- the grid ---------------------------------------------------- */}
      <div
        ref={gridRef}
        className="grid min-h-0 flex-1 gap-1"
        style={{
          background: "#0A0A0B",
          padding: full ? "4px" : 0,
          gridTemplateColumns: `repeat(${cfg.cols}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {Array.from({ length: cfg.panes }).map((_, i) => (
          <div
            key={i}
            onClick={() => setActive(i)}
            className="relative min-h-0 overflow-hidden rounded-lg border"
            style={{
              borderColor:
                active === i ? ACCENT : "rgba(255,255,255,0.10)",
              background: "#0d0d10",
            }}
          >
            <div className="absolute left-2 top-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] tracking-wider text-zinc-400">
              {i + 1} · {slots[i]}
            </div>
            <Pane
              symbol={tvSymbol(slots[i])}
              interval={interval}
              theme="dark"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
