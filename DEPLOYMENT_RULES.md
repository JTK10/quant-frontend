# Mandatory production deployment rules

Effective 2026-10-11. Applies to every human and agent deploying to VM1, VM2 or the Quant Radar Vercel frontend. Read before planning or modifying production. This is an operating policy, not a technical access-control mechanism. User instructions govern scope; record any explicitly authorized exception and its measured impact.

## 1. Inspect and isolate

- Discover actual service units, ExecStart paths, timers, dependencies and page/source mappings. Old recovery-kit service lists are historical. Jaguar, Neofelis, Margay and Strike were intentionally retired: never resurrect them incidentally.
- Start from current origin/main, inspect existing uncommitted work and stage only intended files. Never deploy an old checkout over newer fixes. No credentials, raw datasets, backups, logs or private environment files in Git.
- Before changing existing files or units, make a timestamped backup on the same VM, record hashes and a specific rollback command. Preserve durable trade/event state. A service restart causes a processing interruption; do not describe it as zero downtime without evidence.
- Prefer a maintenance window. Restart only the named affected unit when required. No broad Node/Python kills, blanket reloads/restarts, or unrelated repairs.

## 2. Preserve Vercel bandwidth and origin usage fixes

- Reuse quant-radar/utils/sessionPolling.ts. Use Asia/Kolkata dates and session boundaries, never host/browser local time. Historical views load once per date/filter selection and do not repeatedly poll or reload on focus. Weekend views load once; do not repeatedly request APIs. The current helper allows slow five-minute weekday checks outside 09:14–15:35; it does NOT implement an exchange holiday calendar. Never claim holiday awareness without one.
- Stop network polling and automatic router.refresh while document.hidden. Resume at most one request on visibility return. One timer and one request in flight per consumer; clear timers, abort requests and remove listeners on unmount/date/mode changes. Prevent rapid focus events from multiplying timers or requests.
- Live scanner lists default to at least 60-second polling; five-minute OI data uses at least five-minute polling. A faster cadence needs a documented latency requirement and request/byte budget. Tick charts reuse existing streams; do not poll full snapshots to simulate ticks. Local UI clocks are not network requests.
- Reuse AutoRefresh, useOIData and existing source feeds. Deduplicate identical concurrent reads; bound completed caches by key/count/TTL. Do not combine page-wide router refresh, component polling and duplicate WebSockets for the same feed.
- Honor private browser caching where correctness allows: Pallas live max-age=15/stale-while-revalidate=30; historical/research max-age=3600/stale-while-revalidate=86400. Pallas fetch must use cache:default and proxy must not overwrite that route's headers. Errors and sensitive mutable session/auth operations remain no-store. Authenticated data must NEVER use public shared CDN caching. Other routes need an explicit cache policy; blanket no-store is not a performance strategy.
- Push date/source/symbol filters upstream; fetch compact bounded result sets, not full multi-day chain/history on every refresh. Bound bytes, pages, rows, timeouts and retries. Share OAuth requests and cache tokens to expiry with safety margin. No secrets in browser responses.
- Keep health separate from signal snapshots. A heartbeat must not erase a successful same-session board. Preserve last same-date data on temporary failure with a visible stale/error state; clear it at date/source change. Never present stale data as fresh success.
- Budget per open tab: requests/hour = 3600 / polling interval seconds; transferred bytes/hour = measured response bytes x requests/hour, plus initial bundles/streams. At 10s this is 360 requests/hour; at 60s it is 60. Report browser/API bytes and Vercel origin/function/CDN metrics separately: request reduction alone does not prove a billing reduction. Do not repeatedly ship full research datasets on live refresh.

## 3. Protect the roughly 1 GB VMs

- Snapshot available RAM, swap activity, CPU, disk, existing service RSS/restarts and recent bounded OOM logs before and after. Free memory alone is not headroom; use MemAvailable and observe swap pressure.
- Run large downloads, backtests, training, full-chain exports and archive conversion locally. On VMs use small health/state files, bounded log tails, filtered API reads and cached snapshots. No unbounded filesystem scans, raw-chain dumps or direct live DuckDB readers.
- Reuse VM1 tick/chart producers and VM2 option/cash captures. No duplicate broker subscriptions, full-chain sockets, recorders or polling loops without explicit measured need. Preserve existing producer payload fields/formulas and consumer compatibility when adding fields.
- New workers use isolated paths/state, locks, atomic writes and idempotent publication. Put CPUQuota, Nice, MemoryHigh and MemoryMax in systemd with measured realistic headroom; do not blindly copy another unit's cap or install a scientific runtime on a small VM when stdlib inference suffices. Run a bounded representative workload test, not only idle RSS. If headroom or OOM behavior is unsafe, do not release.
- Use bounded retries/backoff/timeouts and source/date-isolated stable IDs. Never retry an order/publication blindly after uncertain success. Preserve recovery state across restart.
- No automatic retention/delete/compaction policy changes. Preserve parquet, zip and previous-session context unless separately authorized. Never delete shared input data to make a rollout fit.

## 4. Required release evidence

Before push/restart: record changed files, dependency impact, backup and rollback, request/cadence/cache budget, representative peak resources, relevant regression tests and build. Run session-polling and Pallas-cache regressions when touching frontend refresh/cache/proxy; add equivalent coverage for a new page. Test hidden tab, focus storms, weekend, historical date, date rollover, close transition, one in-flight request and stale/error handling. Test producer schema compatibility, duplicate/restart handling and causal time boundaries for new workers.

After release: verify exact deployed commit/hashes, active PID/restart counts, fresh producer timestamps and consuming output/source/date, authenticated page/API read-back, unauthorized access rejection and resource impact. Active process/socket alone is not proof of data flow. Use bounded checks; no load test against production. If closed-market deployment cannot demonstrate live flow or authentication is unavailable, state the limitation and do not invent success. Save a release record with these facts and rollback location.

## Verified correction history

- dd152b0: Pallas polling 5s to 60s; Nifty signals 10s to 60s; private Pallas live/history response caching; tab visibility checks.
- 128375c: shared AutoRefresh and chart OI visibility/market-session guards.
- e0724a2: common IST/weekend/historical polling policy, close-transition scheduling, duplicate focus/timer protection, bounded OI cache/in-flight sharing, Pallas cache honored by client AND proxy; regression scripts test-session-polling.mjs and test-pallas-cache.mjs.
- Irbis initial fb2441e was found to retain an unguarded 10s loop. Follow-up aligns it to the shared 60s/session/visibility policy. This history verifies code corrections, not retrospective Vercel billing figures.

Canonical VM copy: /home/ubuntu/DEPLOYMENT_RULES.md, required by /home/ubuntu/AGENTS.md. Keep local project/repository mirrors synchronized when policy changes. Documentation alone cannot prevent a deployer with shell access from ignoring the policy.
