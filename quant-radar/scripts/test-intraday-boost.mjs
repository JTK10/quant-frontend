import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// 1. Test utils/rfac.ts (causal denom + monotonic running peak + 09:20 anchor + native pass-through)
const rfacExports = {};
const mockSeed = {
  schema_version: 1,
  window: 32,
  symbols: {
    HDFCBANK: Object.fromEntries(
      Array.from({ length: 35 }, (_, i) => [
        `2026-10-${String(i + 1).padStart(2, '0')}`,
        1000 + (i % 2 === 0 ? 0 : 10), // every daily |ΔClose| = 10.0 exactly!
      ]),
    ),
  },
};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('utils/rfac.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  {
    exports: rfacExports,
    Map, Set, Math, Object, Array, Number, String,
    require: (name) => (name === '@/data/rfac-seed.json' ? mockSeed : {}),
  },
);

const { causalRfacDenom, enrichRustySessionRfac } = rfacExports;
assert.equal(causalRfacDenom('HDFCBANK', '2026-11-23'), 10);
assert.equal(causalRfacDenom('UNKNOWN', '2026-11-23'), null);

const snaps = [
  { cut: '09:20', bull: [{ s: 'HDFCBANK', c_time: '09:15', c_open: 1005, c_close: 1000 }], bear: [] },
  { cut: '09:25', bull: [{ s: 'HDFCBANK', c_time: '09:20', c_open: 1000, c_close: 1015 }], bear: [] }, // |1015-1000|/10 = 1.50
  { cut: '09:30', bull: [{ s: 'HDFCBANK', c_time: '09:25', c_open: 1015, c_close: 1005 }], bear: [] }, // reversed: peak stays 1.50, curr=0.50!
  { cut: '09:35', bull: [], bear: [{ s: 'HDFCBANK', c_time: '09:30', c_open: 1005, c_close: 980 }] }, // breaks down: |980-1000|/10 = 2.00 BEAR!
];
enrichRustySessionRfac(snaps, '2026-11-23');
assert.equal(snaps[0].bull[0].rfac, undefined, 'Before 09:20 bar closes, R.Fac is not yet anchored');
assert.equal(snaps[1].bull[0].rfac, 1.5);
assert.equal(snaps[1].bull[0].rfac_s, 'BULL');
assert.equal(snaps[2].bull[0].rfac, 1.5, 'R.Fac is monotonic non-decreasing');
assert.equal(snaps[2].bull[0].rfac_c, 0.5, 'Curr R.Fac drops on pullback');
assert.equal(snaps[3].bear[0].rfac, 2.0);
assert.equal(snaps[3].bear[0].rfac_s, 'BEAR');

// 2. Test utils/rfacSector.ts (Bulls & Bears separation + Net R.Fac Sector Scope + Stale detection)
const secExports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('utils/rfacSector.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  {
    exports: secExports,
    Map, Set, Math, Object, Array, Number, String,
    require: () => ({}),
  },
);
const { buildRfacSectorScope } = secExports;
const board = buildRfacSectorScope(
  {
    cut: '14:30',
    bull: [
      { s: 'A', rfac: 3.0, rfac_c: 2.9, rfac_s: 'BULL', rfac_o20: 100, c_close: 110, mv: 3.0 },
      { s: 'B', rfac: 1.8, rfac_c: 1.0, rfac_s: 'BULL', rfac_o20: 100, c_close: 103, mv: 0.8 }, // stale
    ],
    bear: [
      { s: 'C', rfac: 2.0, rfac_c: 2.0, rfac_s: 'BEAR', rfac_o20: 200, c_close: 190, mv: -2.5 },
    ],
  },
  { BULLSEC: ['A', 'B'], MIXED: ['B', 'C'], BEARSEC: ['C'] },
);

assert.equal(board.bulls.length, 2);
assert.equal(board.bears.length, 1);
assert.equal(board.bulls[0].symbol, 'A');
assert.equal(board.bulls[1].stale, true);
assert.equal(board.sectors[0].sec, 'BULLSEC');
assert.equal(board.sectors[0].netRfac, 2.4); // (3.0 + 1.8)/2
assert.equal(board.sectors.at(-1).sec, 'BEARSEC');
assert.equal(board.sectors.at(-1).netRfac, -2.0);
const mixed = board.sectors.find((s) => s.sec === 'MIXED');
assert.equal(Number(mixed.netRfac.toFixed(2)), -0.1); // (+1.8 - 2.0)/2 = -0.1

// 3. Static checks: Intraday Boost page reuses RustyFeed (5m sessionPolling + visibility) & nav link exists
const ibPage = fs.readFileSync('app/intraday-boost/page.tsx', 'utf8');
const ibClient = fs.readFileSync('app/intraday-boost/IntradayBoostClient.tsx', 'utf8');
const nav = fs.readFileSync('components/NavSidebar.tsx', 'utf8');
assert(ibPage.includes('RustyFeed'));
assert(ibPage.includes('pagePath="/intraday-boost"'));
assert(ibClient.includes('buildRfacSectorScope'));
assert(ibClient.includes('INTRADAY BOOST'));
assert(ibClient.includes('SECTOR SCOPE'));
assert(!ibClient.includes('Mean 32d'));
assert(!ibClient.includes('32d causal daily-move denominator'));
assert(!ibClient.includes('9:20 → LTP'));
assert(!ibClient.includes('detailStock'));
assert(ibClient.includes('className="tv-link"'));
assert(!ibClient.includes('router.refresh'));
assert(nav.includes('/intraday-boost'));

console.log('PASS: R.Fac causal computation, monotonic high-water mark, Bull/Bear separation, R.Fac Sector Scope math, stale detection, and Intraday Boost polling reuse verified.');
