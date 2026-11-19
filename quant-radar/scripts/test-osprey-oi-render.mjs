import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';

function load(file,deps={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,require:key=>deps[key],Date,Map,Set,URLSearchParams});
  return exports;
}
const model=load('app/osprey/model.ts');
const board=model.projectBoard({date:'2026-11-19',source:'osprey',cut:'15:25',cuts:['15:25'],available:true,
  rows:[{symbol:'TEST',mode:'All chain activity',side:'BULL',score:10}]},'2026-11-19','15:25');
function render(input,sort={key:'score',descending:true}) {
  let index=0;
  const jsx=(type,props)=>({type,props});
  const Component=load('app/osprey/OspreyClient.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},
    react:{useEffect(){},useMemo:fn=>fn(),useState:initial=>{
      const i=index++;return [i===12?input:i===11?sort:typeof initial==='function'?initial():initial,()=>{}];
    }},
    'lucide-react':{},'@/utils/backend':{buildTradingViewUrl:()=>''},
    '@/utils/sessionPolling':{istSessionDate:()=> '2026-11-19'},'@/utils/chartWatchlist':{},
    './feed':{},'./model':model,'./useSetupCandles':{useSetupCandles:()=>new Map()},
    './setup':{evaluateOspreySetup:()=>null},
  }).default;
  return Component({initialDate:'2026-11-19'});
}
const cached=JSON.parse(JSON.stringify(board));
for (const key of ['ce_pct','pe_pct','oi_bias']) delete cached.rows[0][key];
assert.doesNotThrow(()=>render(cached),'A pre-release browser-cached response must still render');
function nodes(tree,type,result=[]) {
  if (Array.isArray(tree)) tree.forEach(item=>nodes(item,type,result));
  else if (tree&&typeof tree==='object') {
    if (tree.type===type) result.push(tree);
    nodes(tree.props?.children,type,result);
  }
  return result;
}
const unavailable=nodes(render(cached),'td').filter(n=>n.props.title?.startsWith('Rusty'));
assert.deepEqual(unavailable.map(n=>n.props.children),['—','—','—']);
assert.doesNotThrow(()=>render(board),'Missing same-cut Rusty data stays unavailable');
for (const fields of [{ce_pct:0,pe_pct:4,oi_bias:4},{ce_pct:-5,pe_pct:-1,oi_bias:4},
                       {ce_pct:NaN,pe_pct:Infinity,oi_bias:undefined}]) {
  assert.doesNotThrow(()=>render({...board,rows:[{...board.rows[0],...fields}]}));
}
assert.doesNotThrow(()=>render(cached,{key:'oi_bias',descending:true}));
const mixed={...cached,rows:[{...cached.rows[0],symbol:'OLD'},
  {...board.rows[0],symbol:'NEW',ce_pct:0,pe_pct:4,oi_bias:4}]};
const ranked=render(mixed,{key:'oi_bias',descending:true});
assert.deepEqual(nodes(ranked,'b').map(n=>n.props.children),['NEW','OLD']);
assert.deepEqual(nodes(ranked,'td').filter(n=>n.props.title?.startsWith('Rusty')).slice(0,3).map(n=>n.props.children),['0.00%','+4.00%','+4.00']);
console.log('PASS Osprey render: older cached rows, unavailable/zero/signed/nonfinite OI, and missing-value sort.');
