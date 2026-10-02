# Personal access

The dashboard and every data API require a signed, 365-day HttpOnly session. The login page has no registration or password reset endpoint. Password verification uses scrypt; passwords and signing secrets stay server-side. Changing either configured credential invalidates existing sessions. Logout clears this browser's cookie; a copied session remains usable until expiry or key rotation. Existing seven-day sessions retain their original expiry; sign in again after deployment to receive a one-year session. Browsers may clear cookies sooner depending on their privacy settings.

Run `node scripts/setup-private-access.mjs` once from this folder. It backs up the existing local environment into ignored `.private/`, generates a random password, and stores it in `.private/login-credentials.txt`. The same password works across all four laptops. Do not upload `.private/` or `.env.local` to Git.

Before production deployment, add AUTH_PASSWORD_HASH and AUTH_SESSION_SECRET from `.private/vercel-auth.env` to the Vercel quant-radar project's Production environment variables (and Preview if needed), then rebuild/deploy. Missing configuration fails closed: the dashboard is inaccessible and login returns 503. Keep the generated strong password; the login route's five-attempt/15-minute backoff is per server instance, not a durable distributed rate limiter. Vercel firewall rate limiting can supplement it.

Authentication restricts access to app data; public hosting can still receive bot requests. External upstream APIs need their own protections. Static assets are public. Session cookies use Secure in production, SameSite=Lax, Path=/, and HttpOnly. Mutating API requests require a matching Origin.

Verify anonymous pages redirect to login, anonymous data APIs return 401, valid login restores the requested local page, invalid passwords cannot create sessions, foreign origins fail, logout clears the session, and all existing data routes retain independent session checks. See https://nextjs.org/docs/app/api-reference/file-conventions/proxy for the request gate; route checks provide additional protection.
