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

Solid intraday lines begin at their capture cut. Larger intraday timeframes round
observation times up, preventing earlier candle starts from showing future OI.
Daily charts show previous-session levels only. These snapshots are stamped by
scheduled capture cut, not an exact per-stock exchange update timestamp.

`export_chart_oi.py` copies a stable DB/WAL to a temporary snapshot and exports
four available sessions with health flags. It reads no secrets and performs no
publishing. `backfill_chart_oi.py` publishes only `chart_oi` documents through
the existing VM2 Oracle configuration. Other sources are unaffected.

Frontend changes live in `quant-radar/app/charts`. The existing cash candle
WebSocket and shared Rusty/Jaguar watchlist remain the feeds. OI errors are shown
independently of candles; last received OI time and expiry are visible.
