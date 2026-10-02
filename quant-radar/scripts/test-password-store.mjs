import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import ts from 'typescript';
const dir = path.resolve('.private/auth-tests'); await fs.mkdir(dir,{recursive:true});
const files = ['authStore','auth'];
for(const file of files) {
  const source=await fs.readFile(`utils/${file}.ts`,'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace('"./authStore"','"./authStore.mjs"').replace('"next/headers"','"next/headers.js"').replace('"next/server"','"next/server.js"');
  await fs.writeFile(path.join(dir,`${file}.mjs`),code);
}
const initialPassword=randomBytes(20).toString('hex'),newPassword=randomBytes(20).toString('hex');
const hash=p=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(p,salt,64).toString('hex')}`;};
process.env.AUTH_PASSWORD_HASH=hash(initialPassword); process.env.AUTH_SESSION_SECRET=randomBytes(48).toString('hex');
process.env.UPSTASH_REDIS_REST_URL='https://mock-redis.invalid';process.env.UPSTASH_REDIS_REST_TOKEN='test-only';
process.env.AUTH_STORE_NAMESPACE='unit-test';
const records=new Map(),counts=new Map();let outage=false;
globalThis.fetch=async(url,init)=>{
  assert.equal(url,'https://mock-redis.invalid'); if(outage)throw Error('simulated outage');
  const command=JSON.parse(init.body);assert.ok(!init.body.includes(initialPassword)&&!init.body.includes(newPassword),'Never store plaintext passwords');
  const [op,...args]=command;let result;
  if(op==='GET')result=records.get(args[0])??null;
  else if(op==='SET'){if(args[2]==='NX'&&records.has(args[0]))result=null;else{records.set(args[0],args[1]);result='OK';}}
  else if(op==='EVAL'&&args[0].includes("redis.call('GET'")){const [, ,key,previous,next]=args;result=records.get(key)===previous?1:0;if(result)records.set(key,next);}
  else if(op==='EVAL'){const key=args[2];const count=(counts.get(key)??0)+1;counts.set(key,count);result=count;}
  else throw Error('Unexpected command');
  return new Response(JSON.stringify({result}),{status:200});
};
try {
  const store=await import(pathToFileURL(path.join(dir,'authStore.mjs')));
  const auth=await import(pathToFileURL(path.join(dir,'auth.mjs')));
  const current=await store.currentPasswordHash();assert.equal(current,process.env.AUTH_PASSWORD_HASH);
  assert.equal(await auth.verifyPassword(initialPassword),true);
  const token=await auth.createSession();assert.equal(await auth.validSession(token),true);
  const replacement=hash(newPassword),loser=hash('different test passphrase');
  const changes=await Promise.all([store.replacePasswordHash(current,replacement),store.replacePasswordHash(current,loser)]);
  assert.deepEqual(changes,[true,false]);
  assert.equal(await auth.validSession(token),false,'Old laptop sessions must be invalidated');
  assert.equal(await auth.verifyPassword(initialPassword),false);assert.equal(await auth.verifyPassword(newPassword),true);
  const newToken=await auth.createSession();assert.equal(await auth.validSession(newToken),true);
  assert.equal(await auth.validSession(newToken,Date.now()+366*86400000),false);
  for(let i=0;i<5;i++)assert.equal(await store.allowPasswordAttempt('test-ip','change'),true);
  assert.equal(await store.allowPasswordAttempt('test-ip','change'),false);
  outage=true;assert.equal(await auth.validSession(newToken),false);await assert.rejects(store.currentPasswordHash());
  console.log('PASS: bootstrap, hashed-only storage, current/new password checks, atomic concurrent change, all-session invalidation, one-year expiry, durable backoff and fail-closed outage. Test-only credentials; no external database changed.');
} finally {for(const file of files)await fs.unlink(path.join(dir,`${file}.mjs`));}
