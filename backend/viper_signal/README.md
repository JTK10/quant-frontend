# Viper Signal live Phoenix scanner

`viper-signal.service` is a separate stdlib-only worker. It reads the existing
Ocelot/Pallas atomic captures in `/home/ubuntu/pallas/input`. It does not open a
broker stream, read live DuckDB, or execute orders. Existing Viper and other
scanners are unchanged.

The engine applies the reviewed bull fast-track/standard-ignition routes and
bear ordered/held/direct breakdown routes to completed five-minute cash bars.
PDH/PDL requires verified full-session cash extrema; VWAP requires a complete
current-session prefix and RVOL requires matching prior-session volume slots.
Missing bars or opposite-leg observations are not
positive confirmation. All qualifying contracts are retained; first-per-stock
is an optional presentation filter.

Prior baselines use `/home/ubuntu/market-calendar/nse_calendar.py` and the previous
regular session's 15:25 option capture and `cash-seeds/YYYY-MM-DD.json`.
The initial Nov12 seed contains 218 full 75-bar cash sessions. Subsequent seeds
reuse existing completed captures plus `/home/ubuntu/lupus/close-DATE.json`
(the existing 15:40 full-day OHLC export). This resolves late-session missing
cash captures without changing Ocelot or adding broker requests. Full-day levels
and available volume prefixes remain separate; missing later volume is never
fabricated. RVOL beyond that verified prefix remains unavailable. No alert is
published from degraded chain data. Closing seed writes are atomic, retried and
recoverable from the previous durable checkpoint after restart. Missing required
cash history makes the scanner wait. Calendar changes belong to the shared calendar.

SQLite `state.sqlite` commits the incremental checkpoint and outbox together.
Stable publication IDs use `viper-signal|phoenix-live-v1|YYYYMMDD|HHMM` with source
`viper-signal`; uncertain POSTs are reconciled before retry. `worker.lock` prevents
duplicate publishers. Recovered cuts are marked explicitly. Health is separate
from signal snapshots. No retention/deletion policy is installed.

Resource limits: CPUQuota=15%, Nice=15, MemoryHigh=80M, MemoryMax=112M. Input
captures are bounded at 4MB, signal documents at 20KiB and date/source read-back
at 76 documents/3MiB. OAuth reuses the existing private Ocelot configuration with
expiry caching. Browser updates are five-minute, tab-visibility guarded, with
one request in flight; historical archive selection does not poll. The API uses
private live max-age=60 and historical max-age=3600 caching, bounded server cache,
upstream date/source filters and known-cut deltas. No public shared data cache.

Local checks: `python -m unittest discover -s backend/viper_signal -p test_signal.py`
and the frontend `scripts/test-viper-signal.mjs`, session-polling, Pallas-cache
regressions and production build. Full-session local replay reproduces the
Nov6 and Nov11 archived signal keys, including checkpoint restore every cut.

Deployment: copy only this code/unit to `/home/ubuntu/viper-signal`, provision
the verified prior cash seed, run bounded resource/schema/publication preflight,
then install/enable only `viper-signal.service`. Follow the project and VM
DEPLOYMENT_RULES.md. There are no scientific runtime dependencies.

Rollback new worker: `sudo systemctl disable --now viper-signal.service`.
Preserve the isolated SQLite, cash seeds and input captures. Frontend rollback
must revert only the live-feed commit, retaining unrelated newer work. Before
the market opens, replay/publication checks do not prove future live data flow.
