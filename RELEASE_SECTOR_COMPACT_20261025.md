# Sector Scope compact release — 2026-10-25

Approved local compact layout on /sector, inside the existing authenticated application shell. Reuses existing Rusty source/date/cut API and shared classification/session polling helpers. No VM changes, subscriptions or restarts. Archive contains aggregated means only, not raw stock datasets; strictly earlier sessions at matching snapshot time, equal daily weighting, archive coverage shown. OB unavailable in live feed is explicit. Manual chart review stays browser-local.

Network: one snapshot per read, maximum 12 scheduled reads/hour per visible eligible live tab. Historical selection does not poll; hidden tabs stop; focus events cannot multiply timers. Eight-entry client cache, abort on superseding request, same-session stale retention. Existing API private caching untouched. Initial HTML contains selected-date aggregate baseline (not multi-day raw data); full baseline stays server-side. Actual Vercel billing not measured. Existing proxy/auth guards remain. No production secrets changed.

Validation: Next production build passed; session-polling, Pallas-cache, sector-oi and new actual workspace-script regression passed. Tests cover classified direction, OR/PD semantics, missing OB, prior-only baseline, rendering, stale retention, history/hidden/focus guards and cache bound. Closed weekend cannot demonstrate current live market flow.

Backup: previous Git commit 56a586a3c2eaead9389b25b306a0034c62906b56. Rollback: revert this release commit and push main (only sector files and tests). No dependent service changes. Post-release evidence recorded locally after Vercel check.
