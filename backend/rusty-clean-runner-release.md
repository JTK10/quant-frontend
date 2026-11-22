# Rusty Clean-Runner Maximizer & November History Release — 2026-11-22

Adds causal 11-lane Clean-Runner Maximizer (`★T1`/`★T2`/`★T3`) highlights and filters to production `/rusty` and `/sol` boards (both live incoming cuts and all 50 historical sessions including all 14 November 2026 sessions), plus full 75-cut historical November Rusty snapshot archives (`2026-11-02..2026-11-20`).

## 1. Zero-Future-Leakage & Prefix-Invariance Verification
- **Feature Causality:** Every input to the 11-lane Clean-Runner Maximizer (`pdh`, `pdl`, `prev_cl`, `pd_range_pct`, `hi3`, `lo3`, `hi5`, `lo5`, `pd_fresh_oi_5d_share`, `pd_fresh_ext_5d_L`, `open0`, `run_hi`, `run_lo`, `vwap_ok`, `cum_rvol`, `bar_rvol`, `clv`, `bar_rng`, `or15_broken`, `prev_bars_broken`, `bar_low_holds_pd`, `pre_break_mae_open`, `mkt_breadth_dir`, `broken_ext_share`, `blk_oi_2pct_pd`, `room_entry_to_oi_wall`, `broken_oi_chg_prev`, `tgt_oi_chg_prev`, `opp_floor_oi_chg_open`, `tgt_ltp_chg_open`, and `T1_L2_WALL_SMASH` cascade tip/unwind) depends strictly on prior sessions `< date` and current-day bars/chains `<= cut_ist`.
- **Cut-by-Cut Stepping & Prefix Invariance:** Verified across all 50 sessions (`2026-09-07..2026-11-20`, `1,026/1,026` signals) that stepping cut-by-cut `09:20..10:35` with future bars truncated or corrupted by adversarial noise produces 100.00% identical triggers, tiers, lanes, and scores (`0` mismatches).
- **UI Projection Boundary:** `projectRustySnapshot` attaches `cr_tier`, `cr_lane`, `cr_cut`, and `cr_score` strictly when `cut >= cr_cut` (tested at `09:30` before `2026-11-02 DIXON @ 09:35` vs `09:35` and `10:15`).

## 2. Live VM2 Producer (`/home/ubuntu/ocelot/ocelot.py` + `rusty_clean_runner.py`)
- Fail-open stdlib adapter `/home/ubuntu/ocelot/rusty_clean_runner.py` reads `/home/ubuntu/ocelot/rusty_clean_runner_data/seed.json` (`1,608,578` bytes) and `/home/ubuntu/ocelot/rusty_rvol_data/`, evaluates all active symbols at `09:20..10:35` IST, persists triggers atomically in `rusty_clean_runner_data/YYYY-MM-DD.json`, and attaches sticky `cr_tier`, `cr_lane`, `cr_cut`, `cr_score` to qualifying rows.
- Representative non-publishing VM2 probe on actual `2026-11-20` morning cuts (`09:15..10:35`, 17 cuts, 218 symbols): `418.96 ms` per cut average (`92,740 KiB` peak RSS), emitting 13 Bull and 2 Bear triggers (including `PERSISTENT @ 09:25`, `TATAELXSI @ 10:00`, `COROMANDEL @ 10:10`).
- Zero new broker requests, subscriptions, database readers, timers, or workers.
- **VM2 Backup & Hashes:**
  - Backup: `/home/ubuntu/ocelot/backups/clean-runner-20261122-185804/ocelot.py` (original SHA-256: `4503cd577dc17d7092d0223417095ced3ad292d128b9cec74a29983be8e19ac5`).
  - Deployed `/home/ubuntu/ocelot/ocelot.py` SHA-256: `84d0cd9bd4e8fc64c55121b895d3e9bd65e41319857418bc3c3f95903ab2029b`.
  - Deployed `/home/ubuntu/ocelot/rusty_clean_runner.py` SHA-256: `8845f3c762443e8a7f46cfad951139aa86694a63c839cda049cad4673a010580`.
  - Deployed `/home/ubuntu/ocelot/rusty_clean_runner_data/seed.json` SHA-256: `4d4ce21a9729cdd496da46cbd11b86bfe8dfd6038a824d119b3f44b5fa83f7e0`.
  - Rollback command: `cp -a /home/ubuntu/ocelot/backups/clean-runner-20261122-185804/ocelot.py /home/ubuntu/ocelot/ocelot.py && sudo systemctl restart ocelot.service`.
  - Service status: `ocelot.service` active (`MainPID=1108147`, `NRestarts=0`, `ExecMainStatus=0`).
  - VM2 resources: `MemAvailable` `318 MiB` before -> `384 MiB` after, sampled `si/so = 0/0`, `32 GiB` free disk, zero kernel/OOM events.

## 3. Frontend & Bandwidth Budget (`quant-radar`)
- Polling cadence, visibility guards, and cache headers unchanged (`12` scheduled reads/hour while visible in live market; `0` polling on historical/weekend views; `private, max-age=300` on historical/cut requests).
- Packaged `14` November 75-cut archives in `quant-radar/data/rusty-november/` (`22,608,726` gzipped bytes total) so historical November dates (`2026-11-02..2026-11-20`) load seamlessly on `/rusty` and `/sol` without ORDS retention gaps.
- Packaged `1,026` causal Clean-Runner labels across all 50 sessions (`2026-09-07..2026-11-20`) in `quant-radar/data/rusty-clean-runners.json` (`47,378` bytes).
