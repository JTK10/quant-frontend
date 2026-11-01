# Aurum v1.1 live window

Live confirmation cuts run every five minutes from09:35 through11:30 IST,
inclusive. The final candle starts11:25. All other Aurum v1 price, volume,
VWAP, PDH/PDL, OR15, Nifty and option-chain gates are unchanged. The frozen v1
research lock and historical page data are preserved. The live extension has
implementation tests, not a new claim of predictive accuracy.

The stdlib worker reads27 existing completed cash/chain exports from
/home/ubuntu/pallas/input at09:20 through11:30. Exact-cut Rusty labels come
from the existing /home/ubuntu/lupus/input files; missing annotations staynull.
One Nifty-only connection reuses VM1's chart stream until11:35. No new broker
requests, option subscriptions, producer edits or live DuckDB readers.
Known-IP connection preserves TLS hostname verification.

Private prior-volume history contains24 eligible same-time volume slots plus
dailyOHLC summaries. Latest21 observations per slot and40 daily summaries bound
runtime memory while preserving20 earlier samples for replay of the finalseed
session. This private runtime seed is separate from the unchanged historical
signals shipped with the page. Following-session existing daily PDH/PDL/PDC
finalizes saved prior morning volumes. Missing prefixes failclosed. The shared
NSE calendar supplies holidays and previous trading dates.

State lives under state/aurum-v1.1, outbox/sent in version subdirectories. Signal
and documentIDs includeengine, preserving oldstate and publication isolation.
First qualifying signal perstock/day remainsimmutable. Live price is a signal
close reference, not an executablefill. Optional pullback flag freezes atsignal.

Source/date-only ORDS publication has atmost24 cumulative snapshots and separate
health. Health emits onceperquarter or statuschange, atmostonce/minute. Maximum
142morninghealthcalls plus24snapshots andfewtransitions fit300doc bound; ordinary
flow ismuchsmaller. Transport bound1MB; stableIDs and readback before uncertain
retry, onebackgroundtransport andboundedbackoff. Health cannotclear signalboard.

Frontend uses privatecached five-minute visible reads until11:40. Historical
datesloadonce. Cut IST filters the alreadyloadedday locally, showing signals
availablebycut. Recordedreceipt timestamps are honoredwhenpresent; original
researchuseslabellednominal candleclose. CE/PE/bias/pullback staysignal-time.
Historical records are not recomputed when changing the selector.

Resource limits remainMemoryHigh96MiB,MemoryMax128MiB,CPUQuota15%,Nice15 pending
new27cutstagedprobe. OnlyAurumrestarts. Namedbackupincludesprivatehistoryseed,
sourcefiles andunit. Rollback restoresonlythatAurumbackup andstartsonlyAurum;
preserveold/newstate/outbox. Revertfrontend throughnormalGit/Vercel. Do not
rollbackotherscanners,producers,authenticationorhistoricalsignaldata.
