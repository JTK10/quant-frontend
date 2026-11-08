# Sol

Production `/sol` uses the approved local Rusty Bulls/Bears design. It has one
Bull and one Bear board, independent shortlist buttons and count sliders,
existing level/OI filters, snapshot slider, sorting, sector toggle, all-fields
inspection, shared Charts watchlist and TradingView links. `/korat` redirects
here; original `/rusty` remains unchanged.

Bull presets: CE<0 plus RVOL, PE>0 plus RVOL, or their deduplicated union.
Bear presets: CE>0 plus RVOL, PE<0 plus RVOL, or their deduplicated union.
The count defaults to5 per list; Combine can show up to10 unique stocks at
that default. Equal-weight competition ranks combine directional OI strength
and higher RVOL. Ties use higher RVOL, stronger OI, then symbol. Missing or
nonpositive RVOL cannot enter a ranked shortlist. The PE preset has no CE
restriction, preserving the user's explicit rollback. Source data and all
filters are from the selected snapshot only; this is ranking, not an AI model.

Transport is the same RustyFeed, with an optional board renderer and `/sol`
path for login/date rollover. It calls the same source-isolated
/api/panther-signals?date=...&sources=rusty&view=rusty endpoint. No new API,
VM worker, broker request, WebSocket or Vercel RVOL calculation. Existing
private cache/projection, cursor refresh,5m cadence, bounded delayed-cut retry,
200ms slider debounce, cancellation, hidden/history/weekend guards remain.
Sorting, presets, counts and sector toggles make zero network requests.

Production RVOL is the current completed cash candle's volume divided by the
mean of the same five-minute slot in previous20 available stock sessions.
The adjacent Nd is actual sample coverage. Historical dates covered by the
packaged local RVOL archive now merge saved same-slot values by exact stock and
completed candle time when the publication lacks RVOL. Recorded RVOL wins.
Asterisk/tooltip preserve published-versus-final-cash OHLC differences; this is
historical reconstruction, not a claim that the final cash volume was recorded
at the original publication. Uncovered points remain unavailable. Only compact
RVOL values are packaged; no full offline replay or old-document rewrite. Local-only own-line overlays
(onlyOct29/30) are omitted rather than exposed as unavailable live controls.

CSS is scoped to .sol-view; no original RustyClient or Rusty CSS changes.
Verify with node scripts/test-sol.mjs and existing Rusty slider/history/panels,
session-polling, Pallas-cache regressions plus TypeScript/Next build.
