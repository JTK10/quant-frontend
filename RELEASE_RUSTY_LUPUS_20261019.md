# Rusty layout and Lupus polling — 2026-10-19

Frontend-only change. No VM services, producers, broker requests, scanner formulas or shared API policies changed.

Rusty: give the ten-column flow tables an 850px minimum width, a 170px stock column, clipped cell overflow and nonshrinking action buttons. Existing panel scrolling contains the width; all five/pair/three layouts remain available.

Lupus: five-minute live polling (12 scheduled requests/hour/tab instead of 60), existing IST/weekend/off-hours/hidden-tab guards, one in-flight request, focus cooldown and session rollover. Replay has no recurring API polling. Live mode does not load historical session JSON or the optional AI dataset. Existing private API response caching, bounded shared caches, OAuth in-flight sharing, upstream date/source filters and latest-cycle browser output remain intact. Shared API currently reads that source's session upstream before reducing latest-cycle output; this change does not assert upstream latest-only retrieval.

This reduces recurring request frequency by 80%. Browser bytes/hour = measured response bytes x 12, plus initial assets. Actual Vercel Fast Origin Transfer/compute/billing were not measured; no zero-cost or zero-strain claim. Existing generic upstream limits remain unchanged (40s fetch timeout, 64MiB maximum, 10,000 items). No production load testing.

Validation: test-session-polling.mjs, test-pallas-cache.mjs, test-rusty-flow-panels.mjs passed. Build result recorded in chat. No authenticated visual production verification yet.

Rollback: revert this release commit, retaining unrelated later changes. Previous files preserved in Git parent. No VM backup/restart needed.

Rusty sorting: clickable CE %, PE % and OI break time (also OI bias/Move) headers sort each flow independently. Toggle direction; unavailable values remain last. Side-wide sort controls reset overrides on that side. Pure local sorting, no additional API calls. Regression verifies negative numbers, both directions, time ordering and missing values.
