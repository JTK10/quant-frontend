# Sector OI towers — 2026-10-31

Restore approved green/red towers above the compact sector/flow/stock workspace. Current production base 8728710 retained (including OI-breach column removal and shared Charts watchlist).

Towers reproduce previous SectorOiBoard breadth: 100*(bull-bear)/(bull+bear+neutral). Shared Rusty classifications establish direction; missing/unknown/conflicting OI excluded; no-data is unavailable, not neutral. Positive green, negative red. Click/keyboard selects sector below. Both views use same selected snapshot. Average OI bias cards remain a different measure.

Browser-only aggregation/SVG; no added API calls, ORDS queries, server calculations, dependency, VM service or restart. Existing 300000ms polling, visibility/history controls, private caches and source/date/cut retrieval unchanged. No new raw archive published. Request budget unchanged: maximum 12 scheduled reads/hour in visible eligible latest mode. No measured Vercel billing claim.

Validation: workspace tests exercise actual script, +100% bull example, -25% mixed/neutral denominator, missing exclusion and selected date/time. Existing sector classification/stale-state tests pass. Production build checked before push. Git parent 8728710 is backup; rollback by reverting this release commit and pushing main. Saturday deployment cannot demonstrate new live market flow; authenticated visual read-back not performed in this environment.
