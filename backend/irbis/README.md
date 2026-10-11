# Irbis morning scanner

Irbis is a separate VM2 scanner and website page, not an order engine. Ounce research is parked. It freezes the original four-setup structural candidate pool at 10:00, displays the top five ranked candidates, then reranks that same frozen pool at 10:05, 10:10 and 10:15 using available OI and directional VWAP. No later candidate discovery, ORB gate, volume experiment or automatic paper trade is added.

## Inputs and model

Reads existing atomic `/home/ubuntu/pallas/input` files. Ocelot's already fetched cash candles now preserve volume, and exported prior-day baselines also preserve pdc. There are no added broker requests, subscriptions or live DuckDB readers. Existing Rusty geometry and all retained publishers retain their formulas. The additive fields require an Ocelot restart, backed up before rollout.

The model is the saved Irbis v3 expert bundle trained through October 9, 2026, exported to standard-library tree inference. Twelve heads cover ITC, TIINDIA and HDFC; the existing ADANI training family lacked sufficient samples, so its absent model remains unavailable rather than inventing scores. The numeric score is a ranking value, not calibrated win probability. The final model is forbidden from scoring dates on/before its training end. Frontend historical research uses the saved chronological predictions separately.

Same-day cash bars must be complete through each decision. Missing volume, degraded/future/stale captures, expiry changes and insufficient cash coverage suppress decisions. Prior cash morning bars and same-expiry 15:25 OI are persisted. Initial prior cash/chain context is seeded from October 9; subsequent sessions save their own morning bars and prior-chain context. Existing Ocelot daily PDH/PDL/PDC supplies the full preceding session OHLC used with saved prior morning volume. Missing prior-session symbols are excluded and coverage is checked.

## Durability and publication

One advisory process lock; atomic date state and immutable four-decision document outbox. Restart preserves the frozen pool and processed cuts. Reconstructed decisions are marked Recovered with actual issue time, never backdated as live observations. ORDS source `irbis`, stable decision IDs, bounded read-back before publication retry. Health is separate from rankings and cannot erase a prior same-session board. Health every five minutes during normal session, fifteen minutes outside; local health updates every minute. No Telegram changes.

Unit `irbis.service`: `/usr/bin/python3`, MemoryHigh80M/MemoryMax128M, CPUQuota20%, Nice15. No scientific runtime installed on VM. Inputs read only; own state under `/home/ubuntu/irbis`. Outside regular weekday hours reports CLOSED; absence of a holiday capture is not fabricated as a successful session. A synthetic four-cut morning/restart probe peaked near92MiB before serialization optimization, so the hard cap retains headroom above that observation.

## Validation and limitations

Local native-vs-export parity: twelve heads x150 rows, maximum error 1.34e-15. Cash formula parity over223 symbols. All498 historical rerank/confirmation rows across18 sessions reproduce. Invalid date, future/degraded capture, missing volume and wrong candle boundary rejected; Rusty candle geometry unchanged. Deployment audit files outside repo record service/memory/read-back checks.

Historical tests establish implementation parity, not independent predictive accuracy. Market is closed at deployment, so first-session input flow remains to be observed. Missing morning files after a restart cannot be reconstructed from future data. The shared export excludes invalid/zero-range bars; Irbis suppresses candidates with incomplete sequences. Final morning ranks are not tick-updated prices or trading instructions.

## Rollback

Stop/disable only irbis.service and preserve its state. Restore Ocelot files from its timestamped irbis backup and restart only Ocelot if removing the additive export fields. Pallas/Kairos/Rusty are not restarted as part of Irbis rollback. Revert only the Irbis frontend commit through the normal Git/Vercel path. Never delete shared captures or credentials.
