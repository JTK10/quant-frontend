# Telegram signal policy

User requested only Kairos trade alerts, Pallas AI strictly **above 70%**, and existing health cards. This does not change scanner signals, website publication, scoring or paper entry rules (Kairos2 still uses AI >=70).

VM1 existing Kairos sender and `caracal-health.timer` / `lynx-health.timer` are retained. Fable, Serval, Caracal2, Caracal3 and retired Caracal-alert receive a final systemd `EnvironmentFile=/home/ubuntu/telegram-alert-policy/muted.env` containing empty Telegram token/chat settings. Shared original environment files remain intact. Four active senders were briefly restarted after market close to activate those notification settings; disabled Caracal-alert remains disabled.

VM2 `/home/ubuntu/telegram-signals`, `telegram-signals.service` reads confirmed Pallas event exports and the existing date/source-isolated Kairos2 ORDS GET. No broker calls, scanner writes, new subscriptions or order calls. Credentials use the existing VM1 Kairos bot/chat and live only in VM-side mode600 `private.env`; they are never committed. Observed service memory is about 10 MB in standby, with MemoryMax64M/CPUQuota5%.

Pallas: current IST day, nonrecovered `CONFIRMED_CLOSE` / `CONFIRMED` / `SCORED`, finite score >0.70 and <=1, issue timestamp after initial enablement, nonfuture, <=5 minutes old. EARLY signals and retrospective corrections are not alerted. Kairos2: only current-day fresh paper ENTRY / EXIT events, stable Doc_ID. MTM, HEALTH and SKIP do not produce extra Telegram messages. Legacy Kairos keeps its existing alerts.

Worker checks every20 seconds during 09:15–15:40 IST weekdays. State stores original enablement cutoff and stable alert IDs; it never replays older trades on startup. HTTP429 honors retry delay. ID is atomically recorded before delivery. Successful deliveries are not repeated; ambiguous timeouts/crashes are marked uncertain and suppressed on restart. Telegram provides no send-message idempotency key, so avoiding duplicate trades may mean an alert with ambiguous delivery is lost. This limitation is visible in relay health/state, without logging token URLs.

`--probe` verifies bot identity and bounded source-isolated ORDS reads without sending messages. Unit tests use mocked transports only and cover score boundaries, stale/future/recovered/early events, wrong source/mode/kind, durable duplicate protection, ambiguous delivery and 429 cooldown. No historical or synthetic Telegram alerts were sent during deployment. First actual next-session delivery remains to be observed.

Rollback: stop/disable **only** `telegram-signals.service`; retain notification state. Remove only the `90-telegram-alert-policy.conf` drop-ins to restore old alert routes, daemon-reload, then restart the four affected scanners after market close. Preserve shared environment files and both VM-side timestamped backups.
