# Rusty candle RVOL — 2026-11-08

Adds sortable completed-candle RVOL to every existing production Rusty flow view.
The local two-board design and shortlist presets are outside this release.

Producer: VM2 /home/ubuntu/ocelot/ocelot.py, existing ocelot.service. A fail-open
optional stdlib adapter reads a 5,460,005-byte local volume seed and records new
completed candle volumes atomically in its own rusty_rvol_data/YYYY-MM-DD.json.
No broker requests, subscriptions, DB readers, new workers, installs, timers,
or changes to shared cash/chain/trade files. Existing workers are untouched.

Definition: current completed candle volume / mean volume in the identical IST
five-minute slot over the previous 20 available stock sessions. Today/future
excluded; zero/missing denominator stays unavailable. Partial samples explicitly
shown as Nd. Seed through Nov6 from the locally normalized saved cash master;
subsequent running sessions accumulate automatically. Historical published
snapshots without the field show a dash; no historical document rewriting.

Representative VM2 staged nonpublishing probe: actual Nov6 10:00 capture,
218 candles, 218 RVOL results, 300.8ms including cold seed load, 50,076KiB total
probe peak RSS. Seed loaded once per date; per-cut arithmetic is ~20 lookups per
stock. Example MARUTI09:55=1.79x/19d, NATIONALUM=0.81x/19d (Nov6 excluded).
VM2 before: MemAvailable408MiB, swap1093MiB used, sampled si/so0, idle100%,32GiB
disk free. VM1 read-only inspection: MemAvailable541MiB; no VM1 edits/restarts.

Browser fetch/poll/cache code unchanged. Twelve scheduled reads/hour while
visible in market; hidden/history/weekend guards retained. At most two small
scalar fields per stock added to existing compact snapshot (about 9KB raw for
218 stocks, ~108KB/hour at12reads excluding existing payload and compression).
No Vercel RVOL arithmetic or extra ORDS reads. Actual billing unmeasured.

Validation: backend timing/no-lookahead, restart/idempotence, rollover and
missing/zero tests; real React RVOL numeric sort both directions/missing-last;
Rusty projection/history/slider, session polling and Pallas cache regressions;
TypeScript and Next production build. Production source hash checked before
install; backup/rollback and post-release evidence appended after installation.

VM2 installed backup /home/ubuntu/ocelot/backups/rvol-20261108-135839/.
Ocelot active PID945728, NRestarts0, exit0; after MemAvailable398MiB,
sampled si/so0. Installed hashes: ocelot958d1dfb6142b8843196058103c53830b08ce094a116b3ed834c7a24512d8fb4;
adapter b1f13570b17ce3cfb6b9001e685e03994ea421c13ce429684229d0109f709df2;
seed6d79e2d34d41bc7238d4c39018495d6ea699db80f977011a928d83cb6a8f0546.
Rollback: cp -a /home/ubuntu/ocelot/backups/rvol-20261108-135839/ocelot.py
/home/ubuntu/ocelot/ocelot.py; sudo systemctl restart ocelot.service.
Keep RVOL data/module for recovery. Source integration preserved in
backend/ocelot-rvol.patch; seed remains outside Git. Restart was a brief
Ocelot interruption during the closed regular session, not zero downtime.
Next live publication/receipt remains unobserved during this Sunday release.
