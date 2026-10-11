import assert from 'node:assert/strict';
import {foldIrbis} from '../utils/irbis.ts';

const date = '2026-10-09';
const at = hm => Date.parse(`${date}T${hm}:00+05:30`);
const candidate = {symbol:'TIINDIA',side:'BULL',setup:'TIINDIA',score:.14,
  base_rank:2,rank:1,price:2374.4,vwap:2346.9,ce_change_pct:-2.2,
  pe_change_pct:.2,confirmed:true,coverage:1};
const snapshot = {source:'irbis',sig_date:'20261009',kind:'SNAPSHOT',Doc_ID:'morning-final',
  Issued_At:`${date}T10:16:00+05:30`,Available_At:`${date}T10:16:00+05:30`,
  State:'READY',Cut:'10:15',Model_ID:'irbis-test',Candidates:[candidate],Total_Candidates:8};
const health = {source:'irbis',sig_date:'20261009',kind:'HEALTH',Doc_ID:'health-1',
  Issued_At:`${date}T10:25:00+05:30`,Available_At:`${date}T10:25:00+05:30`,
  State:'CLOSED',Cut:'HEALTH',Candidates:[]};

assert.equal(foldIrbis([snapshot,health],date,at('10:15')).candidates.length,0);
const beforeHealth = foldIrbis([snapshot,health],date,at('10:20'));
assert.equal(beforeHealth.state,'READY');
assert.deepEqual(beforeHealth.candidates.map(c => c.symbol),['TIINDIA']);
assert.equal(beforeHealth.total_candidates,8);
const closed = foldIrbis([health,snapshot],date,at('10:28'));
assert.equal(closed.state,'CLOSED');
assert.equal(closed.candidates.length,1,'later HEALTH must not replace SNAPSHOT candidates');
assert.equal(closed.stale,false,'completed 10:15 rank is final');

const failedHealth = {...health,State:'ERROR',Reason:'OI capture delayed'};
const failed = foldIrbis([snapshot,failedHealth],date,at('10:28'));
assert.equal(failed.state,'ERROR');
assert.equal(failed.status,'OI capture delayed');
assert.equal(failed.candidates.length,1,'health error preserves latest rank');
assert.equal(foldIrbis([{...snapshot,sig_date:'20261008'},health],date,at('10:28')).candidates.length,0);
assert.equal(foldIrbis([snapshot,health],date,at('10:24')).state,'READY',
  'future health must not leak into an earlier replay cut');
console.log('Irbis causal cut, date isolation, final rank, and separate health checks passed');
