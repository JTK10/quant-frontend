# Korat retired for Sol — 2026-11-09

User authorized replacement with Sol, which renders the existing Rusty source.
`oi-line-breaks.service` is disabled and stopped on VM2. Do not reinstall,
enable or restart it incidentally. All source, state, outbox and history remain
in place; no shared producer or input data was deleted.

VM backup: `/home/ubuntu/oi-line-breaks/backups/retired-sol-20261109-011147/`.
Contains prior service unit, hashes, enabled/process status, health and retained
application PIDs before/after. All retained PIDs were unchanged by retirement.
Rollback: `sudo systemctl enable --now oi-line-breaks.service` plus a revert of
the Sol frontend release if the old page/API is required.

No Korat-powered Kairos service exists among the inspected deployed units or
repositories. VM1 Classic uses Lynx; VM2 Kairos2 and inactive Kairos3 use Pallas,
Kairos9 uses Irbis, Kairos10 uses Aurum. Those unrelated services are preserved.
No guessed bot retirement or deletion was performed.

Korat navigation is replaced with Sol. `/korat` redirects to `/sol`; the old
authenticated API returns410 without reading ORDS or any archive. Archives
remain in the repository for recovery but are no longer traced into that API.
