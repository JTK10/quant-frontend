# OI Line Breaks research page

The authenticated `/oi-line-breaks` page shows the validated five-minute
exact-strike ranking archive. `/api/oi-line-breaks` returns one date and one
completed cut, with both OI-setup and movement rankings and evidence for the
selected rows. Rank mode, PDH/PDL, search, and sort operate in the browser and
never refetch the archive. The historical view has no polling or VM worker.

The dated `.json.gz` files in `data/oi-line-breaks` are compact derived ranking
snapshots, packaged from the local research outputs with
`python scripts/package-oi-line-breaks.py --source PATH`. Raw cash candles,
chain captures, credentials, and VM state are not shipped. `manifest.json`
lists coverage; early sessions and 2 November use all nearby strikes, while
some October sessions use the saved chart lines only. The page labels those
limitations and does not present archive rows as live scanner alerts.

Run `python scripts/test-oi-line-break-archive.py` and
`node scripts/test-oi-line-break-feed.mjs` before deployment. The historical
API has private one-hour browser caching, loads at most one 2.5 MB expanded
archive per date in the server process, and keeps two archives in a bounded
process cache. A date/cut request returns at most 400 rows per mode plus their
evidence; the largest measured latest-cut API response across 28 sessions is
223 KB before transport compression, roughly 29 KB gzipped. No new broker
subscriptions, VM processes, or database readers
are introduced.
