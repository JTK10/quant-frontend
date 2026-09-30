# Charts OI overlay

The optional publisher uses already captured `chain_rows`, after existing
scanner publishes finish. No broker requests or changes to entry/rank logic.
The import, calculation and post are inside an exception boundary and a
10-second total timeout. Its failure is logged and does not fail a scan cut.

For each underlying's front expiry, publish two largest PE OI strikes below
spot and two largest CE OI strikes above spot, within 6% of spot. Rank by total
open positions, not percentage growth from a tiny baseline. Each strike also
carries OI minus the provider's previous-session OI. No buying/writing inference.

The API loads today and the three most recent captured sessions, looking back
at most ten calendar days. Current and historical expiry are labelled. Expired
historical contracts remain in the details panel but are not projected onto
today's chart. Partial snapshots do not produce indicator lines.

Charts display previous-session levels only, as solid 3px horizontal lines:
purple for PE support and orange for CE resistance. Levels use the last captured
snapshot of each prior session and begin on the selected chart session.
Intraday overlays and the intraday OI control were removed at the user's request.
Captured snapshots remain the source for subsequent sessions' historical levels.

For fast loading, `chart_oi_close` publishes one compact snapshot at 15:25.
The API fetches three previous weekdays concurrently, skips today's history,
and caches completed sessions for five minutes across symbols. Missing closing
summaries fall back to the captured history, including sessions where the final
cut failed. The browser also reuses completed results for five minutes.
Use `backfill_chart_oi.py --closing-only` to create summaries from a verified export.

`export_chart_oi.py` copies a stable DB/WAL to a temporary snapshot and exports
four available sessions with health flags. It reads no secrets and performs no
publishing. `backfill_chart_oi.py` publishes only `chart_oi` documents through
the existing VM2 Oracle configuration. Other sources are unaffected.

Frontend changes live in `quant-radar/app/charts`. The existing cash candle
WebSocket and shared Rusty/Jaguar watchlist remain the feeds. OI errors are shown
independently of candles; last received OI time and expiry are visible.
