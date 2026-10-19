# Charts navigation toggle — 2026-10-19

Charts toolbar now has an accessible Hide/Show navigation button on its left. Navigation is shown by default; chart-page state controls visibility without unmounting chart components or changing URLs. Other pages always show navigation. Existing Lightweight Charts autoSize resizes to the available container. On narrow screens the hidden-navigation workspace can use full viewport height.

Frontend-only: no VM changes, new requests, timers, subscriptions, polling/cache/auth changes or dependencies. Files: AppShell, NavSidebar, ChartsNavigation context, ChartsClient, charts.css. Existing files recoverable from Git parent; rollback by reverting this release commit. Production build/type checking passed. No production visual check; user will verify after deployment.
