import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const exports = {};
  const localRequire = createRequire(new URL('../' + path, import.meta.url));
  const requireSource = (name) => (name in dependencies ? dependencies[name] : localRequire(name));
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: requireSource, console, URL, URLSearchParams, Intl, Date, Map, Set });
  return exports;
}

const k = load('utils/kairos.ts');
assert.equal(k.resolveKairosEngine('kairos_cr'), 'kairos_cr');
assert.equal(k.kairosSource({ source: 'kairos_cr' }), 'kairos_cr');
assert.equal(k.kairosSource({ cap: 'KAIROS_CR' }), 'kairos_cr');
assert.equal(k.resolveKairosEngine(undefined), 'kairos10');

const { normalizePantherSignals } = load('utils/backend.ts', {
  './tradingCharts': load('utils/tradingCharts.ts'),
});
const e1 = {
  source: 'kairos_cr', cap: 'KAIROS_CR', kind: 'ENTRY', signal_id: 'cr_1', name: 'SBIN 800 CE',
  ts: 100, time: '09:20:00', mode: 'paper', side: 'LONG', expiry: '2026-12-29', dte: 36,
  entry: 20.2, entry_fill: 20.2, quantity: 750, lots: 1, lot_size: 750, capital_used: 15150,
  stop_premium: 14.0, stop_pct: -30, cr_tier: 1, cr_lane: 'MA2_5D_TRAP_UNW', cr_score: 21.0, cr_state: 'OPEN',
  fill_mode: 'LIVE_ASK', gross_pnl: 0, charges: 0, pnl: 0,
};
const m1 = { ...e1, kind: 'MTM', ts: 200, time: '09:30:00', entry: 27.0, cr_state: 'BE_ARMED', stop_premium: 21.0, stop_pct: 5, peak_ltp: 27.2, peak_gain_pct: 36.0, pnl: 5010, gross_pnl: 5100, charges: 90 };
const e2 = { ...e1, signal_id: 'cr_2', name: 'TITAN 3500 CE', ts: 101, entry: 80.0, entry_fill: 80.0, quantity: 175, capital_used: 14000 };
const x2 = { ...e2, kind: 'EXIT', ts: 300, time: '11:05:00', entry: 105.0, reason: 'TRAILING_STOP', charges: 85, gross_pnl: 4375, pnl: 4290 };
const h1 = { source: 'kairos_cr', cap: 'KAIROS_CR', kind: 'HEALTH', ts: 310, status: 'Monitoring 1 open (2/3 slots)', expiry: '2026-12-29', dte: 36, slots_used: 2, max_trades: 3, breaker_hit: false, last_cut: '11:05' };

const norm = normalizePantherSignals([e1, m1, e2, x2, h1, { ...e1, source: 'kairos10', cap: 'KAIROS10', kind: 'MTM', ts: 400, pnl: 99999 }]);
assert.equal(norm[1].cr_state, 'BE_ARMED');
assert.equal(norm[1].charges, 90);
assert.equal(norm[4].slots_used, 2);

const compact = k.compactKairosEvents(norm, 'kairos_cr');
const sum = k.kairosSummary(compact, 'kairos_cr');
assert.equal(sum.open.length, 1);
assert.equal(sum.closed.length, 1);
assert.equal(sum.unrealized, 5010);
assert.equal(sum.realized, 4290);
assert.equal(k.kairosSummary(norm, 'kairos10').unrealized, 0);

// Verify stale preservation & date rollover reset
let st = k.updateKairosFeed(null, { key: 'kairos_cr|2026-11-23', asOf: 1, events: compact, error: null }, 'kairos_cr');
st = k.updateKairosFeed(st, { key: st.key, asOf: 2, events: [], error: 'Temporary error' }, 'kairos_cr');
assert.equal(st.events.length, compact.length);
st = k.updateKairosFeed(st, { key: 'kairos_cr|2026-11-24', asOf: 3, events: [], error: null }, 'kairos_cr');
assert.equal(st.events.length, 0);

// Verify page rendering: REPLAY (< 2026-11-23) makes 0 API calls; LIVE (>= 2026-11-23) queries sources=kairos_cr
const css = { './kairos.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) } };
const replayMod = load('app/kairos/Kairos29Replay.tsx', css);
const paperView = load('app/kairos/KairosClient.tsx', { ...css, '@/utils/kairos': k });
const feedReads = [];
const { default: KairosPage } = load('app/kairos/page.tsx', {
  ...css,
  './Kairos29Replay': replayMod,
  './KairosClient': paperView,
  'next/link': () => null,
  '@/utils/kairos': k,
  '@/components/Controls': { DatePicker: () => null, AutoRefresh: () => 'Refresh mounted' },
  '@/utils/date': { resolveDate: async (sp) => (await sp).date },
  '@/utils/internalApi': {
    getInternalApiUrl: async (p) => p,
    fetchInternalApi: async (u) => {
      feedReads.push(u);
      return { ok: true, json: async () => [e1, m1, e2, x2, h1] };
    },
  },
});

const render = async (date) => renderToStaticMarkup(await KairosPage({ searchParams: { engine: 'kairos_cr', date } }));
const histNov20 = await render('2026-11-20');
assert.match(histNov20, /Historical option-LTP replay/);
assert.match(histNov20, /INDUSINDBK/);
assert.match(histNov20, /REPLAY/);
assert.doesNotMatch(histNov20, /Refresh mounted/);
assert.match(await render('2026-09-05'), /No Clean-Runner replay data/);
assert.deepEqual(feedReads, []);

const liveNov23 = await render('2026-11-23');
assert.deepEqual(feedReads, ['/api/panther-signals?date=2026-11-23&sources=kairos_cr']);
assert.match(liveNov23, /Clean Runner Bot/);
assert.match(liveNov23, /Refresh mounted/);
assert.match(liveNov23, /SBIN 800 CE/);
assert.match(liveNov23, /BE_ARMED/);
assert.match(liveNov23, /TITAN 3500 CE/);
assert.match(liveNov23, /DAILY SLOTS/);
assert.match(liveNov23, /2 \/ 3/);

const route = fs.readFileSync('app/api/panther-signals/route.ts', 'utf8');
assert.match(route, /source === "kairos_cr"/);
console.log('Kairos Clean Runner (kairos_cr) isolation, accounting, replay, live rendering and cache checks passed.');
