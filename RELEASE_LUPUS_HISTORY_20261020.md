# Lupus dated production history

Problem: historical mode only offered11 bundled research sessions throughOctober16. October19 already existed on VM2 and in ORDS (72snapshots09:20–15:15;282bull rows,2776bear rows). No scanner recomputation or VM deployment needed.

Changes: historical selection reads source=lupus for the selected sig_date through the existing authenticated Panther route. A source-isolated compact view keeps the original ranks and all recorded cuts; newest publication wins only within that cut. Session selector extends to recent dates automatically, skips known2026holidays/weekends, and defaults to the latest earlier session. Original11 research files are explicitly labelled fallback only when no production history exists for that same date. A missing date never substitutes another day. Date switches clear old rows immediately.

Cache/budget: existing private browser max-age300 and bounded process-cacheTTL300seconds retained. One request per selected date, no historical poll, no focus refresh once loaded. Concurrent identical loads share a promise; hidden tabs defer/abort work. Memory holds at most8dates. October19 projected JSON949861bytes, gzip estimate100567bytes, once per load. Gzip estimate is local compression, not measured Vercel billing. No public CDN cache, new subscriptions, VM tasks or raw-chain reads.

Validation: production Nextbuild passed; test-lupus-history.mjs passed for source/date isolation, cutdedup,compactprojection,shared requests,caching,hidden-tab suppression and currentdate menu. Existing session-polling and Pallas-cache regressions passed. Inspected actual October19 source payload read-only; data matches72cuts and last15:15. Do not imply coverage through15:25 where no recorded snapshots exist.

Backup/rollback: prechange commit30f37c5; revert this isolated release commit through main and Vercel. Production VM files and service PIDs untouched by this release. Frontend live Lupus cadence unchanged.

Post-push: record exact commit/deployment verification in local audit report. Authenticated browser readback may require the user's existing session; do not guess passwords.
