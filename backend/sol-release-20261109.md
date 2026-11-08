# Sol release — 2026-11-09

User authorization: replace Korat with the local Rusty Bulls/Bears page named
Sol, live on existing Rusty feed; follow existing resource/cache rules.
Baseline origin/main bf0643303915795d9c83eaf2cbded2970eb44963.

Frontend: new authenticated /sol, local two-board design with independent
Bulls/Bears CE/PE/RVOL shortlists, default5 count sliders, combined deduplicated
lists, selected-cut slider, level/OI filters, sector toggle and shared Charts
watchlist. The last requested rollback is retained: bull PE>0 has no CE gate.
No AI or profit guarantees; ranks use only selected snapshot fields. Unsupported
local-only own-line overlays are omitted; no offline datasets are packaged.
Original RustyClient and its CSS remain unchanged. RustyFeed gains only an
optional board renderer/page path; existing default behavior stays Rusty.

One existing authenticated /api/panther-signals source=rusty view=rusty feed;
no new API, worker, broker calls, DB readers, scientific runtime or stream.
Same visible5m poll, at most one60s delayed-cut retry per cut, hidden pause,
200ms slider debounce/abort/in-flight guard, historical once/selected-cut reads,
private browser cache, bounded source/date upstream cache and projection.
Preset/filter/ranking/sort controls run locally and make no network calls.
Each open tab still consumes its own existing feed; no claim of zero billing.

Measured real Nov8 15:10 source:74bull/143bear;217RVOL values. SUNPHARMA0.55x,
SIEMENS2.25x at15:05 using20earlier sessions. Compact snapshot131,592bytes.
Normal12scheduled reads/hour, one or two snapshots per cursor response: about
1.58-3.16MB/hour raw before compression plus initial bundle/selected history;
unchanged cuts and actual bytes vary. No new fields added in this release.
Browser two-board ranking local probe3.27ms, combined10bull/9bear after dedupe.
Earlier historical publications lacking saved RVOL show unavailable/empty
shortlists; All boards still show the rows. No rewrite of historical records.
Latest special-session15:25capture had no completed cash bars, so its RVOL is
unavailable;15:10readback above verifies actual populated data without inventing
live observations during this01:xxclosed-market release.

VM2: only oi-line-breaks.service retired (inactive/dead PID0, disabled, exit0).
Backup /home/ubuntu/oi-line-breaks/backups/retired-sol-20261109-011147/.
State/outbox/source untouched. Rollback sudo systemctl enable --now
 oi-line-breaks.service. All retained worker PIDs unchanged. No Korat-dependent
Kairos bot found:ClassicLynx,2/3Pallas,9Irbis,10Aurum are preserved.
Korat URL redirects toSol; authenticated retired API410 makes no upstream reads;
old archive tracing removed to avoid packaging retired datasets into functions.

VM2 before MemAvailable224MiB, swap601MiB, sampledsi/so0, disk33GiBfree;
Korat RSS~3MiB. After available429MiB, swap665MiB, sampledsi16/so0KiB/s,
CPU99%idle. A concurrent apt-check caused temporary swap pressure during an
intermediate sample; no new worker was added and no OOM entries/failed units.
Do not attribute all memory variation to retiring a3MiBworker. VM1 only read.
Nov8 one-date Ocelot override restoration success verified, runtime drop-in gone.

Verification: actual React Sol and original Rusty slider lifecycle tests;
shortlist signs/counts/dedupe/missing RVOL/PE eligibility; Rusty history/panels;
shared session polling and Pallas caching; retired API410/auth401/no dependencies;
TypeScript and optimized Next production build all passed. Independent review
found no remaining blocker. Release commit/Vercel/readback appended locally.
Frontend rollback: revert only this release commit through normal Git/Vercel.
Authentication retained; no credentials/data/backups in this commit.
