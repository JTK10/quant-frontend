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
assert.equal(closed.stale,false,'closed session has no active capture warning');
assert.equal(foldIrbis([snapshot],date,at('10:28')).stale,true,'10:15 is no longer the final live cut');
assert.equal(foldIrbis([snapshot],date,at('10:28'),'10:15').stale,false,'user-selected cutoff freezes that board');
const final = {...snapshot,Doc_ID:'final-1100',Cut:'11:00',
  Issued_At:`${date}T11:01:00+05:30`,Available_At:`${date}T11:01:00+05:30`,
  Candidates:[{...candidate,price:2400}]};
assert.equal(foldIrbis([snapshot,final],date,at('11:00')).cut,'10:15','future issue must not leak');
const throughEleven = foldIrbis([snapshot,final],date,at('11:02'));
assert.equal(throughEleven.cut,'11:00');
assert.equal(throughEleven.candidates[0].price,2400);
assert.match(throughEleven.status,/Final selected rank/);
assert.equal(foldIrbis([snapshot,final],date,at('11:02'),'10:15').cut,'10:15','cutoff filters decision time, preserving delayed captures');

const failedHealth = {...health,State:'ERROR',Reason:'OI capture delayed'};
const failed = foldIrbis([snapshot,failedHealth],date,at('10:28'));
assert.equal(failed.state,'ERROR');
assert.equal(failed.status,'OI capture delayed');
assert.equal(failed.candidates.length,1,'health error preserves latest rank');
assert.equal(foldIrbis([{...snapshot,sig_date:'20261008'},health],date,at('10:28')).candidates.length,0);
assert.equal(foldIrbis([snapshot,health],date,at('10:24')).state,'READY',
  'future health must not leak into an earlier replay cut');
console.log('Irbis causal cut, date isolation, final rank, and separate health checks passed');
