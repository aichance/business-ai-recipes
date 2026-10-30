// MIT. Reproduce one pinned Bloggr browser test with the unchanged State Lens module.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SOURCE = 'cf95e5ca8e44cca1dab52396cc0d1380e7d1799a';
const MODULE_SHA256 = 'b0cac73e52f6d4e404211feae08e7425e50fe81e6ea8f78d526d736a8f678e8c';
const TYPES_SHA256 = '48c73700e9c815aa5f0743d7fbe9b32cfadb582e1c924cf584939da87fdbacac';
const SOURCE_BLOBS = {
  "LICENSE": "5451ea050054ccd24fd121fbe45797d83929bd25",
  "components/admin/PostEditor.tsx": "ab875e6986e6ef9430c1e9bcbfaf9612d1ee2799",
  "package-lock.json": "5780f9500b1570b1c32a1a52ee33d90f8819e5e7",
  "package.json": "9f5c944c1cc4bc07833659ceba4fb0fcd5560bb3",
  "playwright.config.ts": "695bf8f7ea9c956d7b6dc0d45a962aba6518895a",
  "tests/browser/workspace.spec.ts": "c7c476746d2b016eaec1e5b54bdd4184a578241d"
};
const TITLE = 'a lost rename response can reconcile the old address and preserve new text';
const MODULE_NAME = 'state-lens-v0.4.1-experimental.1.mjs';
const TYPES_NAME = MODULE_NAME.replace(/\.mjs$/, '.d.mts');
const KEYS = [
  'bloggr-draft:fixture-owner:a-story',
  'bloggr-draft:fixture-owner:id:11111111-1111-4111-8111-111111111111',
  'bloggr-draft:fixture-owner:renamed-story',
];
const hash = (kind, bytes) => createHash(kind).update(bytes).digest('hex');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('node state-lens-bloggr-consumer.mjs --project /path/to/pinned/bloggr [--module /path/to/' + MODULE_NAME + ']');
    console.log('Reads the pinned public-source files; creates tests/browser/state-lens-recovery with the common module, its matching declarations and one consumer spec. Refuses an existing output directory. Does not install or run anything.');
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project', '--module'].includes(args[i]) || !args[i + 1] || Object.hasOwn(options, args[i])) throw new Error('Expected --project and optional --module, once each.');
    options[args[i]] = args[i + 1];
  }
  if (!options['--project']) throw new Error('A pinned Bloggr --project directory is required.');
  const project = resolve(options['--project']);
  for (const [path, expected] of Object.entries(SOURCE_BLOBS)) {
    const bytes = await readFile(join(project, path));
    const actual = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    if (actual !== expected) throw new Error(path + ' differs from public Bloggr ' + SOURCE + '; leave the project unchanged.');
  }
  const modulePath = options['--module'] ? resolve(options['--module']) : fileURLToPath(new URL('./' + MODULE_NAME, import.meta.url));
  const moduleBytes = await readFile(modulePath);
  if (hash('sha256', moduleBytes) !== MODULE_SHA256) throw new Error('Use the checksum-pinned common 0.4.1-experimental.1 module.');
  if (!modulePath.endsWith('.mjs')) throw new Error('Use the versioned .mjs filename.');
  const typeBytes = await readFile(modulePath.slice(0, -4) + '.d.mts');
  if (hash('sha256', typeBytes) !== TYPES_SHA256) throw new Error('Use the matching checksum-pinned .d.mts file beside the common module.');
  const source = await readFile(join(project, 'tests/browser/workspace.spec.ts'), 'utf8');
  const license = await readFile(join(project, 'LICENSE'), 'utf8');
  if (license.includes('*/')) throw new Error('Unexpected license comment terminator.');
  const first = source.indexOf('test("public pages fit phones, theme persists, and errors are usable"');
  const selected = source.indexOf('test("' + TITLE + '"');
  if (first < 0 || selected <= first) throw new Error('Pinned test boundaries were not found.');
  const helpers = source.slice(0, first).replace('\n', '\nimport { createStateLens } from "./' + MODULE_NAME + '";\n');
  const original = source.slice(selected).trimEnd();
  const anchors = [
    '  await page.getByRole("button", { name: /A story worth sharing/ }).click();',
    '  state.loseRenameResponse();',
    '  await page.getByLabel("Post title").fill("Text kept after rename loss");',
    '  await page\n    .getByRole("button", { name: "Use recovered draft", exact: true })',
    '\n});',
  ];
  const positions = anchors.map(x => original.indexOf(x));
  if (positions.some((x, i) => x < 0 || (i && x <= positions[i - 1]))) throw new Error('Pinned action boundaries were not found.');
  const prefix = original.slice(0, positions[0]).replace('}) => {', '}, testInfo) => {');
  const blocks = positions.slice(0, 4).map((x, i) => original.slice(x, positions[i + 1]));
  const labels = ['Open the existing story', 'Rename commits but its response is lost', 'Edit, retry and load the latest version', 'Recover the newer local text'];
  const steps = blocks.map((body, i) => '    await lens.step(' + JSON.stringify(labels[i]) + ', async () => {\n' + body.replace(/^/gm, '    ').trimEnd() + '\n    });\n').join('');
  const setup = `  const selectedKeys = ${JSON.stringify(KEYS)};
  const lens = createStateLens(page, {
    title: 'Bloggr: local recovery after a lost rename response',
    probes: selectedKeys.map((key, index) => ({ name: ['old-address', 'stable-id', 'new-address'][index], source: 'localStorage' as const, key, json: true })),
  });
  let originalFailed = false;
  try {
`;
  const ending = `  } catch (error) {
    originalFailed = true;
    throw error;
  } finally {
    try {
      const reportPath = testInfo.outputPath('state-lens.html');
      await lens.writeHTML(reportPath);
      await testInfo.attach('selected-state', { path: reportPath, contentType: 'text/html' });
      await testInfo.attach('state-lens-json', { body: JSON.stringify(lens.report(), null, 2), contentType: 'application/json' });
      const native = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), selectedKeys);
      await testInfo.attach('native-selected-final', { body: JSON.stringify(native, null, 2), contentType: 'application/json' });
    } catch (reportError) {
      if (!originalFailed) throw reportError;
      testInfo.annotations.push({ type: 'State Lens report unavailable', description: String(reportError) });
    }
  }
});
`;
  const derived = '/*\n' + license.trim() + '\n\nFixture and original assertions: Antibody/bloggr at ' + SOURCE + '.\nOnly observation/reporting wraps its original selected UI actions.\n*/\n' + helpers + prefix + setup + steps + ending;
  // Reconstruct the unwrapped callback before writing; every original statement stays in order.
  const reconstructed = prefix.replace('}, testInfo) => {', '}) => {') + blocks.join('') + '\n});';
  if (reconstructed !== original) throw new Error('Original action/assertion fidelity check failed.');
  const output = join(project, 'tests/browser/state-lens-recovery');
  await mkdir(output); // Intentionally refuses an existing directory; never replace caller files.
  await writeFile(join(output, MODULE_NAME), moduleBytes, { flag: 'wx' });
  await writeFile(join(output, TYPES_NAME), typeBytes, { flag: 'wx' });
  const specPath = join(output, 'rename.spec.ts');
  await writeFile(specPath, derived, { flag: 'wx' });
  console.log(JSON.stringify({ source: SOURCE, commonModule: '0.4.1-experimental.1', moduleSHA256: MODULE_SHA256, originalActionOrderAndAssertions: 'preserved', spec: specPath, helper: join(output, MODULE_NAME), declarations: join(output, TYPES_NAME), typesSHA256: TYPES_SHA256, command: 'playwright test tests/browser/state-lens-recovery/rename.spec.ts --grep "' + TITLE + '$" --trace=on' }, null, 2));
}
main().catch(error => { console.error('State Lens Bloggr example: ' + error.message); process.exitCode = 1; });
