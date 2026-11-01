# Aurum v1 isolated live scanner

Implements the locked 74-signal research baseline without modifying it. This is
a scanner, not an AI model or order engine. The optional prior opposite-candle
pullback flag is an annotation/filter; it does not change the default gates.

`aurum_engine.py` is standard-library-only. It calculates completed five-minute
cash prefixes, shifted previous20 observed same-slot/cumulative RVOL, previous5
daily ADR, PDH/PDL/OR15, strict new closing extreme, VWAP, contemporaneous Nifty
direction, and the original same-cut dynamic chain wall/dominance gate.
NumPy/Pandas scaled bankers rounding is reproduced without their runtime.

The worker reads existing `/home/ubuntu/pallas/input/YYYYMMDD-HHMM.json` exports,
bounded4MB each, at14 morning cuts09:20–10:25. It does not open live DuckDB,
request broker data, modify shared sources, subscribe option chains, place an
order, or change another scanner. Rusty annotations come only from the exact
same-cut `/home/ubuntu/lupus/input` saved payload; all flow labels are retained.
Missing Rusty annotations are null/unavailable and do not invent zeros.

One Nifty-only WebSocket uses the existing VM1 chart-stream. It runs only during
09:14–10:30 on regular trading dates. Completed bars only; current-day09:15
opening reference and exact signal-candle close are mandatory. The known VM1 IP
is selected at connection time while preserving original TLS hostname/certificate
verification. No global DNS, certificate or producer configuration is changed.
Recovered snapshots retain actual receipt time and are visibly recovered.

An initial3MB cash-history seed is produced locally. It contains40 prior observed
dates per symbol with eleven eligible morning volume slots and true cumulative
volumes, plus daily OHLC/completeness. Subsequent days save their completed
morning cash. The following regular session's existing Ocelot daily exporter
provides explicit prior_day/PDH/PDL/PDC to finalize that saved trading date. This
avoids fetching the missing final cash candle. Missing morning bars/daily values
fail closed; holidays use the shared calendar's actual previous trading session.
The live provider daily PDC can differ from the research last-five-minute close;
the history record states its daily source. Initial frozen replay parity does not
assert that future provider data will exactly reproduce research prices.

One advisory process lock; immutable first signal per symbol/date; atomic own
state, snapshots, outbox and sent acknowledgements. All state stays under
`/home/ubuntu/aurum`. No retention/deletion policy is introduced. Live `entry`
remains null: `reference_price` is the completed signal close, not an asserted
fill. Historical saved next-open evaluation is a separately labelled page mode.

Publication uses the existing source/date-filtered ORDS path with source=aurum,
small morning snapshots and separate health documents. Stable IDs/read-back
prevent uncertain retries from blindly duplicating documents. One background
publication call at a time, bounded transport/retries. Health does not clear a
successful board. During09:14–10:30 the caller emits health once per quarter-hour
or status change, checked no more than once per minute. IDs include the actual
IST minute and validated status, so PENDING→ERROR→READY within one quarter is
visible and duplicate same-minute/state calls or restarts remain idempotent.
The morning maximum is77 health calls plus a few window transitions, below the
300-document source/date read bound; normal sessions need about6–8 health docs.
Closed-window health is emitted once per date/status/window transition, not
continuously all night. Browser polling/cache policy belongs to
the frontend's shared session helper and private authenticated caches.

Local validation: exact74/74 selected signals;56,169 raw cash prefix comparisons
with zero numeric feature differences; all3,632 raw option rows across74 signal
instants reproduce wall/dominance fields. Twelve worker lifecycle tests plus eight
I/O tests cover missing data, timestamp boundaries, duplicates/restart, null
annotations, uncertainty, and next-session/holiday history enrichment. Files
`validation/engine_parity.json` and `validation/chain_parity.json` are release
evidence outside this source directory. `benchmark.py` performs a bounded,
no-publication14-cut replay in a temporary isolated directory. The staged VM
probe evaluated all218 symbols over14 cuts in3.737 seconds, with74,308KiB peak
RSS. The unit uses MemoryHigh96MB/MemoryMax128MB and CPUQuota15%, leaving
headroom for the existing Nifty stream and bounded publication transport.

Rollback: stop/disable only aurum.service and preserve its own state/outbox.
Revert only the Aurum frontend release if needed. Shared Ocelot, Pallas, Kairos,
Rusty, VM1 chart stream, credentials and retired services need no restart/change.
