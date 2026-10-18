Deployment handoff: this folder is the offline historical replay only. Live scanning has not been implemented or deployed.

# Lupus offline bull and bear desk

Local research prototype. Production frontend and services are not changed.

Run `NSE_PORTABLE_KIT_20260918/.venv/Scripts/python.exe -m http.server 8767 --bind 127.0.0.1 --directory lupus-research/offline-preview` from the workspace root. Open http://127.0.0.1:8767.

Data:11 October2026 sessions. Build with `build_data.py`. Bull: corrected historical OI-line reclaim plus recorded PDH, cumulative CE ≤ −3%, retaining original most-negative-CE ranks. Bear: locked V1 historical failed line, below line and open, positive rising CE, ranked decline from open descending. PE unrestricted. No first-candle-low filter or10:00 delay. CE-momentum experiments have not replaced BearV1.

Each row is a qualifying candidate at the selected recorded cut. Top3 is per side/per cut, ties retained. Top3 is the default; scope persists in the URL. Rejected slots are not backfilled. All qualified shows lower original ranks that pass the CE floor. Historical outcomes are attached only at the exact first filtered-top-three cut (bull outcomes recomputed by the CE-magnitude experiment) and shown in a separate collapsed section; future outcomes never influence ranking. Published and reconstructed OI provenance/coverage are in the detail drawer. Not a live scanner or a calibrated confidence model.

No external resources load automatically, no polling, no credentials or live APIs. Session JSON is loaded on demand and cached in memory. Only an explicit TradingView click opens an external site. Inactive sidebar items are labels, not navigation promises.
