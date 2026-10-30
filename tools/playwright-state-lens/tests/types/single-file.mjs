// Check the JSDoc-only download without the adjacent declaration file.
import ts from 'typescript';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'state-lens-types-'));
try {
  await writeFile(join(directory, 'common.mjs'), await readFile(new URL('../../lens.mjs', import.meta.url)));
  const consumer = join(directory, 'consumer.mts');
  await writeFile(consumer, `import { createStateLens } from './common.mjs';
declare const page: any;
createStateLens(page, { probes: [
  { name: 'draft', source: 'localStorage', key: 'draft', json: true },
  { name: 'tab', source: 'sessionStorage', key: 'draft' },
  { name: 'field', source: 'sessionStorage', key: 'draft', json: true, pointer: '/body' },
  { name: 'record', source: 'indexedDB', database: 'notes', store: 'drafts', key: 1 },
] });
// @ts-expect-error JSON pointer selection needs json:true on Web Storage.
createStateLens(page, { probes: [{ name: 'bad', source: 'localStorage', key: 'draft', pointer: '/body' }] });
// @ts-expect-error The single-file contract also rejects a numeric localStorage key.
createStateLens(page, { probes: [{ name: 'bad', source: 'localStorage', key: 1 }] });
`);
  const program = ts.createProgram([consumer], {
    strict: true, noEmit: true, allowJs: true, checkJs: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    types: ['node'], typeRoots: [dirname(dirname(require.resolve('@types/node/package.json')))],
  });
  const errors = ts.getPreEmitDiagnostics(program);
  if (errors.length) throw new Error(ts.formatDiagnostics(errors, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => directory, getNewLine: () => '\n',
  }));
  console.log('TypeScript ' + ts.version + ' single-file allowJs consumer: PASS');
} finally {
  await rm(directory, { recursive: true, force: true });
}
