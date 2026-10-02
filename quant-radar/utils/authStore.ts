const pattern = /^[a-f0-9]{32}:[a-f0-9]{128}$/;
export const passwordHashValid = (value: unknown): value is string => typeof value === "string" && pattern.test(value);
function credentials() {
  return { url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN };
}
export function passwordStoreConfigured() {
  const { url, token } = credentials(); return Boolean(url && token);
}
const key = () => `quant-radar:auth:${process.env.AUTH_STORE_NAMESPACE ?? process.env.VERCEL_ENV ?? "development"}:password`;
export async function authRedis(command: (string | number)[]): Promise<unknown> {
  const { url, token } = credentials();
  if (!url || !token || !url.startsWith("https://")) { console.error("AUTH_STORE_CONFIG_INVALID"); throw new Error("Password storage unavailable"); }
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) }); }
  catch { console.error("AUTH_STORE_FETCH_FAILED"); throw new Error("Password storage unavailable"); }
  if (!response.ok) { console.error("AUTH_STORE_HTTP_ERROR", response.status); throw new Error("Password storage unavailable"); }
  const data = await response.json();
  if (data.error) { console.error("AUTH_STORE_COMMAND_ERROR", command[0]); throw new Error("Password storage unavailable"); }
  return data.result;
}
export async function currentPasswordHash() {
  const initial = process.env.AUTH_PASSWORD_HASH;
  const { url, token } = credentials();
  if (!url && !token) return passwordHashValid(initial) ? initial : null;
  let stored = await authRedis(["GET", key()]);
  if (stored === null) {
    if (!passwordHashValid(initial)) return null;
    await authRedis(["SET", key(), initial, "NX"]);
    stored = await authRedis(["GET", key()]);
  }
  if (!passwordHashValid(stored)) { console.error("AUTH_STORE_HASH_INVALID", typeof stored); throw new Error("Password storage unavailable"); }
  return stored;
}
export async function replacePasswordHash(expected: string, replacement: string) {
  if (!passwordStoreConfigured() || !passwordHashValid(replacement)) throw new Error("Password storage unavailable");
  // One atomic compare-and-set prevents simultaneous password changes from overwriting each other.
  return (await authRedis(["EVAL", "if redis.call('GET',KEYS[1]) == ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end", 1, key(), expected, replacement])) === 1;
}
export async function allowPasswordAttempt(ip: string, purpose: string) {
  if (!passwordStoreConfigured()) return true;
  const attemptKey = `${key()}:attempt:${purpose}:${ip}`;
  return Number(await authRedis(["EVAL", "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n", 1, attemptKey])) <= 5;
}
