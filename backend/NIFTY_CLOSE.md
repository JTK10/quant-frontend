# Nifty previous-session OI

VM2 runs `nifty-oi-close.timer` at 15:40 IST, with retries at 16:00,
16:20, 17:00 and 22:00. The separate oneshot service does not restart Ocelot.
It reads existing private broker and ORDS configuration on the VM.

Capture requires NSE/NFO trading schedules and a fresh same-day closing
five-minute Nifty candle. Holidays and incomplete closes are skipped.
Two future expiries are saved to keep previous levels usable across expiry
rollover. Raw chains and recovery records stay in private VM storage;
only compact ranked levels are published, with read-back verification.
Retries preserve the original date and use a stable capture ID.

The chart API uses only captures strictly earlier than its requested session
and rejects expired contracts. Downloaded historical sessions retain causal
intraday replay. These captures provide previous-session levels, not live
intraday OI updates.

Inspect: `systemctl status nifty-oi-close.timer` and
`journalctl -u nifty-oi-close.service`. Disable with
`sudo systemctl disable --now nifty-oi-close.timer`.
Scripts and unit backups are under `/home/ubuntu/nifty-oi-close/backups`.
Private raw data is under `/home/ubuntu/nifty-oi-close/data`.

October 1 closing fixture was seeded with its actual date and publication
read-back verified. October 2 holiday skip was verified. The first new
automatic trading-day capture still needs observation after a market close.

October 7 fix: cash-index candle validation now uses the NSE close (15:30 in
the measured response); capture readiness still waits for both NSE and NFO
to finish plus five minutes. NFO's 15:40 close must not require a nonexistent
15:35 cash-index candle. The calling-path regression covers differing close
times, the genuine 15:25 index candle and two future expiries.

The missing October 6 record was recovered from genuine broker historical
15:39 option OI for October 13 and October 19 expiries, using the verified NSE
closing index price. All eight required contracts per expiry were present.
The recovery is explicitly identified in provenance; unavailable OI changes
are null. Published source remains `nifty_oi_close` and date remains October 6.
No today's OI was substituted, no historical paper entries replayed, and no
services restarted. The corrected collector was replaced atomically; the
existing timer will pick it up on its next scheduled run.
