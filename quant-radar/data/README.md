Nifty chart fixture, generated from the separately validated local research store.

`nifty-chart.json` contains derived five-minute OHLC bars and 75 compact OI
snapshots for October 1, 2026, plus September 30 closing levels. It contains no
credentials or raw option responses. The original downloaded dataset remains
outside this repository in `nifty-research/data`.

At cut T, spot and option OI use exactly the completed minute T-1. Missing OI is
excluded, never forward-filled. Rank the two largest PE positions below spot
and CE positions above spot within a fixed 200-point window, using October 6
expiry. Changes compare the matching contract's September 30 15:29 OI.
All 75 cuts were checked after removing later index and option observations.
Generation: local `nifty-research/export-chart.mjs`.

This is historical replay coverage, not a current live option-chain feed.
The authenticated chart API explicitly dates this data; later dates do not
receive October 1 intraday observations. Previous levels remain labelled with
their originating date. Full CSVs and original source responses stay local.
