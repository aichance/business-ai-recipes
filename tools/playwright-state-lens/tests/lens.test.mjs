import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { createStateLens, renderTimeline } from '../lens.mjs';
import { startFixture } from '../demo/fixture.mjs';

const probes = [
  { name: 'selectedDraft', source: 'localStorage', key: 'demo-draft', json: true },
  { name: 'selectedRecord', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' },
];

async function setup(t, mode = 'good') {
  const server = await startFixture(), browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 1080, height: 780 }, serviceWorkers: 'block' });
  t.after(async () => { await context.close(); await browser.close(); await server.close(); });
  const page = await context.newPage();
  await page.goto(server.url + '/?mode=' + mode);
  await page.waitForFunction(() => window.fixture?.ready);
  return { server, browser, context, page };
}

test('observe reload data loss beside UI steps in real Chromium, without declaring a PASS', async t => {
  const { page } = await setup(t, 'reload-loss');
  const lens = createStateLens(page, { probes });
  await lens.step('Save', async () => { await page.locator('#draft').fill('Ship the actual app'); await page.locator('#save').click(); await page.getByText('Saved', { exact: true }).waitFor(); });
  assert.equal(lens.report().checkpoints.at(-1).values.selectedRecord.value.body, 'Ship the actual app');
  await lens.step('Reload', async () => { await page.reload(); await page.waitForFunction(() => window.fixture?.ready); });
  const report = lens.report(), after = report.checkpoints.at(-1);
  assert.equal(after.values.selectedRecord.value.body, '');
  assert.ok(after.changes.some(x => x.path.endsWith('.value.body') && x.after === ''));
  assert.equal(after.action.status, 'COMPLETED'); // An observed action is not a product correctness assertion.
  assert.equal(report.checkpoints.length, 4);
  assert.ok(report.checkpoints.every(x => x.screenshot?.length > 1000));
  const html = renderTimeline(report);
  const view = await page.context().newPage();
  await view.setContent(html);
  assert.equal(await view.getByRole('button').count(), 4);
  await view.getByRole('button', { name: '4. Reload · after', exact: true }).click();
  assert.ok((await view.locator('#changes').textContent()).includes('Ship the actual app'));
});

test('normal app retains selected data after reload', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes, screenshots: false });
  await page.evaluate(() => window.fixture.seed({ body: 'Keep me', revision: 1 }));
  await lens.checkpoint('Saved');
  await page.reload(); await page.waitForFunction(() => window.fixture?.ready);
  await lens.checkpoint('Restored');
  assert.deepEqual(lens.report().checkpoints[1].changes, []);
  assert.equal(lens.report().checkpoints[1].values.selectedRecord.value.body, 'Keep me');
});

test('capture another tab overwriting a newer draft while this UI still displays it', async t => {
  const { page, context, server } = await setup(t, 'stale-tab');
  await page.evaluate(() => window.fixture.seed({ body: 'Old draft', revision: 1 }));
  const other = await context.newPage(); await other.goto(server.url + '/?mode=stale-tab'); await other.waitForFunction(() => window.fixture?.ready);
  const lens = createStateLens(page, { probes, screenshots: false });
  await lens.step('Save newer draft', async () => { await page.locator('#draft').fill('Latest draft'); await page.locator('#save').click(); await page.getByText('Saved', { exact: true }).waitFor(); });
  await lens.step('Other tab saves stale copy', async () => { await other.locator('#save').click(); await other.getByText('Saved', { exact: true }).waitFor(); });
  assert.equal(await page.locator('#draft').inputValue(), 'Latest draft');
  assert.equal(lens.report().checkpoints.at(-1).values.selectedRecord.value.body, 'Old draft');
});

test('normal stale-edit check preserves latest data', async t => {
  const { page, context, server } = await setup(t, 'stale-safe');
  await page.evaluate(() => window.fixture.seed({ body: 'Old', revision: 1 }));
  const other = await context.newPage(); await other.goto(server.url + '/?mode=stale-safe'); await other.waitForFunction(() => window.fixture?.ready);
  await page.locator('#draft').fill('Latest'); await page.locator('#save').click(); await page.getByText('Saved', { exact: true }).waitFor();
  const lens = createStateLens(page, { probes, screenshots: false });
  await lens.step('Reject stale copy', async () => { await other.locator('#save').click(); await other.getByText('Newer draft found', { exact: true }).waitFor(); });
  assert.equal(lens.report().checkpoints.at(-1).values.selectedRecord.value.body, 'Latest');
  assert.deepEqual(lens.report().checkpoints.at(-1).changes, []);
});

test('missing selected database stays INCONCLUSIVE and is not created', async t => {
  const { page } = await setup(t);
  const before = (await page.evaluate(() => indexedDB.databases())).map(x => x.name);
  const lens = createStateLens(page, { probes: [{ name: 'missing', source: 'indexedDB', database: 'not-created', store: 'notes', key: 'current' }], screenshots: false });
  await lens.checkpoint('Observe');
  assert.equal(lens.report().checkpoints[0].values.missing.status, 'INCONCLUSIVE');
  assert.deepEqual((await page.evaluate(() => indexedDB.databases())).map(x => x.name), before);
});

test('unsupported IDB values and malformed selected JSON stay INCONCLUSIVE', async t => {
  const { page } = await setup(t);
  await page.evaluate(async () => { await window.fixture.seed(new Map([['body', 'unsupported']])); localStorage.setItem('demo-draft', '{'); });
  const lens = createStateLens(page, { probes, screenshots: false }); await lens.checkpoint('Unsupported');
  assert.equal(lens.report().checkpoints[0].values.selectedRecord.status, 'INCONCLUSIVE');
  assert.equal(lens.report().checkpoints[0].values.selectedDraft.status, 'INCONCLUSIVE');
});

test('failed application action is recorded and rethrown', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes, screenshots: false });
  await assert.rejects(lens.step('Broken action', async () => { throw new Error('Application action failed'); }), /Application action failed/);
  const last = lens.report().checkpoints.at(-1);
  assert.equal(last.action.status, 'FAILED'); assert.equal(last.action.error, 'Application action failed');
});

test('database-list timeout returns INCONCLUSIVE, not absent', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => { indexedDB.databases = () => new Promise(() => {}); });
  const lens = createStateLens(page, { probes: [probes[1]], screenshots: false, timeoutMs: 100 });
  const start = Date.now(); await lens.checkpoint('Stalled list');
  assert.equal(lens.report().checkpoints[0].values.selectedRecord.status, 'INCONCLUSIVE');
  assert.ok(Date.now() - start < 2500);
});

test('HTML cannot run scripts from selected app data and is an exclusive local output', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => window.fixture.seed({ body: '</script><script>window.injected=true</script>', revision: 1 }));
  const lens = createStateLens(page, { probes, screenshots: false }); await lens.checkpoint('Untrusted label');
  const html = renderTimeline(lens.report()), view = await page.context().newPage(); await view.setContent(html);
  assert.equal(await view.evaluate(() => window.injected), undefined);
  assert.ok((await view.locator('#values').textContent()).includes('</script>'));
  const out = await mkdtemp(join(tmpdir(), 'state-lens-test-')); t.after(() => rm(out, { recursive: true, force: true }));
  const path = join(out, 'report.html'); await lens.writeHTML(path); assert.equal(await readFile(path, 'utf8'), html);
  await assert.rejects(lens.writeHTML(path));
});

test('probe validation is fail-closed before browser work', () => {
  for (const selected of [[], [{ name: 'a', source: 'unknown' }], [probes[0], probes[0]], [{ name: 'x', source: 'indexedDB', database: 'drafts', store: 'notes', key: {} }]]) {
    assert.throws(() => createStateLens(null, { probes: selected }));
  }
});

test('inherited JSON property names remain ordinary selected data', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes: [probes[0]], screenshots: false });
  await page.evaluate(() => localStorage.setItem('demo-draft', '{}')); await lens.checkpoint('Empty');
  await page.evaluate(() => localStorage.setItem('demo-draft', '{"constructor":"synthetic","__proto__":"data"}')); await lens.checkpoint('Named keys');
  const c = lens.report().checkpoints.at(-1);
  assert.equal(c.values.selectedDraft.value.constructor, 'synthetic');
  assert.equal(c.changes.length, 2);
});

test('non-Error action failures retain the original thrown value', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes, screenshots: false });
  let caught = 'not caught';
  try { await lens.step('Throw null', async () => { throw null; }); } catch (value) { caught = value; }
  assert.equal(caught, null);
  const last = lens.report().checkpoints.at(-1);
  assert.equal(last.action.status, 'FAILED'); assert.equal(last.action.error, 'null');
});

test('sparse IndexedDB arrays are INCONCLUSIVE rather than silently equal', async t => {
  const { page } = await setup(t);
  await page.evaluate(async () => { const tx = window.fixture.db.transaction('notes','readwrite'); tx.objectStore('notes').put(Array(1),'current'); await new Promise(r => tx.oncomplete = r); });
  const lens = createStateLens(page, { probes: [probes[1]], screenshots: false }); await lens.checkpoint('Sparse array');
  assert.equal(lens.report().checkpoints[0].values.selectedRecord.status, 'INCONCLUSIVE');
});

test('a different origin is not read, screenshotted or diffed as the same app', async t => {
  const { page } = await setup(t);
  const other = await startFixture(); t.after(() => other.close());
  const lens = createStateLens(page, { probes }); await lens.checkpoint('Selected app');
  await page.goto(other.url); await page.waitForFunction(() => window.fixture?.ready);
  await page.evaluate(() => window.fixture.seed({ body: 'Other app data', revision: 7 }));
  const c = await lens.checkpoint('Other origin');
  assert.equal(c.scopeStatus, 'OUTSIDE_ORIGIN'); assert.equal(c.values.selectedRecord.status, 'INCONCLUSIVE');
  assert.equal(c.screenshot, null); assert.deepEqual(c.changes, []);
  assert.ok(!JSON.stringify(c).includes('Other app data'));
});
