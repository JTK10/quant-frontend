# Vercel CPU reduction — 13 October 2026

## Scope and rollback

Requested by the owner to reduce the remaining month's Fluid CPU usage. Started from current origin/main `502e4164f266f655a79fd7e1609880b120dd8b3e`. Existing untracked `work/` was preserved. No dependencies, broker subscriptions, strategy rules, VM production files or service units were changed. The previous commit remains the Git backup; rollback is `git revert <this release commit>` followed by pushing the revert, or restoring the preceding Vercel deployment.

## Changes

- Rusty no longer fetches the entire session through its server page on every refresh. Its authenticated browser consumer loads one latest board plus the complete cut index, then requests recent boards directly from the existing feed API. Earlier cuts load on selection and remain in browser memory. Initial responses are bounded to one snapshot; automatic responses contain at most the current and previous requested cut, even after a long hidden-tab gap.
- Normal Rusty refresh aligns to five-minute cuts plus 30 seconds for publication. One 60-second retry per missing cut is permitted to handle capture/publication delay. This explicit latency exception allows at most 24 scheduled reads/hour when every cut is late; normal cadence is 12/hour. Manual refresh and visible-tab return can add reads. History and weekends load once, apart from explicit user actions.
- Network polling stops while hidden and after a post-close catch-up window ending at 15:40, with at most one missing-final-cut retry. A local clock follows the next IST date without continuous overnight network polling. There is no general exchange holiday calendar; the existing October 2 closure remains explicit. The 12 October Rusty source actually contains 75 cuts from 09:15 through 15:25; the chain/Pallas capture has 78 cuts through 15:40. These are not fabricated into matching coverage.
- Shared AutoRefresh now enforces at least 60 seconds. A caller formerly requesting 30 seconds now refreshes 60/hour instead of 120/hour; 45 seconds becomes 60/hour instead of 80/hour. Existing history/weekend/visibility guards and off-hours policy remain.
- Panther caches completed serialized payloads for 10 seconds live and five minutes for prior dates, maximum 32 keys/16 MiB per process. Authentication precedes lookup. Explicit private browser headers match those lifetimes. Query keys isolate date/source/filter/cut and bounded in-flight OAuth reuse prevents token stampedes. Upstream reads have time/byte/row bounds; incomplete feeds fail instead of returning partial success.
- Pallas caches parsed documents for 15 seconds live and five minutes for prior dates, maximum 12 keys/16 MiB per process. As-of folding still runs per request, so replay boundaries, frozen engine labels and AI scores keep their existing semantics. Inspector symbols have isolated keys. Its existing private live/history browser headers remain unchanged.
- Errors are not cached; expired results are never reused as successful fresh responses. A failed same-date Rusty refresh retains its board with a visible error. Authenticated data is not placed in a public CDN cache.

## Representative local evidence

Replayed the 75 actual Rusty documents downloaded for 12 October (11,595,370 raw feed bytes). Old full response: 9,350,307 bytes. New initial and same-cut incremental response: 115,250 bytes with the complete 75-cut timeline index, a 98.77% response-byte reduction in this end-of-day fixture. A normal update with both old and new boards will be larger than the same-cut fixture, but is still restricted to two boards. Previously a 45-second consumer made 80 page refreshes/hour and its internal API calls; now 12 scheduled API reads/hour normally and no recurring server-page refreshes, an 85% cadence reduction.

One local replay measured old full API CPU 656 ms, new initial 312 ms, incremental 344 ms, and cached response below the process CPU timer's 1 ms resolution. These are local samples, not production billing measurements. Local benchmark peak RSS was approximately 290 MiB while holding old and new feeds/modules; completed caches are bounded to 32 MiB combined per instance. Cold starts and multiple Vercel instances reduce cache reuse. No public CDN cache is used.

At the old full-response peak the payload-only budget would be about 748 MB/hour uncompressed for 80 responses. The new two-board peak estimate is about 2.8 MB/hour uncompressed for 12 responses, plus the initial board, explicit history selections and visible-tab returns. Compressed HTTP bytes, Vercel origin transfer and function CPU are separate measurements; request or byte reduction does not prove a billing reduction. No guarantee is made about total monthly usage under unknown traffic.

## Verification

Required checks: `test-cpu-budget.mjs`, `test-session-polling.mjs`, `test-pallas-cache.mjs`, `test-pallas-refresh.mjs`, TypeScript, focused ESLint and current production build. New tests exercise actual Rusty component timers, lazy historical cut reads, corrected snapshots, cache expiry/size/count, expired-cache failures, unauthenticated rejection, date rollover, close boundary, hidden tabs, repeated focus, single in-flight request and stale/error retention. Pallas tests also check parsed-history reuse across different as-of cutoffs and symbol isolation.

VM read-only download baseline: VM2 MemAvailable 317 MiB, approximately 332 MiB swap occupied, second vmstat sample had no swap-in/out; Pallas/Ocelot/Kairos2 restart counts were zero. VM1 MemAvailable 494 MiB, second vmstat sample had no swap-in/out. Data transfers and local exports do not deploy code. Services must remain unchanged.

Deployment commit, checks/read-back and limitations are recorded after push in the local `work/cpu_release_20261013` record. Market is closed during the release; historical read-back cannot demonstrate future live publication latency. Observe Vercel Functions Active CPU for the same time window after the next session to measure actual billing impact.
