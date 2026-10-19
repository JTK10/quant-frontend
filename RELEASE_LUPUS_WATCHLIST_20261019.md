# Lupus Charts-watchlist action — 2026-10-19

Added + next to row TradingView links and the detail TradingView action in embedded live/replay Lupus. Uses shared addChartWatchlistSymbol helper through origin/source-validated iframe messages, with symbol validation, storage/custom-event synchronization and disabled checkmarks for existing entries. Row button clicks do not open the detail drawer. Browser-local only: no extra network requests, cache/polling changes, dependencies or VM mutations.

Build, JavaScript syntax, session polling regression and watchlist message/action tests passed. Production UI not checked after push per user preference. Rollback: revert this commit; existing files preserved in Git parent. Shared Charts watchlist remains browser-local like Rusty.
