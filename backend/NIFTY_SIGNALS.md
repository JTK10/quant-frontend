# Nifty paper scanner

Separate VM2 `/home/ubuntu/nifty-signals` oneshot service/timer, 100 MB hard memory limit, REST only. No production DuckDB queries, no orders, no changes to Ocelot. Uses existing private broker/ORDS configuration. `nifty_oi_close.py` is copied as a transport dependency; scanner process changes its source constant only in memory.

Every five minutes during 09:00–16:55 IST, check exchange timings and completed current-date candles. Entries only 10:30–14:00. Holiday/missing endpoints/stale quote/delayed scan suppress entries. Never replay missed entries as live. Target 3R, structural stop ±3, risk 8–60 index points. Live quote must be no older than 30 seconds and generation within 90 seconds of candle cut.

Reversal and break/retest detectors match original Gemini research across 903 date/cut cases. One-minute OI lag uses cut−12 and cut−2 opening timestamps. Fixed ATM ±200 basket and wall ±50 basket each require every same-expiry CE/PE contract with positive OI at both endpoints. Bulls require PE increase and CE decrease in both baskets; bears the inverse. Only strictly earlier closing OI captures, matching an unexpired expiry, supply walls.

Paper operation limits exposure to one open position and two daily entries, 30-minute entry cooldown and five minutes after previous exit. This combined exposure cap is stricter than separate benchmark strategy runs. Outcomes start with the first full minute after generation; stop wins ambiguous bars, timeout 120 minutes or session close. The generation minute is excluded because its high/low can precede entry. These are index reference outcomes, not option returns or executable fills.

Frontend `/nifty-signals` authenticates all requests. Ten combined 3R trades are explicitly historical research replay; no generated time is invented. Live source `nifty_paper_signals` stores date-filtered state reports. Reports contain no credentials. Historical monthly results are in-sample and cannot establish future accuracy.

October 3 update: also allow symmetric direct breaks of prior-session walls with a completed five-minute body >=45%, prior close on the original side and close >=5 points beyond the wall. Existing reversal/retest candidates retain priority. Both lagged OI sign gates and every freshness, risk and exposure restriction remain in force. The 40% body and extended-window experiments are not enabled.

Historical chart fixtures now use the combined full-month replay with assumed next-minute-open entry and generation-minute exclusion: ten trades, seven targets, two stops, one time exit. October1 signal12:25, assumed entry12:26 at22481.95, stop22513.65,target22386.85,target12:49. `entry_time` positions historical overlays; it is an assumed simulation fill, not a fabricated live generation timestamp. Research report: nifty-research/analysis/direct-break-addition/REPORT.md. The threshold was considered after observing October1; retrospective figures are not out-of-sample validation.

Check: `systemctl status nifty-signals.timer`, `journalctl -u nifty-signals.service`. Restart only this oneshot if necessary. Do not open the live Ocelot database to inspect signals.
