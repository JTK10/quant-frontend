import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// 1. Test utils/rfac.ts (causal denom + monotonic running peak + 09:20 anchor + Clear-Sky 3D/5D + native cs_v=1 guard)
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
  hl: {
    HDFCBANK: {
      '2026-11-16': [1030, 970], // 5D high = 1030, 5D low = 970
      '2026-11-17': [1025, 975],
      '2026-11-18': [1010, 990], // last 3 days: hi3 = 1012, lo3 = 985
      '2026-11-19': [1012, 988],
      '2026-11-20': [1008, 985],
    },
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

const { causalRfacDenom, causalClearSkyLevels, enrichRustySessionRfac } = rfacExports;
assert.equal(causalRfacDenom('HDFCBANK', '2026-11-23'), 10);
assert.equal(causalRfacDenom('UNKNOWN', '2026-11-23'), null);
assert.deepEqual([...causalClearSkyLevels('HDFCBANK', '2026-11-23')], [1012, 1030, 985, 970]);

const snaps = [
  { cut: '09:20', bull: [{ s: 'HDFCBANK', c_time: '09:15', c_open: 1005, c_close: 1000 }], bear: [] },
  { cut: '09:25', bull: [{ s: 'HDFCBANK', c_time: '09:20', c_open: 1000, c_close: 1015 }], bear: [] }, // |1015-1000|/10 = 1.50, 1015 > hi3 (1012) -> cs_b=3
  { cut: '09:30', bull: [{ s: 'HDFCBANK', c_time: '09:25', c_open: 1015, c_close: 1035 }], bear: [] }, // 1035 > hi5 (1030) -> cs_b=5
  { cut: '09:35', bull: [{ s: 'HDFCBANK', c_time: '09:30', c_open: 1035, c_close: 1005 }], bear: [] }, // reversed: peak stays 3.50, curr=0.50, not clear!
  { cut: '09:40', bull: [], bear: [{ s: 'HDFCBANK', c_time: '09:35', c_open: 1005, c_close: 965 }] }, // breaks below lo5 (970) -> cs_s=5
];
enrichRustySessionRfac(snaps, '2026-11-23');
assert.equal(snaps[0].bull[0].rfac, undefined, 'Before 09:20 bar closes, R.Fac is not yet anchored');
assert.equal(snaps[1].bull[0].rfac, 1.5);
assert.equal(snaps[1].bull[0].rfac_s, 'BULL');
assert.equal(snaps[1].bull[0].cs_b, 3, '1015 > hi3 (1012) and <= hi5 (1030) must be cs_b=3');
assert.equal(snaps[2].bull[0].cs_b, 5, '1035 > hi5 (1030) must be cs_b=5');
assert.equal(snaps[3].bull[0].rfac, 3.5, 'R.Fac is monotonic non-decreasing');
assert.equal(snaps[3].bull[0].rfac_c, 0.5, 'Curr R.Fac drops on pullback');
assert.equal(snaps[3].bull[0].cs_b, undefined, '1005 <= hi3 must not carry stale Clear-Sky flag');
assert.equal(snaps[4].bear[0].rfac, 3.5);
assert.equal(snaps[4].bear[0].rfac_s, 'BEAR');
assert.equal(snaps[4].bear[0].cs_s, 5, '965 < lo5 (970) must be cs_s=5');

// Native VM2 cs_v=1 guard: future snapshot where VM2 already evaluated Clear-Sky=0 must NOT be overwritten by stale seed!
const nativeFuture = [
  { cut: '10:00', cs_v: 1, bull: [{ s: 'HDFCBANK', rfac: 1.5, rfac_c: 1.5, rfac_s: 'BULL', rfac_o20: 1000, c_close: 1050 }], bear: [] },
];
enrichRustySessionRfac(nativeFuture, '2026-11-27');
assert.equal(nativeFuture[0].bull[0].cs_b, undefined, 'cs_v=1 snapshots must trust VM2 Clear-Sky evaluation verbatim');

// 2. Real packaged data/rfac-seed.json regression checks (MARUTI Nov 19, INDUSINDBK Nov 20, POLICYBZR Nov 23)
const realSeed = JSON.parse(fs.readFileSync('data/rfac-seed.json', 'utf8'));
const realExports = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('utils/rfac.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText,
  {
    exports: realExports,
    Map, Set, Math, Object, Array, Number, String,
    require: (name) => (name === '@/data/rfac-seed.json' ? realSeed : {}),
  },
);
const maruti19 = realExports.causalClearSkyLevels('MARUTI', '2026-11-19');
assert(maruti19 && Math.abs(maruti19[0] - 12990) < 0.5 && Math.abs(maruti19[1] - 13215) < 0.5, `MARUTI Nov 19 levels: ${maruti19}`);
const indus20 = realExports.causalClearSkyLevels('INDUSINDBK', '2026-11-20');
assert(indus20 && Math.abs(indus20[0] - 932.4) < 0.5 && Math.abs(indus20[1] - 932.4) < 0.5, `INDUSINDBK Nov 20 levels: ${indus20}`);
const pb23 = realExports.causalClearSkyLevels('POLICYBZR', '2026-11-23');
assert(pb23 && Math.abs(pb23[0] - 1047.9) < 0.5, `POLICYBZR Nov 23 levels: ${pb23}`);

// 3. Test utils/rfacSector.ts (Bulls & Bears separation + Net R.Fac Sector Scope + Stale + Clear-Sky 3D/5D + Gap-up preservation)
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
      { s: 'A', rfac: 3.0, rfac_c: 2.9, rfac_s: 'BULL', rfac_o20: 100, c_close: 110, mv: 3.0, cs_b: 5, cs_l: [105, 108, 95, 92] },
      { s: 'B', rfac: 1.8, rfac_c: 1.0, rfac_s: 'BULL', rfac_o20: 100, c_close: 103, mv: 0.8, cs_b: 3, cs_l: [102, 106, 95, 92] }, // stale, 3D clear
    ],
    bear: [
      { s: 'C', rfac: 2.0, rfac_c: 2.0, rfac_s: 'BEAR', rfac_o20: 200, c_close: 190, mv: -2.5, cs_s: 5, cs_l: [210, 215, 195, 192] },
      // Gap-up stock trading above 5D High (cs_b=5) even though close < open_0920 (rfac_s=BEAR)
      { s: 'GAPUP', rfac: 0.6, rfac_c: 0.4, rfac_s: 'BEAR', rfac_o20: 150, c_close: 148, mv: 2.8, cs_b: 5, cs_l: [140, 144, 130, 128] },
    ],
  },
  { BULLSEC: ['A', 'B'], MIXED: ['B', 'C'], BEARSEC: ['C'] },
);

assert.equal(board.bulls.length, 2);
assert.equal(board.bears.length, 2);
assert.equal(board.all.length, 4);
assert.equal(board.bulls[0].symbol, 'A');
assert.equal(board.bulls[1].stale, true);
assert.equal(board.sectors[0].sec, 'BULLSEC');
assert.equal(board.sectors[0].netRfac, 2.4); // (3.0 + 1.8)/2
assert.equal(board.sectors.at(-1).sec, 'BEARSEC');
assert.equal(board.sectors.at(-1).netRfac, -2.0);
const mixed = board.sectors.find((s) => s.sec === 'MIXED');
assert.equal(Number(mixed.netRfac.toFixed(2)), -0.1); // (+1.8 - 2.0)/2 = -0.1

// Verify 3D filter strictly includes 5D stocks (clearBull >= 3) AND catches GAPUP via board.all!
const clearBull3Plus = Array.from(board.all).filter((r) => r.clearBull >= 3).map((r) => r.symbol).sort();
assert.deepEqual(clearBull3Plus, ['A', 'B', 'GAPUP'], 'Clear 3D+ must include 5D stocks AND gap-up stocks above 3D/5D high');
const clearBull5Only = Array.from(board.all).filter((r) => r.clearBull >= 5).map((r) => r.symbol).sort();
assert.deepEqual(clearBull5Only, ['A', 'GAPUP'], 'Clear 5D Only must return only 5D stocks');
const clearBear3Plus = Array.from(board.all).filter((r) => r.clearBear >= 3).map((r) => r.symbol);
assert.deepEqual(clearBear3Plus, ['C'], 'Clear 3D+ Bear must include 5D bear stocks');

// 4. Static checks: Intraday Boost page reuses RustyFeed (5m sessionPolling + visibility), Clear-Sky UI exists & nav link exists
const ibPage = fs.readFileSync('app/intraday-boost/page.tsx', 'utf8');
const ibClient = fs.readFileSync('app/intraday-boost/IntradayBoostClient.tsx', 'utf8');
const nav = fs.readFileSync('components/NavSidebar.tsx', 'utf8');
assert(ibPage.includes('RustyFeed'));
assert(ibPage.includes('pagePath="/intraday-boost"'));
assert(ibClient.includes('buildRfacSectorScope'));
assert(ibClient.includes('INTRADAY BOOST'));
assert(ibClient.includes('SECTOR SCOPE'));
assert(ibClient.includes('Clear 3D+ (incl. 5D)'));
assert(ibClient.includes('5D CLEAR'));
assert(ibClient.includes('3D CLEAR'));
assert(ibClient.includes('board.all'));
assert(!ibClient.includes('Mean 32d'));
assert(!ibClient.includes('32d causal daily-move denominator'));
assert(!ibClient.includes('9:20 → LTP'));
assert(!ibClient.includes('detailStock'));
assert(ibClient.includes('className="tv-link"'));
assert(!ibClient.includes('router.refresh'));
assert(nav.includes('/intraday-boost'));

console.log('PASS: R.Fac causal computation, Clear-Sky 3D/5D (5D included in 3D+, gap-up safe, cs_v=1 guard, MARUTI/INDUSINDBK/POLICYBZR), Bull/Bear separation, R.Fac Sector Scope math, and Intraday Boost polling reuse verified.');
