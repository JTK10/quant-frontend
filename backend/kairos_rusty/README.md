# Kairos Rusty — separate paper bot

Built locally on 8 October 2026. **Not deployed or armed for real orders.** The user selected the existing Rusty `entry_confirmed` label as the trigger. This worker does not use Lynx or Pallas AI. Its directory, systemd unit, state, Oracle source and website tab are independent of the existing bots. The existing uncommitted Pallas-based `backend/kairos3` draft is unrelated.

## Entry policy

1. Read actual Oracle `source=rusty` snapshots for the current IST date, every 15 seconds while entries are allowed. No live DuckDB reads and no changes to the Rusty publisher.
2. Use the newest cut and newest publication for that cut. Require a publication after this worker's startup, at most 90 seconds old; cut no more than 180 seconds old. No retrospective entries after restart. Replays, degraded boards, duplicate/conflicting symbols and partial Oracle responses are withheld.
3. Require `entry_confirmed is True`, `brk is True`, `conviction=HIGH`, a recognized classification for that board, finite OI fields and a positive Rusty rank. These are the existing Rusty confirmation conditions. The publisher checks spot and the completed cash candle against PDH for bulls or PDL for bears; those levels are not present in the public row, so this bot consumes that published confirmation rather than claiming to independently recompute the breakout.
4. Independently verify OHLC geometry and candle direction. Its start must be exactly five minutes before the cut. Recompute body >=70% and both wicks <=15% from OHLC. Missing/forming candles cannot trigger an entry. The publisher already accommodates its 4–5 second candle delay.
5. Bulls buy CE; bears buy PE. Within the same publication, prefer the **largest absolute Rusty OI change**, then Rusty rank, then symbol. Rusty % can be negative; a large OI decline must not disappear through a signed descending sort. No new OI percentage, rank, gap or AI threshold is imposed.
6. Use Classic Kairos's one-OTM convention: the first strike strictly above the signal cash close for CE, or below for PE. Choose the nearest available expiry at least seven calendar days out. Resolve real contract IDs and lot sizes from Upstox against Ocelot's current-date underlying universe. Missing/ambiguous contracts withhold that candidate. There is no substitution of an unrelated cheaper option.
7. One paper entry per day across both sides. An unavailable contract or quote does not block trying another qualifying stock. A candidate that fails budget/depth is logged as SKIP; transient data errors retry within the original freshness window. Touching `HALT` in the bot directory blocks new entries while exit monitoring continues.

These OI fields describe changes in positions; they do not establish which participant bought or wrote those positions. Rusty's HIGH label is a classification, not an AI probability.

## Accounting and risk defaults

Copied from the **currently deployed** Kairos 2 accounting baseline, not the uncommitted local changes:

- Rs30,000 maximum premium outlay, whole lots and published minimum lot. No Rs35,000 single-lot exception.
- Buy against up to five ask depth levels and mark/exit against sufficient bid depth for the entire quantity. Crossed books are rejected on entry. No LTP fallback or ideal stop-price fills. There is no additional spread-percentage threshold in this version, matching the deployed baseline.
- Quote instrument must match, quote <=30 seconds old, receipt <=10 seconds old, quote at or after signal publication, and a valid current-session last trade timestamp. No future quotes.
- Initial premium stop **−15%**. Bid-mark gains +15/+25/+40/+60/+100% raise the stop to +2/+15/+25/+40/+70%. Poll the open position every five seconds.
- Entry before 11:30 IST; exit at 11:30 or an earlier verified NSE market close. Missing exit depth retains the position with a pending status. Restart and midnight retain overdue positions and block an additional entry.
- Gross P&L excludes charges; quoted paper fills are not guaranteed real executions.

Atomic state includes the position, daily lock, trail and publication outbox. An exclusive Linux process lock prevents duplicate workers. Oracle source `kairos_rusty`, cap `KAIROS_RUSTY`, mode `paper`; event kinds ENTRY/MTM/EXIT/SKIP/HEALTH. Stable Doc_ID is checked before retrying uncertain posts. Health/MTM backlog is bounded at 1000; entries and exits remain durable. The broker transport permits only GET market timings, contracts and quotes, with no order endpoint or live-mode switch.

## Website

Local code adds `/kairos?engine=kairos_rusty` as a **Rusty** tab. It uses the existing dashboard with separate P&L and shows Rusty %, rank, CE/PE changes, classification, candle and premium stop. No AI score is fabricated. Pallas remains Kairos 2.0 and Lynx remains Classic; the default selection stays Kairos 2.0.

## Verification

From the repository root:

```powershell
python -m unittest discover -s backend/kairos_rusty -p 'test_rusty*.py' -v
```

From `quant-radar`:

```powershell
node scripts/test-kairos2.mjs
node scripts/test-kairos-rusty-view.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

`replay_rusty.py` accepts saved raw Oracle board JSON or JSON.gz and writes eligible-candidate CSVs plus a summary. It deliberately does not infer executable fills or P&L from five-minute LTP. See [two-day eligibility report](RESEARCH_20261008.md).

## Deployment plan — pending deployment authorization

1. Copy only `rusty_engine.py`, `rusty_signals.py`, `rusty_live.py` into a new `/home/ubuntu/kairos_rusty` directory owned by ubuntu. Keep private state there. Reuse `/home/ubuntu/ocelot/venv`, `tokens.json`, `universe.json`, `ords.json` as read-only inputs. Do not copy tokens into Git or reports.
2. Run `rusty_live.py --probe` with that Python. This reads verified NSE timings, a reference contract/quote and actual Rusty Oracle snapshots. It creates no trades or state and posts no documents. A closed-market quote does not validate live fills.
3. Install only `kairos_rusty.service`, daemon-reload, and start/enable that unit. **No Rusty/Ocelot, Pallas, Nifty, Kairos 1/2 or existing Kairos 3 restart is needed.** Test the existing shared broker request budget during the first live session; the new worker adds at most two broker requests/second, normally one quote every five seconds with one open position.
4. Check `health.json`, service logs, Oracle source isolation and pending publications. Verify fresh post-start confirmed labels, completed candle timing, option selection, depth and stop accounting during a real session. Local tests and historical eligibility cannot establish full-session reliability.
5. Deploy the frontend changes separately through Git/Vercel. The Rusty tab will show a missing heartbeat until the new paper worker is actually running. No Telegram integration is added by this change.

Rollback: stop/disable only `kairos_rusty.service`; preserve state and outbox. Remove the frontend tab through an ordinary code rollback. Never clear a position or daily lock to force another trade.

The service has no listener, CPUQuota15%, Nice15, MemoryHigh192M / MemoryMax256M. The Oracle endpoint returns full daily Rusty boards (measured ~12.8 MB for a complete session); reads are capped at 24 MB, polled only before entry, and stop when a position is open or the daily trade is taken. The worker fails closed if the result is truncated, oversized or unavailable. A future incremental feed would reduce this overhead but requires a separate publisher/API change.

Broker schemas checked against official [option contracts](https://upstox.com/developer/api-documentation/get-option-contracts/), [full quotes](https://upstox.com/developer/api-documentation/get-full-market-quote/) and [market timings](https://upstox.com/developer/api-documentation/get-market-timings/) documentation.
