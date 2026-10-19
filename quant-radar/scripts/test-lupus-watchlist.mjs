import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const listeners={},sent=[],button={dataset:{watchSymbol:'ITC'},disabled:false};
const parent={postMessage:(...args)=>sent.push(args)};
const context={URLSearchParams,Set,parent,location:{origin:'https://test.invalid',search:'?embedded=1'},esc:s=>s,
 window:{addEventListener:(name,fn)=>listeners[name]=fn},document:{addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:()=>[button]}};
vm.createContext(context);
const source=fs.readFileSync('public/lupus-preview/app.js','utf8');
vm.runInContext(source.slice(0,source.indexOf("'use strict';")),context);
assert.match(vm.runInContext("watchButton('ITC')",context),/Add ITC to Charts watchlist/);
listeners.message({origin:'https://wrong.invalid',source:parent,data:{type:'LUPUS_WATCHLIST',symbols:['ITC']}});
assert.equal(button.disabled,false);
listeners.click({target:{closest:()=>button},stopPropagation(){}});
assert.equal(sent.length,1);assert.equal(sent[0][0].symbol,'ITC');
listeners.message({origin:context.location.origin,source:parent,data:{type:'LUPUS_WATCHLIST',symbols:['ITC']}});
assert.equal(button.disabled,true);assert.match(vm.runInContext("watchButton('ITC')",context),/disabled/);
listeners.click({target:{closest:()=>button},stopPropagation(){}});assert.equal(sent.length,1);
console.log('PASS: Lupus watchlist action, same-origin parent checks and added state');
