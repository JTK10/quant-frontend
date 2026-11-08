# Sol historical RVOL filter correction — 2026-11-09

Root cause: older Rusty publications lacked c_rvol. Local offline replay merged
reconstructed cash RVOL, but production Sol used only published fields; all
RVOL presets consequently returned no rows on Nov6 and other older dates.

Fix: existing authenticated Rusty view reads a packaged compact per-date RVOL
archive on historical dates only, merging exact symbol/c_time after verifying
the candle finished by the selected cut. Native recorded RVOL takes precedence.
No producer/VM change, new API/browser request/poll, broker call, ORDS read,
training or live RVOL calculation. Prior publication data stays untouched.
Original Rusty gains the same additive historical RVOL values via shared feed.

26dates,4,353,044gzipbytes total; largest194,675compressed/622,238raw. Reader
limits512KiB/2MiB per archive, max2dates/4MiBcompleted cache plus in-flightdedupe,
1hTTL. Existing projected history cache remains max3dates/16MiB; measured
largest actual all-cut history11,642,895bytes (Oct30), safely cached rather than
refetching upstream per slider cut. No public CDN cache of authenticated data.
Browser still receives requested compact cut(s), never a whole RVOL archive.
Extra scalars/provenance enlarge historical response; no claim of zero bytes or
zero Vercel CPU. Existing per-date projection adds only saved-value lookups.

Archive provenance: final saved cash volume / same ISTslotmean over prior20
stock sessions, excludingcurrentday. Fullprecision retained. OHLC mismatches
kept and marked with asterisk/tooltip; no promise of original publication-time
volume. Unavailable slots remain blank. Six addedtickers had exactduplicate
OHLCV history:6,750duplicatekeys,zero conflictingvalues. Deduplicated locally
and recalculated2,158affectedpoints; sourcefiles unchanged. Manifest records
hashes, corrections/coverage.351,874savedpoints and89 independent histories
verified; Nov6 has15,551availablepoints.

Actual Nov6 10:00 universe projection:215rowswithRVOL; combinedtop5perleg gives
10bulls/9bears. BullCE:NTPC,IOC,BAJAJ-AUTO,VBL,ADANIENSOL.
BullPE:GLENMARK,M&M,TITAN,ICICIBANK,PRESTIGE. This is filter output, not a
trade-performance claim. No outcome/future cash path used for ranking.

Tests: all26archive schema/valuebounds, exactdate/symbol/slot/completedboundary,
nativeprecedence, no missingpoint substitution, concurrentonefile/cache reuse,
Nov6 filters; Sol/Rusty UI/slider/history/polling/Pallas-cache regressions,
TypeScript and Nextbuild. Git provides source rollback: revert this correction
commit. No VM rollback needed. Record release hash/status separately.
