# Kairos 10 powered by Aurum

User-authorized paper deployment of the original Kairos Aurum `option_structure`
model, threshold0.30. Sector-v2 is excluded. Exact16 inputs and40 learned trees
run with Python standard-library inference; no training/scientific dependency
is installed on VM2. ModelSHA25631e54fd760e9a94105bed2c7ec64f3e40a09d7951a726536c01e48220f7862b8.
Score is a ranking, not a calibrated probability. The existing small-sample
research results do not establish future accuracy or guaranteed returns.

`/home/ubuntu/kairos10`, `kairos10.service`, ORDSsource`kairos10` and capKAIROS10
are isolated from existing Kairos services and historical records. Existing
`/kairos` page defaults to10; previous engines remain selectable.

Read-only sources: Pallas completed cash/chain exports, Aurum bounded history
and existing Nifty cache, current Ocelot underlying metadata, shared NSEcalendar.
No new recorders, subscriptions, broker chain reads or live DuckDB readers.
Every qualified completed prefix is evaluated, not Aurum's immutable first
stock/day board. Required prior opposite candle/reclaim matches research.
Old captures hydrate context but cannot arm an entry. Recovered latest Nifty
candles fail closed; a recovered earlier09:15 baseline open may provide context.

Confirm09:40-10:55. Freeze contract strike nearest known close and capture's
unexpired expiry; broker metadata must independently match exact underlying,
strike,leg,expiry and current-date universe. Due is the next exact5mcut09:45-11:00,
with atmost90seconds for the existing capture and fresh executable book.
Entry spot must retain the frozen PDH/OR or PDL/OR breakout. New invalid/missing
data cancels or delays within that bounded cut; no retrospective fills/strike
substitution. First executable candidate wins, scores rank only equal cuts.
Restart preserves actual paper positions/lock/outbox but cancels unfilled intents.

Frozen native Kairos sizing and exit code is copied unchanged (apart from
process-local identity overrides in subclass). Whole lots Rs30,000, single-lot
buffer up toRs35,000, observed five-level buy/sell depth, spread<=6%, quote<=30s,
receipt<=10s, current-session last trade. GET-only broker calls max2/sec with
60s429cooldown; one open option monitored every5sec. No real broker order API.

Initial premium stop-10%. Trail8→-4,12→+2,25→+15,45→+30,70→+50. Nonrunner exits
11:30 or stagnancy45min/gain<2%. Runners (peak>=20 or lockedstop>=10) close at
verified sessionclose minus60sec, normally15:29. Missing/stale/depth-insufficient
exit leaves position pending. Gross paper PnL before charges. Research15:25
closing sensitivity is not silently substituted for live native15:29.

Atomic fsync state/outbox plus advisory service lock. ORDS source/date readback
before publication; uncertain attempted posts are retained for readback and
never blindly posted again. Stable IDs persist across restart. Bounded1,000doc
backlog; no raw data/model shipped in frontend updates. Private source/day API
cache15s live/SWR30s,3600s history/SWR86400; visible60s page refresh, shared
session/weekend/history controls. Health distinct from trade state; temporary
failure preserves same-date ledger with warning, date/source change clears it.

Resource limits: CPUQuota15%,Nice15,MemoryHigh96MiB/Max128MiB. Representative
VM probe all21inputcuts/218stocks/16scoringcuts is nonpublishing and uses saved
files only. Health is atmost60s during monitored hours,15min outside. One page
requests atmost60/hour in session,12/hour on weekdays outside,history/weekendonce.
Browser payload compacts superseded marks/health; backend read bound2MiB/1500rows.

Run `python -m unittest test_kairos10` (fixture included for parity only), and
benchmark.py against bounded saved files before installing. Original native
tests can run against their untouched source as regression. Production start
is `kairos10_live.py` using existing Ocelotvenv with httpx. All configuration/
credentials remain on VM; service sandbox writes only its own root.

Rollback new unit: `sudo systemctl disable --now kairos10.service`; preserve
root/state/outbox for audit. Existing services continue. Restore its source/unit
from named VM backup if replacing later. Revert the specific frontend commit
through normal Git/Vercel workflow. Never delete or reset other bot state.
