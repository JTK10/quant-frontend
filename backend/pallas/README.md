# Pallas production integration

Pallas uses the corrected causal Frontier 1 engine. Numeric gates are unchanged. There is no daily cap, stop/target model or claimed trading win rate.

## Existing inputs

- VM1 `/home/ubuntu/chart-stream/server.py` tails the existing Footprint recorder. Pallas subscribes with `history:false`; no historical files are loaded for this client and no broker connection is added.
- Original recorder receipt and exchange trade times travel with updates. Per-client bounded queues prevent a slow Pallas connection from stalling the other charts. The existing recorder also flushes on the next message after one second, alongside its original 200-message limit; subscriptions and stored records are unchanged.
- VM2 Ocelot exports the same retained option rows and already fetched Rusty completed candles to `/home/ubuntu/pallas/input/YYYYMMDD-HHMM.json`, after its retained publishers. Contract response receipt times are recorded during the existing requests. No additional broker requests or live DuckDB readers.
- Same-expiry prior-session walls come from existing `chart_oi_close` documents using the actual prior closed cash session. Missing walls remain missing annotations, not invented zeros or a new mandatory gate.

## Decisions and recovery

Closed candles establish the pole and flag. The observed opening candle's open replaces the initial opening-quote fallback once that candle closes. A fresh VM1 tick crossing that structure can issue `EARLY_TICK` using only a chain already available at that tick's arrival. Exchange/transport timestamps must be at most ten seconds old; OI capture age is bounded to one five-minute cycle plus sixty seconds. Connection gaps reset crossing baselines and invalidate queued ticks from the previous connection.

`CONFIRMED_CLOSE` evaluates a completed candle with the available current cut's chain. The early alert's premium, wall buildup and OI fields stay frozen; only its candle confirmation status changes. Early alerts can fail confirmation. The option premium is a dated reference quote, never an asserted fill. No auto-order execution.

Inputs, events and the publish outbox are durable. Cached captures reconstruct closed-candle state on restart; newly recovered historical decisions are explicitly marked `Recovered`, with actual recovery issue time. Stable event IDs and client-side document deduplication prevent retry/restart duplicates from changing frozen fields. Input files retain ten calendar days. Event and sent-document files remain available for audit; monitor disk growth before introducing any deletion policy.

The worker is `/home/ubuntu/pallas/pallas_live.py`, run through the existing Ocelot venv, with only `websockets==15.0.1` installed into its isolated `deps` directory. `pallas.service` has MemoryHigh 96 MiB, MemoryMax 128 MiB, CPUQuota 25% and Nice 15. It publishes scoped `source=pallas` documents through the existing ORDS configuration. Credentials stay on the host.

## Website

`/pallas` and `/api/pallas` use the existing login/session protection. Reads use `src=pallas` and a single `sig_date`, bounded pagination and private/no-store caching. Only documents, quotes, completed candles and events available by the requested time are returned. Later status updates cannot rewrite signal-time fields.

The compact board has New breakouts, Active signals, Flag forming and Pole watch. Active signals sort by premium change descending; missing quotes sort last. `+` uses the existing Charts watchlist helper and storage key. TradingView uses the established symbol mapping. Wall buildup is frozen at the signal, separately from later quote changes.

Historical replay covers September 25, 28, 29, 30 and October 1, 2026: 10, 47, 43, 17 and 19 corrected signals. Candidate membership is recomputed from each closed-bar prefix, not selected from eventual survivors. Original receipt latency was not saved: replay uses nominal boundaries and is labelled accordingly. It does not certify live fills or early tick alert performance.

## Validation and rollout, October 5, 2026 IST

- Worker parity with all 136 corrected research decisions across five sessions.
- 140 API replay-prefix checks, frozen-field duplicate check, eight live timing/quote/open tests, three stream metadata/backpressure/history tests, existing aggregation test.
- TypeScript, focused ESLint and Next production build passed. Authenticated local production-build API reads confirmed all five session counts, rewind, completed-candle cutoff and actual VM2 ORDS market-closed state. Anonymous API denied; anonymous page redirects to login.
- VM2 input benchmark: 9,827 contracts / 213 stocks, about 17 ms unpack, 34.1 MiB peak process RSS. Running idle cgroup about 22 MiB, available host memory about 524 MiB. This is an overnight measurement; full market-day load remains to be observed.
- Existing VM1 stream probe from VM2 passed; retained services active following controlled restarts.
- Production Vercel deployment verified in the authenticated browser: October 1 replay displayed 19 signals, sorted premium change descending, wall buildup and a completed-candle inspector. Live mode displayed October 5 market-closed state read from VM2. Unrecorded historical receipt ages remain blank.

### Backups / rollback

VM1 originals: `/home/ubuntu/chart-stream/backups/pallas-20261005-000918/{server.py,bar_aggregator.py,record_feed.py}`. Restore the first two to `/home/ubuntu/chart-stream/` and restart only `chart-stream.service`. Restore recorder to `/home/ubuntu/footprint/record_feed.py`; restart the recorder only if appropriate for the current market session.

VM2 original: `/home/ubuntu/ocelot/backups/pallas-20261005-001002/ocelot.py`. Stop/disable `pallas.service`, restore this source and restart only Ocelot. Leaving the unused `pallas_export.py` does not execute it. Preserve Pallas input/events/outbox for audit. Frontend rollback should revert the Pallas commit through Git and the normal Vercel deployment.

First live-session checks: opening baseline/cash coverage, per-symbol chain ages, sustained timestamped ticks, confirmation timing, service memory/CPU and retained scanner freshness. No overnight probe is presented as proof of a completed market-day validation.
