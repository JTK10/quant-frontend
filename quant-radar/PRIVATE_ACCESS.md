# Personal access

The dashboard and every data API require a signed, 365-day HttpOnly session. The login page has no registration or password reset endpoint. Password verification uses scrypt; passwords and signing secrets stay server-side. Changing either configured credential invalidates existing sessions. Logout clears this browser's cookie; a copied session remains usable until expiry or key rotation. Existing seven-day sessions retain their original expiry; sign in again after deployment to receive a one-year session. Browsers may clear cookies sooner depending on their privacy settings.

Run `node scripts/setup-private-access.mjs` once from this folder. It backs up the existing local environment into ignored `.private/`, generates a random password, and stores it in `.private/login-credentials.txt`. The same password works across all four laptops. Do not upload `.private/` or `.env.local` to Git.

Before production deployment, add AUTH_PASSWORD_HASH and AUTH_SESSION_SECRET from `.private/vercel-auth.env` to the Vercel quant-radar project's Production environment variables (and Preview if needed), then rebuild/deploy. Missing configuration fails closed: the dashboard is inaccessible and login returns 503. Keep the generated strong password; the login route's five-attempt/15-minute backoff is per server instance, not a durable distributed rate limiter. Vercel firewall rate limiting can supplement it.

Authentication restricts access to app data; public hosting can still receive bot requests. External upstream APIs need their own protections. Static assets are public. Session cookies use Secure in production, SameSite=Lax, Path=/, and HttpOnly. Mutating API requests require a matching Origin.

Verify anonymous pages redirect to login, anonymous data APIs return 401, valid login restores the requested local page, invalid passwords cannot create sessions, foreign origins fail, logout clears the session, and all existing data routes retain independent session checks. See https://nextjs.org/docs/app/api-reference/file-conventions/proxy for the request gate; route checks provide additional protection.

## Change password

Connect a Free Upstash Redis database through Vercel → quant-radar → Storage. The owner must accept the marketplace/Upstash terms. Connect Production and Preview using default variables. Supported pairs are UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN (the complete names are UPSTASH_REDIS_REST_TOKEN and KV_REST_API_TOKEN). Rebuild after connection. No additional npm package is required.

Use Change password → current password → new password → confirmation. New passwords require 16–256 characters. Only the salted scrypt hash is saved, never plaintext. The first Redis read bootstraps AUTH_PASSWORD_HASH with SET NX; later changes use atomic compare-and-set. Keep the signing secret configured. All subsequent session checks use the current hash, rejecting sessions from all laptops after a change. Requests already authorised at the moment of change may finish. Redis failures deny authenticated access rather than reverting to the original password. Redis quota/read latency therefore affects login and dashboard access; monitor the Free plan command allowance and do not enable paid upgrades automatically.

Production and Preview keys are separated by VERCEL_ENV. Local development defaults to development; AUTH_STORE_NAMESPACE can override this for a dedicated test database. Do not point tests at the production namespace. Each deployment's browser origin is independently checked for mutations. Per-IP five-attempt/15-minute counters are shared through Redis when connected; without Redis existing login backoff remains per instance and password changes stay disabled.

After changing the password, the original local password file and Vercel bootstrap hash are no longer the current credential. Save your chosen new password privately. Do not delete/clear the auth Redis key: bootstrap would restore the initial environment hash. Disaster recovery requires deliberately updating AUTH_PASSWORD_HASH to a newly generated hash and resetting the store under owner control, then redeploying. Merely redeploying does not reset a stored password.

Run `node scripts/test-password-store.mjs` to check storage/session behavior against a mock only. It does not change a real password or touch an external database. See https://upstash.com/docs/redis/features/restapi and https://upstash.com/docs/redis/howto/vercelintegration.
