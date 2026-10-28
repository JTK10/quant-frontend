# Sector OI column removal — 29 October 2026

Removes the OI line/time column and OI-break-only filter from Sector Scope, including those two fields in its CSV export. Existing OB and PDH/PDL columns remain. Rusty and its backend calculations are unchanged.

Scope: workspaceTemplate.ts, workspace/route.ts, and the matching workspace test field list. No dependencies, API changes, VM work or service restarts.

Resource budget: existing five-minute visible live polling (at most 12 scheduled requests/hour), historical on-selection reads, private cache, bounded caches and cancellation remain unchanged. No new requests or data subscriptions. HTML is smaller; Vercel billed CPU/origin-byte savings have not been measured. No production load test.

Backup: Git parent 7cdb7d488adf5b3648835c6d2276d9a6c13a986f. Rollback: revert the commit containing this release note and push the revert through the existing frontend deployment pipeline.

Validation: scripts/test-sector-workspace.mjs passes, including actual-script rendering, stale retention, bounded caching and visibility/history/focus guards. Production build required before push. Authenticated production UI verification depends on an available signed-in browser session; do not equate push success with verified UI deployment.
