import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync('app/sector/' + p, 'utf8');
const decode = (p) => {
  const src = read(p);
  const exports = {};
  vm.runInNewContext(src.replace(/export default /, 'exports.default = '), { exports });
  return exports.default;
};

const template = decode('workspaceTemplate.ts');
const runtime = decode('workspaceRuntime.ts');
const fields = [
  'sector', 'symbol', 'direction', 'classification', 'ce_pct', 'pe_pct', 'move_pct', 'price', 'oi_bias',
  'pdh_pdl_broken', 'pdh_pdl_break_time', 'rusty_level_source', 'ob_state', 'ob_broken_time', 'ob_retest_breakout_time',
  'rfac', 'curr_rfac', 'signed_rfac', 'stale', 'o20', 'peak_cut',
];
const elements = new Map();
const listeners = {};
const timers = new Map();
let seq = 0, calls = 0, fail = false;
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, {
      value: id === 'sectorSort' ? 'net' : id === 'side' ? 'ALL' : '',
      checked: false,
      innerHTML: '',
      textContent: '',
      addEventListener() {},
    });
  }
  return elements.get(id);
};
const document = {
  hidden: false,
  getElementById: element,
  querySelector: () => element('thead'),
  addEventListener: (n, f) => { listeners[n] = f; },
};
const payload = {
  cuts: ['09:55', '10:00'],
  snapshots: [{
    source: 'rusty',
    cut: '10:00',
    bull: [{
      s: 'A', flow_type: 'CE_DOWN_PE_UP', flow_label: 'CE OI Down + PE OI Up',
      ce_pct: -2, pe_pct: 3, oi_bias: 5, ls: 'OR', brk: false, c_close: 105, mv: 2.1,
      rfac: 2.4, rfac_c: 2.2, rfac_s: 'BULL', rfac_o20: 100, rfac_d: 2.1, rfac_pk: '10:00',
    }],
    bear: [{
      s: 'B', flow_type: 'CE_UP_PE_DOWN', flow_label: 'CE OI Up + PE OI Down',
      ce_pct: 4, pe_pct: -3, oi_bias: 7, ls: 'PDL', brk: true, bt: '09:55', c_close: 95, mv: -1.8,
      rfac: 1.6, rfac_c: 0.9, rfac_s: 'BEAR', rfac_o20: 100, rfac_d: 3.1, rfac_pk: '09:45',
    }],
  }],
};
const context = vm.createContext({
  console, Date, AbortController, document,
  window: { addEventListener() {}, top: { location: {} } },
  localStorage: { getItem() {}, setItem() {} },
  setTimeout: (f, ms) => { timers.set(++seq, { f, ms }); return seq; },
  clearTimeout: (id) => timers.delete(id),
  fetch: async () => { calls++; return { ok: !fail, status: 503, json: async () => payload }; },
});
const run = (s) => vm.runInContext(s, context);
const scriptBody = template
  .replace(
    '/*__PAYLOAD__*/',
    `const META=${JSON.stringify({ date: '2026-10-23', fields, dates: [], baselineThrough: '2026-10-22' })};const MEMBERS={TEST:['A','B']};const BASELINE={};${runtime}`,
  )
  .match(/<script>([\s\S]*)<\/script>/)[1];

run(scriptBody);
await run("session(date,'','TEST')");
assert.equal(run('visible.length'), 2);
assert.equal(run('visible[0].symbol'), 'A', 'Sorted by R.Fac descending');
assert.equal(run('visible[0].rfac'), 2.4);
assert.equal(run('visible[1].stale'), 1, 'B pulled back >=0.5 R.Fac from peak >=1.2 -> stale');
assert.equal(run('visible[0].pdh_pdl_broken'), 'YES');
assert(element('stocks').innerHTML.includes('A'));
assert(element('stocks').innerHTML.includes('STALE'));
// Net R.Fac for TEST: (+2.4 + -1.6) / 2 = +0.40
assert(element('towerChart').innerHTML.includes('+0.40'));
assert.equal(element('towerStamp').textContent, '2026-10-23 · 10:00 IST');

// Unavailable sector renders cleanly without NaN
const originalRows = run('JSON.stringify(rows)');
run("rows=[{sector:'TEST',direction:'UNAVAILABLE',rfac:''}];renderTowers()");
assert(element('towerChart').innerHTML.includes('TEST: unavailable'));
run(`rows=${originalRows};renderTowers()`);

// Stale retention on transient error
fail = true;
await run("session(date,'','TEST',true)");
assert.equal(run('visible.length'), 2);
assert(element('feedStatus').textContent.includes('stale'));
fail = false;

// Polling, visibility, and focus-storm guards
run('live=false;schedule()');
assert.equal(timers.size, 0);
run('date=istSessionDate();live=true;schedule()');
assert(timers.size <= 1);
document.hidden = true;
listeners.visibilitychange();
assert.equal(timers.size, 0);
const before = calls;
document.hidden = false;
for (let i = 0; i < 10; i++) listeners.visibilitychange();
assert.equal(calls, before);
assert(timers.size <= 1);

assert(!template.includes('PACK['));
assert(!template.includes('router.refresh'));
assert(template.includes('cache.size>8'));
assert(template.includes('data-add='));
assert(template.includes('SECTOR_ADD_WATCHLIST'));
assert(!read('workspace/route.ts').includes('.reduce('));
assert(read('workspace/route.ts').includes('htmlCache.size>4'));
assert(read('workspace/route.ts').includes('filter(d=>d<date)'));
assert(read('workspace/route.ts').includes('requireApiSession'));
console.log('PASS: R.Fac Sector Scope renders towers (+0.40 Net R.Fac), sorts by R.Fac, detects STALE, preserves stale retention, bounded cache, hidden/history/focus guards.');
