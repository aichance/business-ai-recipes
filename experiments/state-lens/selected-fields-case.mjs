// Authored synthetic operator case; no external application or model calls.
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createStateLens, differences } from '../../tools/playwright-state-lens/lens.mjs';
import { startFixture } from '../../tools/playwright-state-lens/demo/fixture.mjs';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../tools/playwright-state-lens/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const directory = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'state-lens-fields-'));
if (process.argv[2]) await mkdir(directory); // Refuse an existing output directory.
const out = pathToFileURL(join(directory, '/'));
const server = await startFixture();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 780 }, serviceWorkers: 'block' });
  await page.goto(server.url); await page.waitForFunction(() => window.fixture?.ready);
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic large document', revision: 1,
    nodes: [{ data: { value: 1234.567 } }], padding: 'UNSELECTED-FIXTURE-PADDING:'.repeat(6000) }));
  const before = await page.evaluate(() => localStorage.getItem('demo-draft'));
  const full = createStateLens(page, { probes: [{ name: 'whole', source: 'localStorage', key: 'demo-draft', json: true }], screenshots: false });
  const whole = (await full.checkpoint('Whole document')).values.whole;
  const lens = createStateLens(page, { title: 'Selected fields in a large synthetic document',
    probes: ['value', 'digits', 'dispRound'].map(field => ({ name: field, source: 'localStorage', key: 'demo-draft', json: true, pointer: '/nodes/0/data/' + field })) });
  await lens.checkpoint('Synthetic document saved');
  await lens.step('Fixture commits formatting', () => page.evaluate(async () => {
    const doc = JSON.parse(localStorage.getItem('demo-draft'));
    doc.nodes[0].data.digits = 2; doc.nodes[0].data.dispRound = 'floor';
    await window.fixture.seed(doc);
  }));
  await lens.step('Reload', async () => { await page.reload(); await page.waitForFunction(() => window.fixture?.ready); });
  const after = await page.evaluate(() => localStorage.getItem('demo-draft'));
  const report = lens.report();
  const nativeChanges = differences(JSON.parse(before), JSON.parse(after));
  assert.equal(whole.status, 'INCONCLUSIVE'); assert.match(whole.reason, /64KiB/);
  assert.equal(report.checkpoints.length, 5);
  assert.ok(report.checkpoints.every(c => Object.values(c.values).every(v => v.status === 'OBSERVED')));
  assert.deepEqual(report.checkpoints.at(-1).changes, []);
  assert.deepEqual(nativeChanges.map(x => x.path).sort(), ['$.nodes.0.data.digits', '$.nodes.0.data.dispRound']);
  assert.equal(JSON.stringify(report).includes('UNSELECTED-FIXTURE-PADDING'), false);
  await lens.writeHTML(fileURLToPath(new URL('selected-fields.html', out)));
  await writeFile(new URL('selected-fields.json', out), JSON.stringify(report, null, 2) + '\n');
  const measurement = { observed_at: new Date().toISOString(), kind: 'AUTHORED_SYNTHETIC_OPERATOR_FIXTURE_NOT_ADOPTION',
    library: report.libraryVersion, schema: report.schema, node: process.version,
    playwright: require('@playwright/test/package.json').version, chromium: browser.version(),
    savedBytes: Buffer.byteLength(after), nativeChangedFields: nativeChanges,
    wholeProbe: whole, selectedProbeCount: report.probes.length, checkpoints: report.checkpoints.length,
    selectedObservedValues: report.checkpoints.flatMap(c => Object.values(c.values)).filter(v => v.status === 'OBSERVED').length,
    selectedValueBytes: Buffer.byteLength(JSON.stringify(report.checkpoints.map(c => c.values))),
    reportBytesWithoutScreenshots: Buffer.byteLength(JSON.stringify({ ...report, checkpoints: report.checkpoints.map(c => ({ ...c, screenshot: null })) })),
    dataBeforeSHA256: createHash('sha256').update(before).digest('hex'), dataAfterSHA256: createHash('sha256').update(after).digest('hex'),
    unselectedPaddingNotSerialized: true, reloadSelectedDifferenceCount: report.checkpoints.at(-1).changes.length,
    html: 'selected-fields.html', new_use_credit: 0 };
  await writeFile(new URL('measurement.json', out), JSON.stringify(measurement, null, 2) + '\n');
  console.log(JSON.stringify({ output: directory, ...measurement }));
} finally {
  try { if (browser) await browser.close(); } finally { await server.close(); }
}
