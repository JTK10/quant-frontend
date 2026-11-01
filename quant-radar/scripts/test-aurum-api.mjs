import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const at = stamp => Date.parse(stamp + '+05:30');
const json = (body, init = {}) => ({body, status: init.status ?? 200, headers: new Headers(init.headers)});
const NextResponse = {json, next: () => ({headers: new Headers()}), redirect: () => ({status: 307, headers: new Headers()})};
let authenticated = true;
const auth = {SESSION_COOKIE: 'test', validSession: async () => authenticated, sameOrigin: () => true,
  requireApiSession: async () => authenticated ? null : json({error: 'Please sign in'}, {status: 401, headers: {'Cache-Control': 'private, no-store'}})};
const request = route => ({nextUrl: new URL('https://test.invalid' + route), url: 'https://test.invalid' + route, method: 'GET', headers: new Headers(), cookies: {get: () => ({value: 'test'})}});
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText;
  vm.runInNewContext(code, {exports, Headers, URL, Date, Buffer, AbortSignal, Error, console,
    ...globals, require: name => {if (!(name in dependencies)) throw Error('Unexpected test import: ' + name); return dependencies[name];}});
  return exports;
}
function signal(date, symbol = 'TEST') {
  return {id: `aurum-v1|${date}|${symbol}`, symbol, side: 'BULL', signal_time: '09:35', entry_time: null,
    entry: null, reference_price: 100, ce_pct: -2, pe_pct: 3, oi_bias: 5, view: 'CE OI Down + PE OI Up',
    bar_rvol: 2.5, cum_rvol: 1.8, pullback_confirmed: true};
}
function doc(date, kind, values = {}) {
  return {source: 'aurum', sig_date: date.replaceAll('-', ''), date, kind, status: 'READY', ts: at(date + 'T10:00:00') / 1000,
    asof: date + 'T10:00:00+05:30', ...values};
}
function feedHarness({start = at('2026-11-02T10:00:00'), payload, failFeed = false} = {}) {
  let now = start, failure = failFeed;
  const calls = [];
  class Clock extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;}}
  const process = {env: {PANTHER_CLIENT_ID: 'unit-test', PANTHER_CLIENT_SECRET: 'unit-test', PANTHER_TOKEN_URL: 'https://test.invalid/token', PANTHER_SIGNALS_URL: 'https://test.invalid/feed'}};
  const globals = {Date: Clock, process};
  const cache = load('utils/resultCache.ts', {}, globals);
  const feed = load('utils/aurumFeed.ts', {'./resultCache': cache}, {...globals, fetch: async (input, options) => {
    const url = new URL(input); calls.push({url, options});
    if (url.pathname === '/token') return new Response(JSON.stringify({access_token: 'unit-token', expires_in: 300}), {status: 200});
    if (failure) return new Response('{}', {status: 503});
    const body = typeof payload === 'function' ? payload(url) : payload ?? {items: []};
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {status: 200});
  }});
  return {feed, calls, now: () => now, advance: ms => {now += ms;}, fail: value => {failure = value;}};
}

// Source/date filters are applied upstream, identical concurrent requests share a
// result, and distinct date requests still share the in-flight OAuth exchange.
const shared = feedHarness({payload: url => ({items: [
  {doc: JSON.stringify(doc(url.searchParams.get('sig_date').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), 'HEALTH'))},
  {doc: JSON.stringify({...doc('2026-11-02', 'HEALTH'), source: 'pallas'})},
  {doc: JSON.stringify(doc('2026-10-30', 'HEALTH'))},
]})});
const [one, duplicate, other] = await Promise.all([
  shared.feed.readAurumFeed('2026-11-02', '2026-11-02'), shared.feed.readAurumFeed('2026-11-02', '2026-11-02'),
  shared.feed.readAurumFeed('2026-11-01', '2026-11-02'),
]);
assert.equal(shared.calls.filter(call => call.url.pathname === '/token').length, 1, 'Shared concurrent OAuth exchange');
assert.equal(shared.calls.filter(call => call.url.pathname === '/feed').length, 2, 'Identical date read is deduplicated');
assert.equal(one.length, 1); assert.equal(duplicate.length, 1); assert.equal(other.length, 1);
for (const {url, options} of shared.calls.filter(call => call.url.pathname === '/feed')) {
  assert.equal(url.searchParams.get('src'), 'aurum');
  assert.match(url.searchParams.get('sig_date'), /^2026110[12]$/);
  assert.equal(options.cache, 'no-store'); assert.ok(options.signal instanceof AbortSignal);
}
await shared.feed.readAurumFeed('2026-11-02', '2026-11-02'); assert.equal(shared.calls.length, 3, 'Completed live read reused');
shared.advance(60001); await shared.feed.readAurumFeed('2026-11-02', '2026-11-02'); assert.equal(shared.calls.length, 4, 'Live cache expires after one minute');
const oldCalls = shared.calls.length; await shared.feed.readAurumFeed('2026-11-01', '2026-11-02'); assert.equal(shared.calls.length, oldCalls, 'History reuses one-hour process cache');
shared.advance(3600000); await shared.feed.readAurumFeed('2026-11-01', '2026-11-02'); assert.equal(shared.calls.filter(call => call.url.pathname === '/token').length, 2, 'Expired OAuth token refreshes');

for (const payload of [{items: [], hasMore: true}, {items: Array.from({length: 301}, () => ({}))}, {items: [{doc: '{broken'}]}, 'x'.repeat(1024 * 1024 + 1)]) {
  const h = feedHarness({payload});
  await assert.rejects(h.feed.readAurumFeed('2026-11-02', '2026-11-02'), /Incomplete|oversized|Malformed|budget/);
}
const recovering = feedHarness({failFeed: true});
await assert.rejects(recovering.feed.readAurumFeed('2026-11-02', '2026-11-02'), /unavailable/);
recovering.fail(false); await recovering.feed.readAurumFeed('2026-11-02', '2026-11-02');
assert.equal(recovering.calls.filter(call => call.url.pathname === '/feed').length, 2, 'Failed result is not cached');

const {foldAurum} = feedHarness().feed;
const date = '2026-11-02', now = at(date + 'T10:10:00');
const first = signal(date), second = signal(date, 'OTHER');
const folded = foldAurum([
  doc(date, 'SNAPSHOT', {signals: [first]}),
  doc(date, 'SNAPSHOT', {ts: now / 1000 - 60, signals: [first, second]}),
  doc(date, 'HEALTH', {ts: now / 1000, status: 'ERROR', error: 'Cash input delayed'}),
  {...doc(date, 'SNAPSHOT', {signals: [signal(date, 'WRONGSOURCE')]}), source: 'pallas'},
  doc('2026-10-30', 'SNAPSHOT', {signals: [signal('2026-10-30', 'WRONGDATE')]}),
  doc(date, 'SNAPSHOT', {ts: now / 1000 + 100, signals: [signal(date, 'FUTURE')]}),
], date, date, [], now);
assert.deepEqual(Array.from(folded.signals, row => row.symbol), ['OTHER', 'TEST']);
assert.equal(folded.status, 'ERROR'); assert.equal(folded.stale, true);
assert.ok(folded.message.includes('Cash input delayed'));
const futureSignal = {...signal(date), signal_time: '10:25'};
assert.equal(foldAurum([doc(date, 'SNAPSHOT', {signals: [futureSignal]})], date, date, [], now).signals.length, 0, 'Future signal time is not exposed');
assert.equal(foldAurum([], date, date, [], now).status, 'PENDING');
assert.equal(foldAurum([], date, date, [], now).stale, true);
const old = foldAurum([doc('2026-10-30', 'HEALTH', {status: 'CLOSED'})], '2026-10-30', date, [], now);
assert.equal(old.mode, 'historical'); assert.equal(old.stale, false, 'Archived closed dates do not age into live errors');

// Adversarial producer schema/time checks prevent malformed candles from becoming
// a valid timestamp merely because Date.parse returned NaN.
assert.throws(() => foldAurum([doc(date, 'SNAPSHOT', {signals: [{...signal(date), signal_time: '99:99'}]})], date, date, [], now), /Invalid|time|signal/);
assert.throws(() => foldAurum([doc(date, 'SNAPSHOT', {signals: [{...signal(date), reference_price: 'bad'}]})], date, date, [], now), /Invalid|price|signal/);
const full = Array.from({length: 250}, (_, i) => signal(date, 'S' + i));
assert.equal(foldAurum([doc(date, 'SNAPSHOT', {signals: full}), doc(date, 'SNAPSHOT', {signals: full})], date, date, [], now).signals.length, 250, 'Repeated IDs do not consume the unique-signal budget');

const extendedNow=at(date+'T11:31:00');
const late={...signal(date,'LATE'),id:`aurum-v1.1|${date}|LATE`,signal_time:'11:30',entry_time:'11:30'};
const extended=foldAurum([
  doc(date,'SNAPSHOT',{signals:[first]}),
  doc(date,'SNAPSHOT',{engine:'aurum-v1.1',ts:extendedNow/1000-10,signals:[late]})
],date,date,[],extendedNow);
assert.equal(extended.engine,'aurum-v1.1');
assert.deepEqual(Array.from(extended.signals,r=>r.symbol),['LATE'],'New live engine is isolated from old engine rows');
assert.throws(()=>foldAurum([doc(date,'SNAPSHOT',{engine:'aurum-v1.1',signals:[{...late,signal_time:'11:35'}]})],date,date,[],at(date+'T12:00:00')),/Invalid Aurum signal/);
assert.equal(foldAurum([doc(date,'SNAPSHOT',{engine:'aurum-v1.1',signals:[late]})],date,date,[],at(date+'T11:29:00')).signals.length,0);

const proxy = load('proxy.ts', {'next/server': {NextResponse}, '@/utils/auth': auth}).proxy;
assert.equal((await proxy(request('/api/aurum'))).headers.get('Cache-Control'), null, 'Proxy preserves Aurum private TTL');
assert.equal((await proxy(request('/api/nifty-signals'))).headers.get('Cache-Control'), 'private, no-store', 'Existing unrelated proxy policy remains');
authenticated = false; assert.equal((await proxy(request('/api/aurum'))).status, 401); assert.equal((await proxy(request('/aurum'))).status, 307); authenticated = true;

const manifest = JSON.parse(fs.readFileSync('data/aurum/manifest.json', 'utf8'));
let feedReads = 0, fileReads = 0, readOverride;
const route = load('app/api/aurum/route.ts', {
  'next/server': {NextResponse}, 'node:fs/promises': {readFile: async (...args) => {fileReads++; return readOverride === undefined ? fsp.readFile(...args) : readOverride;}},
  'node:path': path, '@/utils/auth': auth, '@/utils/sessionPolling': {istSessionDate: () => date},
  '@/utils/aurumFeed': {foldAurum, readAurumFeed: async () => {feedReads++; return [doc(date, 'HEALTH', {status: 'READY'})];}}, '@/data/aurum/manifest.json': manifest,
}, {process: {cwd: () => process.cwd()}});
assert.equal(route.maxDuration, 30);
authenticated = false;
const denied = await route.GET(request('/api/aurum?date=2026-10-27'));
assert.equal(denied.status, 401); assert.equal(denied.headers.get('Cache-Control'), 'private, no-store');
assert.equal(fileReads, 0); assert.equal(feedReads, 0, 'Unauthenticated requests do no upstream or history work');
authenticated = true;
for (const invalid of ['2026-11-03', '2026-02-30', '2026-1-02', '../secret']) {
  const reply = await route.GET(request('/api/aurum?date=' + encodeURIComponent(invalid)));
  assert.equal(reply.status, 400); assert.equal(reply.headers.get('Cache-Control'), 'private, no-store');
}
const saved = await route.GET(request('/api/aurum?date=2026-10-27'));
assert.equal(saved.status, 200); assert.equal(saved.body.date, '2026-10-27'); assert.equal(saved.body.mode, 'historical');
assert.equal(saved.headers.get('Cache-Control'), 'private, max-age=3600, stale-while-revalidate=86400');
assert.equal(feedReads, 0, 'Shipped history never queries ORDS');
assert.ok(saved.body.signals.some(row => row.view === 'CE OI Surge'), 'Extra Rusty flow categories survive the API');
const unavailable = await route.GET(request('/api/aurum?date=2026-10-19'));
assert.equal(unavailable.status, 200); assert.equal(unavailable.body.status, 'UNAVAILABLE'); assert.equal(unavailable.body.signals.length, 0);
const emptyDate = manifest.dates.find(session => JSON.parse(fs.readFileSync(`data/aurum/${session}.json`, 'utf8')).signals.length === 0 && session !== '2026-10-19');
assert.ok(emptyDate, 'Archive includes a valid zero-signal session');
const empty = await route.GET(request('/api/aurum?date=' + emptyDate));
assert.equal(empty.status, 200); assert.equal(empty.body.status, 'READY'); assert.equal(empty.body.signals.length, 0, 'No trades remains a successful history result');
const latest = await route.GET(request('/api/aurum?date=' + date));
assert.equal(latest.status, 200); assert.equal(latest.body.date, date); assert.equal(latest.headers.get('Cache-Control'), 'private, max-age=60, stale-while-revalidate=60');
readOverride = JSON.stringify({date: '2026-10-28', source: 'aurum', mode: 'historical'});
assert.equal((await route.GET(request('/api/aurum?date=2026-10-27'))).status, 503, 'Wrong archive date fails closed');
readOverride = 'x'.repeat(128 * 1024 + 1);
const oversized = await route.GET(request('/api/aurum?date=2026-10-27'));
assert.equal(oversized.status, 503); assert.equal(oversized.headers.get('Cache-Control'), 'private, no-store');

const nextConfig = load('next.config.ts').default;
assert.ok(nextConfig.outputFileTracingIncludes['/api/aurum'].includes('./data/aurum/*.json'));
assert.ok(nextConfig.outputFileTracingIncludes['/api/pallas'].includes('./data/pallas/*.json'), 'Existing history tracing preserved');
console.log('PASS: Aurum auth/private caching, upstream source/date filters, shared OAuth and requests, byte/row/page budgets, health-safe folding, causal timestamps, archive coverage and tracing.');
