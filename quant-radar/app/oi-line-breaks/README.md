# Korat live OI line scanner

Authenticated `/korat` is the live exact-strike scanner. The isolated VM2
`oi-line-breaks.service` reads existing Pallas completed five-minute option/cash
captures, Rusty prior OI sessions, and Aurum cash history. It makes no broker
subscriptions or direct live database reads. Each completed cut is ranked by
prior defended OI setup and separately by directional cash movement after its
first break. A line remains ranked for the rest of the session. PDH/PDL flags
come from completed cash candle extremes; `?` denotes unavailable late wicks.

The worker durably saves local state and a two-document outbox per cut. It
publishes a source-isolated snapshot followed by a small daily index through
the existing ORDS client. The authenticated API reads the index and one
snapshot with bounded byte, row, and source/date validation. The live browser
polls at most every five minutes in the IST session, suspends while hidden,
and shows stale, degraded, or recovered status. Like Rusty, it sends its last
cut as a cursor; an unchanged cut returns only the small index result and
keeps the board in the browser. Filters and sorting never fetch. Server
responses use private 30-second caching. At the observed ~83 KB JSON snapshot,
the budget is 12 API requests and at most about 1 MB per open tab per hour
before transport compression; unchanged cuts are much smaller.

Saved historical dates use the frozen archives in `data/oi-line-breaks` and
load once. They were packaged with `python scripts/package-oi-line-breaks.py`.
Archive coverage is displayed per date; some October dates contain only the
four prior chart lines. The live scanner uses all nearby front-expiry strikes
from the previous three completed sessions. The prior-day cash baseline for
recent days comes from the next session's first existing Pallas capture.

Run `python -m unittest discover -s backend/oi_line_breaks -p 'test_*.py' -v`,
`python scripts/test-oi-line-break-archive.py`, and
`node scripts/test-oi-line-break-feed.mjs`, and `node scripts/test-korat-live.mjs`
from their respective repository
or `quant-radar` directories. The service unit is in
`backend/oi_line_breaks/oi-line-breaks.service`. Its state and rollback are
isolated under `/home/ubuntu/oi-line-breaks`.
