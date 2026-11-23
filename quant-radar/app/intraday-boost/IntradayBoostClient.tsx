"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildTradingViewUrl } from "@/utils/backend";
import {
  addChartWatchlistSymbol,
  CHART_WATCHLIST_STORAGE_KEY,
  CHART_WATCHLIST_UPDATED_EVENT,
  readChartWatchlist,
} from "@/utils/chartWatchlist";
import { buildRfacSectorScope, type RfacStockRow } from "@/utils/rfacSector";
import { SECTOR_MEMBERS } from "@/utils/sectorMembers";
import type { Snap } from "@/app/rusty/RustyClient";
import "./intraday-boost.css";

type Side = "bull" | "bear";
type SortKey = "rfac" | "currRfac" | "move" | "oiBias" | "rvol" | "peakCut";
type RfacBand = "ALL" | "GE1" | "GE15" | "GE2" | "EARLY";
type SideFilters = {
  band: RfacBand;
  hideStale: boolean;
  pdBroken: boolean;
  sort: SortKey;
  descending: boolean;
};

const defaultFilters: SideFilters = {
  band: "ALL",
  hideStale: false,
  pdBroken: false,
  sort: "rfac",
  descending: true,
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const fmt = (v?: number | null, sign = false) =>
  finite(v) ? `${sign && v > 0 ? "+" : ""}${v.toFixed(2)}` : "—";
const pct = (v?: number | null) =>
  finite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—";

export default function IntradayBoostClient({
  snaps,
  dateStr,
  controls,
  emptyMessage,
  status,
  onCutChange,
}: {
  snaps: Snap[];
  dateStr: string;
  controls?: ReactNode;
  emptyMessage?: ReactNode;
  status?: string;
  onCutChange?: (cut: string | null) => void;
}) {
  const cuts = useMemo(
    () =>
      [...new Map(snaps.map((s) => [s.cut || s.time || "", s])).entries()]
        .filter(([c]) => c)
        .sort((a, b) => a[0].localeCompare(b[0])),
    [snaps],
  );
  const [selectedCut, setSelectedCut] = useState<string | null>(null);
  const chooseCut = (cut: string | null) => {
    setSelectedCut(cut);
    onCutChange?.(cut);
  };
  const active =
    selectedCut === null
      ? cuts.length - 1
      : Math.max(
          0,
          cuts.findIndex(([c]) => c === selectedCut),
        );
  const snap = cuts[active]?.[1];
  const currentCut = cuts[active]?.[0] || "";
  const snapshotMissing = !!snap && !Array.isArray(snap.bull) && !Array.isArray(snap.bear);

  const [search, setSearch] = useState("");
  const [showSectors, setShowSectors] = useState(true);
  const [selectedSector, setSelectedSector] = useState<string>("");
  const [filters, setFilters] = useState<Record<Side, SideFilters>>({
    bull: { ...defaultFilters },
    bear: { ...defaultFilters },
  });
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [showSectorDetails, setShowSectorDetails] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const sync = () => setWatchlist(readChartWatchlist());
    const onStorage = (e: StorageEvent) => {
      if (e.key === CHART_WATCHLIST_STORAGE_KEY || e.key === null) sync();
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(CHART_WATCHLIST_UPDATED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (showSectorDetails) dialog.current?.showModal();
    else dialog.current?.close();
  }, [showSectorDetails]);

  const board = useMemo(() => {
    if (!snap || snapshotMissing) {
      return { cut: currentCut, sectors: [], bulls: [], bears: [], unmapped: 0 };
    }
    return buildRfacSectorScope(snap, SECTOR_MEMBERS);
  }, [snap, snapshotMissing, currentCut]);

  const sectors = useMemo(
    () =>
      board.sectors
        .filter((s) => s.available > 0)
        .sort(
          (a, b) =>
            Math.abs(b.netRfac ?? 0) - Math.abs(a.netRfac ?? 0) ||
            (b.avgRfac ?? 0) - (a.avgRfac ?? 0) ||
            a.sec.localeCompare(b.sec),
        ),
    [board.sectors],
  );

  const updateFilter = (side: Side, patch: Partial<SideFilters>) => {
    setFilters((cur) => ({ ...cur, [side]: { ...cur[side], ...patch } }));
  };

  const sortValue = (r: RfacStockRow, key: SortKey): number | null => {
    if (key === "peakCut") {
      const m = r.peakCut.match(/^(\d{2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    }
    const v = r[key];
    return finite(v) ? v : null;
  };

  const filterRows = (source: RfacStockRow[], side: Side) => {
    const f = filters[side];
    const q = search.trim().toUpperCase();
    const sectorSet = selectedSector ? new Set(SECTOR_MEMBERS[selectedSector] || []) : null;
    return source
      .filter((r) => {
        if (q && !r.symbol.includes(q)) return false;
        if (sectorSet && !sectorSet.has(r.symbol)) return false;
        if (f.hideStale && r.stale) return false;
        if (f.pdBroken && r.pdhPdlBroken !== "YES") return false;
        const rf = r.rfac ?? 0;
        if (f.band === "GE1" && rf < 1.0) return false;
        if (f.band === "GE15" && rf < 1.5) return false;
        if (f.band === "GE2" && rf < 2.0) return false;
        if (f.band === "EARLY" && rf >= 1.5) return false;
        return true;
      })
      .sort((a, b) => {
        const av = sortValue(a, f.sort);
        const bv = sortValue(b, f.sort);
        if (av === null) return bv === null ? a.symbol.localeCompare(b.symbol) : 1;
        if (bv === null) return -1;
        return (f.descending ? bv - av : av - bv) || a.symbol.localeCompare(b.symbol);
      });
  };

  const bullRows = useMemo(() => filterRows(board.bulls, "bull"), [board.bulls, filters, search, selectedSector]);
  const bearRows = useMemo(() => filterRows(board.bears, "bear"), [board.bears, filters, search, selectedSector]);
  const boostedBulls = useMemo(() => board.bulls.filter((r) => (r.rfac ?? 0) >= 1.5).length, [board.bulls]);
  const boostedBears = useMemo(() => board.bears.filter((r) => (r.rfac ?? 0) >= 1.5).length, [board.bears]);

  const renderBoard = (side: Side, rows: RfacStockRow[], totalSide: number, boostedCount: number) => {
    const f = filters[side];
    const isBull = side === "bull";
    return (
      <section className={`ib-side ${side}`} aria-label={`Intraday Boost ${isBull ? "Bulls" : "Bears"}`}>
        <div className="ib-side-strip">
          <div className="ib-side-head">
            <h2>{isBull ? "BULLS" : "BEARS"}</h2>
            <span className="ib-side-meta">
              {rows.length} shown · {boostedCount} ≥ 1.5 · {totalSide} total
            </span>
          </div>
          <div className="ib-side-controls">
            <select
              aria-label={`${side} R.Fac band filter`}
              value={f.band}
              onChange={(e) => updateFilter(side, { band: e.target.value as RfacBand })}
            >
              <option value="ALL">R.Fac: All</option>
              <option value="GE1">R.Fac ≥ 1.0</option>
              <option value="GE15">Boost ≥ 1.5</option>
              <option value="GE2">Extreme ≥ 2.0</option>
              <option value="EARLY">Early &lt; 1.5</option>
            </select>
            <label className="ib-check">
              <input
                type="checkbox"
                checked={f.hideStale}
                onChange={(e) => updateFilter(side, { hideStale: e.target.checked })}
              />
              Fresh only
            </label>
            <label className="ib-check">
              <input
                type="checkbox"
                checked={f.pdBroken}
                onChange={(e) => updateFilter(side, { pdBroken: e.target.checked })}
              />
              {isBull ? "PDH" : "PDL"} broken
            </label>
            <select
              aria-label={`${side} sort`}
              value={f.sort}
              onChange={(e) => updateFilter(side, { sort: e.target.value as SortKey })}
            >
              <option value="rfac">Sort: R.Fac</option>
              <option value="currRfac">Sort: Curr R.Fac</option>
              <option value="move">Sort: Move %</option>
              <option value="oiBias">Sort: OI Bias</option>
              <option value="rvol">Sort: RVOL</option>
              <option value="peakCut">Sort: Peak time</option>
            </select>
            <button
              type="button"
              aria-label={`${side} sort direction`}
              onClick={() => updateFilter(side, { descending: !f.descending })}
            >
              {f.descending ? "↓" : "↑"}
            </button>
          </div>
        </div>

        <div className="ib-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Stock</th>
                <th className="num">
                  <button type="button" className={`sort ${f.sort === "rfac" ? "selected" : ""}`} onClick={() => updateFilter(side, { sort: "rfac", descending: f.sort === "rfac" ? !f.descending : true })}>
                    R.Fac{f.sort === "rfac" ? (f.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th className="num">
                  <button type="button" className={`sort ${f.sort === "currRfac" ? "selected" : ""}`} onClick={() => updateFilter(side, { sort: "currRfac", descending: f.sort === "currRfac" ? !f.descending : true })}>
                    Curr{f.sort === "currRfac" ? (f.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th className="num">
                  <button type="button" className={`sort ${f.sort === "move" ? "selected" : ""}`} onClick={() => updateFilter(side, { sort: "move", descending: f.sort === "move" ? !f.descending : true })}>
                    Move %{f.sort === "move" ? (f.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th className="num">Peak @</th>
                <th className="num">
                  <button type="button" className={`sort ${f.sort === "oiBias" ? "selected" : ""}`} onClick={() => updateFilter(side, { sort: "oiBias", descending: f.sort === "oiBias" ? !f.descending : true })}>
                    OI Bias{f.sort === "oiBias" ? (f.descending ? " ↓" : " ↑") : ""}
                  </button>
                </th>
                <th className="num">{isBull ? "PDH" : "PDL"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r, i) => {
                  const rf = r.rfac ?? 0;
                  const rfClass = rf >= 3 ? "extreme" : rf >= 2 ? "hot" : rf >= 1.5 ? "boost" : "";
                  const barPct = Math.min(100, (rf / 4.0) * 100);
                  return (
                    <tr key={r.symbol}>
                      <td className="rank">{i + 1}</td>
                      <td>
                        <div className="stock-actions">
                          <span className="stock-name">{r.symbol}</span>
                          <button
                            type="button"
                            className="watch-add"
                            aria-label={`Add ${r.symbol} to Charts watchlist`}
                            disabled={watchlist.includes(r.symbol)}
                            onClick={() => setWatchlist(addChartWatchlistSymbol(r.symbol))}
                          >
                            {watchlist.includes(r.symbol) ? "✓" : "+"}
                          </button>
                          <a
                            className="tv-link"
                            href={buildTradingViewUrl(r.symbol, r.symbol)}
                            title={`Open ${r.symbol} on TradingView`}
                            aria-label={`Open ${r.symbol} on TradingView`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            ↗
                          </a>
                        </div>
                      </td>
                      <td className="num">
                        <div className="rfac-wrap">
                          <div className="rfac-bar">
                            <span style={{ width: `${barPct}%` }} />
                          </div>
                          <span className={`rfac-pill ${rfClass}`}>{fmt(r.rfac)}</span>
                        </div>
                      </td>
                      <td className="num">
                        <span className="muted-val">{fmt(r.currRfac)}</span>
                        {r.stale && <span className="stale-tag" title="Price reversed sharply off R.Fac peak">STALE</span>}
                      </td>
                      <td className={`num ${(r.move ?? 0) >= 0 ? "positive" : "negative"}`}>{pct(r.move)}</td>
                      <td className="num muted-val">{r.peakCut || "—"}</td>
                      <td className="num">{fmt(r.oiBias)}</td>
                      <td className="num">
                        <span className={`pd-pill ${r.pdhPdlBroken === "YES" ? "yes" : r.pdhPdlBroken === "NO" ? "no" : ""}`}>
                          {r.pdhPdlBroken === "YES" ? "BRK" : r.pdhPdlBroken === "NO" ? "HOLD" : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="empty">
                    {snapshotMissing
                      ? `Waiting for snapshot ${currentCut}…`
                      : currentCut && currentCut < "09:25"
                        ? "Waiting for 09:20 IST anchor candle (R.Fac activates at 09:25 IST)…"
                        : "No stocks match these filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div className="ib-view">
      <main className="ib-app">
        <header className="ib-top">
          <div className="ib-logo">⚡</div>
          <div>
            <h1 className="ib-brand">INTRADAY BOOST</h1>
          </div>
          <div className="ib-top-right">
            <div className="ib-date">{dateStr}</div>
            <div className="production-controls">{controls}</div>
            <button
              type="button"
              className={`ib-btn ${showSectors ? "active" : ""}`}
              aria-pressed={showSectors}
              onClick={() => setShowSectors((v) => !v)}
            >
              {showSectors ? "Hide Sector Scope" : "Show Sector Scope"}
            </button>
            <a className="ib-link" href={`/sector?date=${encodeURIComponent(dateStr)}`}>
              Sector Scope ↗
            </a>
            <a className="ib-link" href="/charts">
              Charts ↗
            </a>
          </div>
        </header>

        {status && (
          <div role="status" className="ib-status">
            {status}
          </div>
        )}

        {!cuts.length ? (
          <div className="ib-loading">{emptyMessage || "No Intraday Boost snapshots published for this date yet."}</div>
        ) : (
          <>
            <div className="ib-toolbar">
              <div className="timebox">
                <span className="cut-label">Snapshot</span>
                <button type="button" className="arrow" aria-label="Previous snapshot" disabled={active <= 0} onClick={() => chooseCut(cuts[active - 1][0])}>
                  ‹
                </button>
                <select aria-label="Snapshot time" value={currentCut} onChange={(e) => chooseCut(e.target.value)}>
                  {cuts.map(([cut]) => (
                    <option key={cut}>{cut}</option>
                  ))}
                </select>
                <button type="button" className="arrow" aria-label="Next snapshot" disabled={active >= cuts.length - 1} onClick={() => chooseCut(cuts[active + 1][0])}>
                  ›
                </button>
                <input
                  className="slider"
                  type="range"
                  aria-label="Snapshot timeline"
                  min={0}
                  max={Math.max(0, cuts.length - 1)}
                  value={active}
                  onChange={(e) => chooseCut(cuts[Number(e.target.value)][0])}
                />
              </div>
              <input
                className="search"
                aria-label="Search stocks"
                placeholder="Search a stock…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {selectedSector && (
                <button type="button" className="ib-btn active" onClick={() => setSelectedSector("")}>
                  Sector: {selectedSector} ×
                </button>
              )}
              <button type="button" className={`ib-btn ${selectedCut === null ? "active" : ""}`} onClick={() => chooseCut(null)}>
                {selectedCut === null ? "Latest · auto" : "Jump to latest"}
              </button>
            </div>

            {showSectors && (
              <div className="ib-sector-strip" aria-label="Sector Scope based on R.Fac">
                <div className="ib-sector-title">
                  SECTOR SCOPE
                  <span className="ib-sector-logic">R.FAC LOGIC</span>
                  <button type="button" onClick={() => setShowSectorDetails(true)}>
                    View details ↗
                  </button>
                  {selectedSector && (
                    <button type="button" className="clear-sec" onClick={() => setSelectedSector("")}>
                      All sectors
                    </button>
                  )}
                </div>
                {sectors.map((s) => {
                  const net = s.netRfac ?? 0;
                  const isActive = selectedSector === s.sec;
                  return (
                    <button
                      type="button"
                      className={`ib-sector-card ${isActive ? "selected" : ""}`}
                      key={s.sec}
                      onClick={() => setSelectedSector((cur) => (cur === s.sec ? "" : s.sec))}
                      title={`${s.sec}: Net R.Fac ${fmt(s.netRfac, true)} · Avg R.Fac ${fmt(s.avgRfac)} · ${s.bull} Bull / ${s.bear} Bear · ${s.boosted} boosted (≥1.5). Click to filter Bulls & Bears below.`}
                    >
                      <div className="ib-sec-top">
                        <b>{s.sec}</b>
                        <span className={net >= 0 ? "positive" : "negative"}>{fmt(s.netRfac, true)}</span>
                      </div>
                      <div className="ib-sec-line">
                        <span>Avg {fmt(s.avgRfac)}</span>
                        <span>
                          <span className="positive">{s.bull}↑</span> <span className="negative">{s.bear}↓</span>
                        </span>
                      </div>
                      <div className="ib-sec-bar">
                        <i style={{ width: `${s.valid ? (s.bull / s.valid) * 100 : 0}%` }} className="b" />
                        <i style={{ width: `${s.valid ? (s.bear / s.valid) * 100 : 0}%` }} className="r" />
                      </div>
                      <small>
                        Boost ≥1.5: {s.boosted} · {s.valid}/{s.total}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ib-boards">
              {renderBoard("bull", bullRows, board.bulls.length, boostedBulls)}
              {renderBoard("bear", bearRows, board.bears.length, boostedBears)}
            </div>

            <footer className="ib-foot">
              <span>
                {active + 1} / {cuts.length} · {currentCut} IST
              </span>
            </footer>
          </>
        )}
      </main>

      <dialog
        ref={dialog}
        className="ib-dialog"
        aria-label="Sector Scope R.Fac breakdown"
        onCancel={() => setShowSectorDetails(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowSectorDetails(false);
        }}
      >
        <aside className="ib-drawer">
          <div className="ib-drawer-top">
            <h2>Sector Scope (R.Fac Logic)</h2>
            <button type="button" className="close" autoFocus aria-label="Close details" onClick={() => setShowSectorDetails(false)}>
              ×
            </button>
          </div>

          {showSectorDetails ? (
            <>
              <p className="ib-explain">
                <b>{currentCut} IST</b> · Sector Scope ranks each sector using signed R.Fac: <b>+R.Fac</b> for Bulls and <b>−R.Fac</b> for Bears.
                <b> Net R.Fac</b> = average signed R.Fac across active sector members. Click any sector row to filter Bulls &amp; Bears.
              </p>
              {sectors.map((s) => (
                <div
                  className="ib-sec-detail"
                  key={s.sec}
                  onClick={() => {
                    setSelectedSector(s.sec);
                    setShowSectorDetails(false);
                  }}
                >
                  <div className="ib-sec-detail-top">
                    <b>{s.sec}</b>
                    <span className={(s.netRfac ?? 0) >= 0 ? "positive" : "negative"}>Net {fmt(s.netRfac, true)}</span>
                  </div>
                  <p>
                    Avg R.Fac {fmt(s.avgRfac)} · Bull avg {fmt(s.bullRfac)} ({s.bull}) · Bear avg {fmt(s.bearRfac)} ({s.bear})
                    <br />
                    Boosted ≥ 1.5: {s.boosted} ({s.boostedBull}B / {s.boostedBear}S) · Stale: {s.staleCount} · Coverage {s.valid}/{s.total}
                  </p>
                  <p className="ib-sec-members">
                    {s.stocks.slice(0, 10).map((r) => `${r.symbol} ${fmt(r.rfac)}`).join(" · ")}
                  </p>
                </div>
              ))}
            </>
          ) : null}
        </aside>
      </dialog>
    </div>
  );
}
