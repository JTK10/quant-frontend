import assert from 'node:assert/strict';
import fs from 'node:fs';
import {foldPallas} from '../utils/pallas.ts';
import {pallasSessionDate,pallasSessionRollover} from '../utils/pallasTime.ts';

const midnight=Date.parse('2026-10-05T00:00:00+05:30');
assert.equal(new Date(midnight).toISOString(),'2026-10-04T18:30:00.000Z');
assert.equal(pallasSessionDate(midnight-1),'2026-10-04');
assert.equal(pallasSessionDate(midnight),'2026-10-05');
assert.equal(pallasSessionRollover('live','2026-10-04',midnight),'2026-10-05');
assert.equal(pallasSessionRollover('live','2026-10-05',midnight),null);
assert.equal(pallasSessionRollover('research','2026-10-01',midnight),null);

const date='2026-10-01',start=Date.parse(date+'T09:45:00+05:30'),end=start+300000;
const doc={source:'pallas',sig_date:'20261001',available_at:new Date(start).toISOString(),
 Doc_ID:'bar',kind:'SNAPSHOT',status:'test',bars:[['TEST','09:45',100,101,99,100,start/1000]]};
assert.equal(foldPallas([doc],date,end-1,'TEST').bars.length,0);
assert.equal(foldPallas([doc],date,end,'TEST').bars.length,1);
assert.equal(foldPallas([doc],date,end,'TEST').asof,'2026-10-01T04:20:00.000Z');
const later={...doc,Doc_ID:'receipt',available_at:new Date(end+1000).toISOString(),bars:[['TEST','09:45',100,101,99,100,(end+1000)/1000]]};
assert.equal(foldPallas([later],date,end,'TEST').bars.length,0);
assert.equal(foldPallas([later],date,end+1000,'TEST').bars.length,1);
assert.equal(foldPallas([doc],date,start+420001,'TEST').stale,true);
const other={...doc,Doc_ID:'old-date',sig_date:'20260930'};
assert.equal(foldPallas([other],date,end,'TEST').bars.length,0);
// Production polling must use the tested rollover helper and wake-tab hook.
const source=fs.readFileSync('app/pallas/PallasClient.tsx','utf8');
assert.match(source,/pallasSessionRollover\(mode,date\)/);
assert.match(source,/visibilitychange/);
console.log(`PASS timezone=${process.env.TZ??'host default'}: IST midnight, live rollover, replay preservation, UTC-equivalent instants, candle close, receipt delay, stale capture and date isolation`);
