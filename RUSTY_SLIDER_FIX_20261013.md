# Rusty historical slider correction — 13 October 2026

## Scope and cause

The compact Rusty feed introduced in `17449e8` loads one board initially and keeps a complete time index. Earlier cuts are fetched when selected. Every range-input change immediately started or queued a request. A drag could therefore wait for an intermediate snapshot before requesting the final time. Unloaded snapshots appeared as empty filtered boards, and Refresh fetched the latest cut instead of retrying the historical selection. Pending requests were not cleared when switching back to a loaded time.

## Correction

- Debounce selections for 200 ms; request the final resting time. Keep one request in flight and at most one pending selection.
- Reuse already loaded cuts immediately. Clear obsolete pending selections, including Jump to latest.
- Keep private browser caching enabled for normal history selection; only the explicit Refresh button bypasses it.
- Refresh retries the selected historical cut. Validate that an exact-cut response actually contains that cut.
- Show the requested time and an explicit waiting/error state rather than an empty filtered board. Never show another time's stocks under the requested time.
- Resume an unfinished selected cut after tab visibility returns, including historical views; otherwise history remains idle. A failed historical request requires explicit selection/Refresh, and never retries just because the tab regained focus. Clear both timers and abort on cleanup.

Only Rusty frontend behavior changes. API response schemas, live five-minute cadence, bounded caches, Pallas, trade rules and VM services remain unchanged.

## Verification

`node scripts/test-rusty-slider.mjs` renders the actual RustyFeed and RustyClient with real React state updates. It verifies both boards, drag coalescing, slow responses, visited-cut reuse, obsolete queue cancellation, selected-cut failure/retry, hidden-tab/focus storms, wrong-cut rejection and idle historical views. The old `17449e8` feed fails this regression (an intermediate drag request starts immediately); the corrected feed passes.

Passed: CPU-budget tests, session-polling tests, Pallas cache/refresh regressions, TypeScript and focused ESLint. The final production build, including the focus-retry guard, passed.

Authenticated local production HTTP smoke checks used a temporary local test identity and the real Oracle feed: 75 available cuts; selected 09:15 returned 16,737 bytes and selected 10:00 returned 125,887 bytes, with different bull/bear contents. The latest board returned 115,250 bytes. Anonymous access returned 401/no-store. Pallas still returned 97 historical records with unchanged private cache headers. The temporary local server was stopped. No production credentials or VM services were changed.

Test dependency: pinned `react-test-renderer@19.2.3`, development only, matching React 19.2.3. It adds two locked development packages and is not imported by the application. React reports its existing deprecation warning; it is used here for an isolated component-state regression, not production rendering.

## Budget

No recurring history requests. An uninterrupted drag with intervals under 200 ms makes one final-cut request rather than one per intermediate stop. Slower deliberate selections can each request one cut, with a single flight and latest pending selection. Loaded cuts make no network request. Responses remain one compact selected snapshot plus the time index. No whole-day snapshot download is restored. Live cadence remains 12 scheduled reads/hour, with the previously documented bounded delayed-publication retry.

Component tests use synthetic in-memory snapshots; they are not production load tests. This patch adds no server cache or production worker and no VM resource impact. Authenticated production UI verification still requires an available signed-in browser/deployment session; test results alone do not establish that Vercel has deployed this commit.

## Rollback

Baseline and backup commit: `17449e84014ce4a933604ad29373d9958b7b3ede`. Revert this correction commit and push to restore the prior frontend. Do not restart VM services. Preserve untracked local research files.
