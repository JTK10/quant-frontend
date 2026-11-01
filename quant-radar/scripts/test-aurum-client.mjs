import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {renderToStaticMarkup} from 'react-dom/server';

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const policyExports = {};
vm.runInNewContext(compile('utils/sessionPolling.ts'), {exports: policyExports, Intl, Date});
const feedExports = {};
vm.runInNewContext(compile('app/aurum/feed.ts'), {exports: feedExports, require: name => {
  assert.equal(name, '@/utils/sessionPolling'); return policyExports;
}, AbortController, DOMException, Date, Error});
const {createAurumFeed, AURUM_POLL_MS, aurumPollingDelay} = feedExports;
const {preserveAurumBoard, aurumRowsAtCut, AURUM_CUTS} = feedExports;
const at = time => Date.parse(time + '+05:30');
const flush = async () => {for (let i = 0; i < 10; i++) await Promise.resolve();};

function harness(start, {live = true, date = policyExports.istSessionDate(start), pending = false} = {}) {
  let now = start, hidden = false, nextId = 1, fault = false;
  const timers = new Map(), requests = [], data = [], errors = [], resets = [];
  let resolveRead;
  const feed = createAurumFeed({date, live, now: () => now, hidden: () => hidden,
    setTimer: (fn, ms) => {const id = nextId++; timers.set(id, {fn, at: now + ms}); return id;},
    clearTimer: id => timers.delete(id),
    read: async (session, signal) => {
      requests.push({date: session, signal});
      if (pending) await new Promise(resolve => {resolveRead = resolve;});
      if (fault) throw new Error('temporary feed failure');
      return {date: session, signals: [{symbol: 'TEST'}], status: 'READY'};
    }, onReset: value => resets.push(value), onData: value => data.push(value), onError: value => errors.push(value), onSettled: () => {},
  });
  return {feed, timers, requests, data, errors, resets,
    fail: value => {fault = value;}, finish: async () => {resolveRead?.(); await flush();},
    focus: async value => {hidden = value; feed.visibility(); await flush();},
    advance: async ms => {
      const end = now + ms; let steps = 0;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        assert.ok(++steps < 10000, 'bounded local timers');
        const [id, timer] = next; now = timer.at; timers.delete(id); timer.fn(); await flush();
      }
      now = end; await flush();
    },
  };
}

assert.equal(AURUM_POLL_MS, 300000);
assert.equal(aurumPollingDelay('2026-10-30', at('2026-10-30T09:13:00')), null);
assert.equal(aurumPollingDelay('2026-10-30', at('2026-10-30T09:14:00')), 300000);
assert.equal(aurumPollingDelay('2026-10-30', at('2026-10-30T11:40:00')), 300000);
assert.equal(aurumPollingDelay('2026-10-30', at('2026-10-30T11:41:00')), null);
const successful = {date: '2026-10-30', status: 'READY', asof: '10:00', signals: [{symbol: 'KEPT'}]};
const heartbeat = {date: '2026-10-30', status: 'PENDING', signals: []};
const preserved = preserveAurumBoard(successful, heartbeat);
assert.equal(preserved.signals[0].symbol, 'KEPT', 'Health-only response cannot erase same-session signals');
assert.equal(preserved.stale, true);
assert.equal(preserved.asof, '10:00');
assert.equal(preserveAurumBoard(successful, {...heartbeat, date: '2026-11-02'}).signals.length, 0, 'Never carry signals across session dates');
assert.equal(preserveAurumBoard(successful, {...heartbeat, status: 'EMPTY'}).signals.length, 0, 'Explicit successful empty snapshot remains supported');
for (const config of [{start: at('2026-10-30T10:00:00'), live: false, date: '2026-10-29'}, {start: at('2026-10-31T10:00:00')}]) {
  const h = harness(config.start, config); await flush();
  assert.equal(h.requests.length, 1);
  await h.advance(3600000); await h.focus(true); await h.focus(false);
  assert.equal(h.requests.length, 1, 'Historical/weekend data loads once and ignores focus');
  h.feed.stop(); assert.equal(h.timers.size, 0);
}

const live = harness(at('2026-10-30T10:00:00')); await flush();
await live.advance(299999); assert.equal(live.requests.length, 1);
await live.advance(1); assert.equal(live.requests.length, 2, 'Five-minute cadence');
await live.focus(true); const before = live.requests.length;
await live.advance(1200000); assert.equal(live.requests.length, before, 'Hidden tab does not poll');
await live.focus(false); await live.focus(true); await live.focus(false); await live.focus(true); await live.focus(false);
assert.equal(live.requests.length, before + 1, 'Focus storms produce one eligible request');
assert.equal(live.timers.size, 1, 'One network/clock timer');
live.fail(true); await live.advance(300000);
assert.equal(live.errors.at(-1), 'temporary feed failure');
assert.ok(live.data.length > 0, 'Successful same-date data remains available on error');
assert.equal(live.resets.length, 0, 'Failure does not clear a board');
live.feed.stop(); assert.equal(live.timers.size, 0);

const blocked = harness(at('2026-10-30T10:00:00'), {pending: true}); await flush();
await blocked.focus(true); await blocked.focus(false); await blocked.focus(true); await blocked.focus(false);
assert.equal(blocked.requests.length, 1, 'Only one request in flight');
blocked.feed.stop(); assert.equal(blocked.requests[0].signal.aborted, true, 'Cleanup aborts its request');
await blocked.finish(); assert.equal(blocked.data.length, 0, 'Unmounted request cannot publish');

const rollover = harness(at('2026-10-30T23:59:00')); await flush();
await rollover.advance(300000);
assert.equal(rollover.resets.at(-1), '2026-10-31', 'IST date rollover clears the old board');
assert.equal(rollover.requests.at(-1).date, '2026-10-31');
const weekendCount = rollover.requests.length; await rollover.advance(3600000);
assert.equal(rollover.requests.length, weekendCount, 'New weekend board loads only once');
rollover.feed.stop();

const close = harness(at('2026-10-30T11:39:50')); await flush();
await close.advance(300000); assert.equal(close.requests.length, 1, 'Scanner close transition stops network checks');
await close.advance(3600000); await close.focus(true); await close.focus(false);
assert.equal(close.requests.length, 1, 'Finished morning board does not poll or refetch on focus');
close.feed.stop();
const opening = harness(at('2026-10-29T09:00:00')); await flush();
await opening.advance(13 * 60000); assert.equal(opening.requests.length, 1, 'Pre-window loads once');
await opening.advance(2 * 60000); assert.equal(opening.requests.length, 2, 'Local clock starts network checks in the next morning window');
await opening.advance(26 * 3600000);
assert.ok(opening.resets.includes('2026-10-30'), 'Next weekday rolls the session using the local clock');
assert.ok(opening.requests.filter(row => row.date === '2026-10-30').length > 1, 'Next morning resumes five-minute checks');
assert.ok(opening.requests.filter(row => row.date === '2026-10-30').length <= 33, 'No overnight API loop');
opening.feed.stop();

// Render the actual desk with an existing frozen day. Flow labels outside the five
// Rusty headline views remain visible and filterable rather than being discarded.
const require = createRequire(import.meta.url);
const fixture = {date: '2026-10-27', mode: 'historical', status: 'READY', asof: '2026-10-27T10:25:00+05:30', signals: [
  {symbol: 'HAL', view: 'CE OI Surge', pullback_confirmed: false},
  {symbol: 'PGEL', view: 'PE OI Rising', pullback_confirmed: true},
  {symbol: 'HINDPETRO', view: 'PE OI Declining', pullback_confirmed: false},
  {symbol: 'SUZLON', view: 'Both Legs OI Rising (Flat)', pullback_confirmed: true},
  {symbol: 'SHRIRAMFIN', view: 'Neutral Flow', pullback_confirmed: true},
].map((row, i) => ({id: 'fixture-' + i, side: 'BULL', signal_time: '10:00', entry_time: '10:00', entry: 100,
  reference_price: 99.9, ce_pct: 5.3, pe_pct: 10.2, oi_bias: 4.9, bar_rvol: 2.5, cum_rvol: 1.7, ...row}))};
const source = ts.transpileModule(fs.readFileSync('app/aurum/AurumClient.tsx', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
function render(overrides = {}) {
  let index = 0;
  const values = {0: 'history', 1: fixture.date, 2: fixture, 3: '', 4: false, ...overrides};
  const exports = {};
  vm.runInNewContext(source, {exports, Date, Intl, URLSearchParams, console, require: name => {
    if (name === 'react') return {useState: initial => {const slot = index++; return [slot in values ? values[slot] : typeof initial === 'function' ? initial() : initial, () => {}];}, useEffect: () => {}, useMemo: fn => fn()};
    if (name === '@/utils/backend') return {buildTradingViewUrl: symbol => 'https://www.tradingview.com/chart/?symbol=NSE:' + symbol};
    if (name === '@/utils/chartWatchlist') return {};
    if (name === '@/utils/sessionPolling') return policyExports;
    if (name === './feed') return feedExports;
    if (name.endsWith('.css')) return {};
    return require(name);
  }});
  return renderToStaticMarkup(exports.default({initialDate: fixture.date}));
}
const html = render();
for (const label of ['PE OI Rising', 'CE OI Surge', 'PE OI Declining', 'Both Legs OI Rising (Flat)', 'Neutral Flow']) assert.ok(html.includes(label), label + ' survives the all-flow view');
assert.ok(html.includes('HAL') && html.includes('PGEL'), 'Default desk preserves all locked v1 signals');
assert.ok(html.includes('Add PGEL to Charts watchlist'));
assert.ok(html.includes('Open PGEL on TradingView'));
assert.ok(html.includes('CE %') && html.includes('PE %') && html.includes('OI bias'));
const onlySurge = render({6: 'CE OI Surge'});
assert.ok(onlySurge.includes('Add HAL to Charts watchlist'));
assert.ok(!onlySurge.includes('Add PGEL to Charts watchlist'), 'All available flows can be filtered locally');
const onlyPullback = render({7: true});
assert.ok(!onlyPullback.includes('Add HAL to Charts watchlist'));
assert.ok(onlyPullback.includes('Add PGEL to Charts watchlist'), 'Optional pullback gate is off by default and works locally');
const recovered = render({2: {...fixture, mode: 'live', signals: fixture.signals.map(row => ({...row, recovered: true, issued_at: '2026-10-27T11:00:00+05:30'}))}});
assert.ok(recovered.includes('Recovered'));
assert.ok(recovered.includes('not issued live at the signal time'), 'Recovered captures cannot masquerade as live issued signals');

console.log('Aurum client: history/weekend, five-minute cadence, visibility/focus, one in-flight, stale board, IST rollover, close transition, cleanup and actual all-flow desk rendering passed.');

const replay={date:'2026-10-27',status:'READY',mode:'historical',signals:[{symbol:'EARLY',signal_time:'09:35'},{symbol:'LATER',signal_time:'10:05'}]};
assert.deepEqual(Array.from(aurumRowsAtCut(replay,'10:00'),r=>r.symbol),['EARLY']);
assert.equal(aurumRowsAtCut(replay,'10:05').length,2);
assert.equal(aurumRowsAtCut(replay,'latest').length,2);
assert.equal(aurumRowsAtCut(replay,'11:31').length,0);
assert.equal(AURUM_CUTS.at(-1),'11:30');
const recorded={...replay,mode:'live',signals:[{symbol:'DELAYED',signal_time:'10:00',issued_at:'2026-10-27T10:00:02+05:30'}]};
assert.equal(aurumRowsAtCut(recorded,'10:00').length,0);
assert.equal(aurumRowsAtCut(recorded,'10:05').length,1);
console.log('PASS: local cutoff rewind, cumulative signals and actual receipt boundaries.');
