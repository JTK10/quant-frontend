import fs from 'node:fs';
import ts from 'typescript';

const code = ['utils/sessionPolling.ts', 'utils/sectorOi.ts', 'utils/rfacSector.ts'].map((path) => {
  const source = fs
    .readFileSync(path, 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/export /g, '');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  if (path.includes('sectorOi')) return 'const buildSectorOi=(()=>{' + js + ';return buildSectorOi;})();';
  if (path.includes('rfacSector')) return 'const buildRfacSectorScope=(()=>{' + js + ';return buildRfacSectorScope;})();';
  return js;
}).join('\n');

fs.writeFileSync(
  'app/sector/workspaceRuntime.ts',
  '// Generated from shared helpers by scripts/build-sector-runtime.mjs.\nexport default ' + JSON.stringify(code) + ';\n',
);
