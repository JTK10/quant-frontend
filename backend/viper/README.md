# Viper live scanner

VM2 reuses the Ocelot JSON exports under `/home/ubuntu/pallas/input`. The scanner only uses the prior regular NSE session's healthy 15:25 capture and applies the approved bull and bear rules to matching expiry/strike/leg data. The actual chain and export receipt times are validated against each five-minute cut. Missing or degraded cuts do not supply a 15-minute comparison. The exchange calendar gates regular sessions. Special trading hours are excluded.

`viper.service` is isolated under `/home/ubuntu/viper`. It uses Python's standard library, SQLite for a transactional checkpoint and outbox, and a process lock. There is one publication per completed cut. The publisher caches the existing server-side OAuth token. Stable source/date/cut IDs survive restart. Uncertain sends reconcile against source/date read-back before retry. One pending item is attempted per loop. Prior-date pending records remain eligible after rollover. After eight failed attempts the record remains in SQLite for inspection and operator reconciliation.

The ORDS source is `viper`. Documents include `date`, `sig_date`, `Doc_ID`, `cut`, `baseline`, `chain_exported_at`, `recovered`, `limited` and the Bull and Bear arrays. Ignitions and transition rows are prioritized ahead of ongoing states within the 20 KiB cut budget. A limited document discloses any omitted rows. A recovered validation cut is explicitly identified. Historical offline coverage remains available in the local replay. The production feed starts at deployment and only includes published cuts.

ORDS ignores the tested `limit` values 1, 2 and 100 on the source/date handler. A full session may return up to 76 cut documents. The request budget is 12 reads/hour per continuously open active tab at five-minute polling, up to roughly 1.5 MiB of cut documents plus ORDS response framing per read. Actual November active/event volume measured up to 1.07 MB before framing. Private response caching and date/source isolation are required.

## Checks

Run `python3 -B test_viper.py` and a bounded representative capture check with `python3 -B viper_live.py --sample 2026-11-11` on VM2. The sample uses November 9 baseline and the first seven November 11 cuts. Preflight under the proposed cgroup measured 50,080 KiB peak RSS and 4.85 seconds elapsed. Independently compared 36,225 state rows from November 11 and October 22 against the offline SQL. State parity was exact. Display rounding may differ by 0.01.

First-install rollback is `sudo systemctl disable --now viper.service`. Preserve the scanner's database for inspection and preserve all upstream data.
