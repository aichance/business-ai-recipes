import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createStateLens, renderTimeline, differences } from '../lens.mjs';
import { startFixture } from '../demo/fixture.mjs';

const local = { name: 'selected', source: 'localStorage', key: 'demo-draft', json: true };
const idb = { name: 'selected', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' };

async function setup(t) {
  const server = await startFixture();
  let browser;
  t.after(async () => { if (browser) await browser.close(); await server.close(); });
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1080, height: 780 } });
  const page = await context.newPage();
  await page.goto(server.url); await page.waitForFunction(() => window.fixture?.ready);
  return { page, context };
}

test('large saved JSON keeps whole-value limits while selected fields survive changes and reload', async t => {
  const { page, context } = await setup(t);
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic large document', revision: 1,
    nodes: [{ data: { value: 1234.567 } }], padding: 'UNSELECTED-FIXTURE-PADDING:'.repeat(6000) }));
  const rawBefore = await page.evaluate(() => localStorage.getItem('demo-draft'));
  assert.ok(Buffer.byteLength(rawBefore) > 65536);
  const full = createStateLens(page, { probes: [local], screenshots: false });
  assert.match((await full.checkpoint('Whole document')).values.selected.reason, /64KiB/);
  const probes = ['value', 'digits', 'dispRound'].map(field => ({ ...local, name: field, pointer: '/nodes/0/data/' + field }));
  const lens = createStateLens(page, { probes, screenshots: false });
  const initial = await lens.checkpoint('Initial saved values');
  assert.equal(initial.values.value.value, 1234.567);
  assert.deepEqual(initial.values.digits, { status: 'OBSERVED', exists: true, value: null,
    selection: { pointer: '/nodes/0/data/digits', exists: false } });
  await lens.step('App commits format fields', () => page.evaluate(async () => {
    const doc = JSON.parse(localStorage.getItem('demo-draft'));
    doc.nodes[0].data.digits = 2; doc.nodes[0].data.dispRound = 'floor';
    await window.fixture.seed(doc);
  }));
  const committed = lens.report().checkpoints.at(-1);
  assert.equal(committed.values.value.value, 1234.567);
  assert.equal(committed.values.digits.value, 2);
  assert.equal(committed.values.dispRound.value, 'floor');
  assert.ok(committed.changes.some(x => x.path === '$.digits.selection.exists' && x.after === true));
  await lens.step('Reload', async () => { await page.reload(); await page.waitForFunction(() => window.fixture?.ready); });
  assert.deepEqual(lens.report().checkpoints.at(-1).changes, []);
  const rawAfter = await page.evaluate(() => localStorage.getItem('demo-draft'));
  assert.deepEqual(differences(JSON.parse(rawBefore), JSON.parse(rawAfter)).map(x => x.path).sort(),
    ['$.nodes.0.data.digits', '$.nodes.0.data.dispRound']);
  const report = lens.report();
  assert.equal(report.schema, 4);
  assert.ok(report.checkpoints.every(c => Object.values(c.values).every(v => v.status === 'OBSERVED')));
  assert.equal(JSON.stringify(report).includes('UNSELECTED-FIXTURE-PADDING'), false);
  const viewer = await context.newPage(); await viewer.setContent(renderTimeline(report));
  await viewer.getByRole('button', { name: '5. Reload · after', exact: true }).click();
  assert.match(await viewer.locator('#value-note').textContent(), /not the whole saved record.*selection.exists/);
  assert.equal((await viewer.locator('#values').textContent()).includes('UNSELECTED-FIXTURE-PADDING'), false);
  t.diagnostic(JSON.stringify({ savedBytes: Buffer.byteLength(rawAfter), reportBytesWithoutScreenshots: Buffer.byteLength(JSON.stringify(report)), checkpoints: report.checkpoints.length, independentChangedFields: 2 }));
});

test('storage absence, path absence, JSON null and explicit IndexedDB undefined stay distinct', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes: [{ ...idb, pointer: '/field' }], screenshots: false });
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic', revision: 1 }));
  const absent = (await lens.checkpoint('Path absent')).values.selected;
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic', revision: 1, field: null }));
  const nil = (await lens.checkpoint('Null')).values.selected;
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic', revision: 1, field: undefined }));
  const undef = (await lens.checkpoint('Undefined')).values.selected;
  assert.deepEqual([absent.exists, absent.selection.exists, absent.value], [true, false, null]);
  assert.deepEqual([nil.exists, nil.selection.exists, nil.value], [true, true, null]);
  assert.deepEqual(undef.undefinedPaths, ['']);
  assert.deepEqual([undef.exists, undef.selection.exists, undef.value], [true, true, null]);
  await page.evaluate(async () => {
    const tx = window.fixture.db.transaction('notes', 'readwrite'); tx.objectStore('notes').delete('current');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
  });
  const missing = (await lens.checkpoint('Storage key absent')).values.selected;
  assert.deepEqual([missing.exists, missing.selection.exists, missing.value], [false, false, null]);
});

test('selected Date, escaped property names and array positions preserve their own type paths', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic', revision: 1,
    'a/b': { '~key': { date: new Date(1), optional: undefined } }, items: [null, 'second'] }));
  const lens = createStateLens(page, { probes: [
    { ...idb, name: 'escaped', pointer: '/a~1b/~0key' },
    { ...idb, name: 'date', pointer: '/a~1b/~0key/date' },
    { ...idb, name: 'item', pointer: '/items/1' },
    { ...idb, name: 'notIndex', pointer: '/items/01' },
    { ...idb, name: 'lengthIsNotAnArrayItem', pointer: '/items/length' },
  ], screenshots: false });
  const before = await page.evaluate(async () => (await window.fixture.read())['a/b']['~key'].date.getTime());
  const c = await lens.checkpoint('Typed fields');
  assert.deepEqual(c.values.escaped.datePaths, ['/date']);
  assert.deepEqual(c.values.escaped.undefinedPaths, ['/optional']);
  assert.deepEqual(c.values.date.datePaths, ['']);
  assert.equal(c.values.date.value, '1970-01-01T00:00:00.001Z');
  assert.equal(c.values.item.value, 'second');
  assert.equal(c.values.notIndex.selection.exists, false);
  assert.equal(c.values.lengthIsNotAnArrayItem.selection.exists, false);
  assert.equal(await page.evaluate(async () => (await window.fixture.read())['a/b']['~key'].date.getTime()), before);
});

test('only own JSON properties are selected and empty pointers retain root semantics', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => localStorage.setItem('demo-draft', '{"__proto__":{"own":7},"constructor":"stored","":"empty key","value":null}'));
  const lens = createStateLens(page, { probes: [
    { ...local, name: 'ownProtoName', pointer: '/__proto__/own' },
    { ...local, name: 'storedConstructor', pointer: '/constructor' },
    { ...local, name: 'inherited', pointer: '/toString' },
    { ...local, name: 'emptyName', pointer: '/' },
    { ...local, name: 'root', pointer: '' },
  ], screenshots: false });
  const c = await lens.checkpoint('Literal JSON properties');
  assert.equal(c.values.ownProtoName.value, 7);
  assert.equal(c.values.storedConstructor.value, 'stored');
  assert.equal(c.values.inherited.selection.exists, false);
  assert.equal(c.values.emptyName.value, 'empty key');
  assert.equal(c.values.root.selection.exists, true);
  assert.equal(c.values.root.value.__proto__.own, 7);
});

test('selected output and JSON input budgets remain bounded and malformed text is inconclusive', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes: [{ ...local, pointer: '/field' }], screenshots: false });
  await page.evaluate(() => localStorage.setItem('demo-draft', JSON.stringify({ field: 'あ'.repeat(23000) })));
  assert.match((await lens.checkpoint('Selected output too large')).values.selected.reason, /64KiB/);
  const longPointer = '/' + 'k'.repeat(2000);
  await page.evaluate(() => localStorage.setItem('demo-draft', JSON.stringify({ ['k'.repeat(2000)]: 'y'.repeat(64000) })));
  const metadata = createStateLens(page, { probes: [{ ...local, pointer: longPointer }], screenshots: false });
  assert.match((await metadata.checkpoint('Pointer metadata counts toward the output budget')).values.selected.reason, /64KiB/);
  await page.evaluate(() => localStorage.setItem('demo-draft', JSON.stringify({ field: 1, padding: 'あ'.repeat(1500000) })));
  assert.match((await lens.checkpoint('JSON input too large')).values.selected.reason, /4MiB/);
  await page.evaluate(() => localStorage.setItem('demo-draft', '{"field":1,"unselected":"INCOMPLETE-INPUT-MARKER'));
  const malformed = (await lens.checkpoint('Malformed JSON')).values.selected;
  assert.equal(malformed.status, 'INCONCLUSIVE');
  assert.equal(malformed.reason.includes('INCOMPLETE-INPUT-MARKER'), false);
});

test('unsupported unselected IndexedDB fields are outside the projection, selected ones remain inconclusive', async t => {
  const { page } = await setup(t);
  await page.evaluate(async () => {
    const value = { selected: { value: 2 }, notSelected: 7n };
    const tx = window.fixture.db.transaction('notes', 'readwrite'); tx.objectStore('notes').put(value, 'current');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
  });
  const lens = createStateLens(page, { probes: [
    { ...idb, name: 'small', pointer: '/selected' },
    { ...idb, name: 'unsupported', pointer: '/notSelected' },
  ], screenshots: false });
  const c = await lens.checkpoint('Selected scope only');
  assert.deepEqual(c.values.small.value, { value: 2 });
  assert.equal(c.values.unsupported.status, 'INCONCLUSIVE');
  assert.equal(await page.evaluate(async () => typeof (await window.fixture.read()).notSelected), 'bigint');
});

test('session JSON selection reads the chosen tab storage rather than its same-named local key', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => {
    localStorage.setItem('demo-draft', '{"field":1}');
    sessionStorage.setItem('demo-draft', '{"field":7}');
  });
  const lens = createStateLens(page, { probes: [
    { ...local, name: 'local', pointer: '/field' },
    { ...local, name: 'tab', source: 'sessionStorage', pointer: '/field' },
  ], screenshots: false });
  const before = await lens.checkpoint('Two areas');
  assert.equal(before.values.local.value, 1); assert.equal(before.values.tab.value, 7);
  await page.reload(); await page.waitForFunction(() => window.fixture?.ready);
  const after = await lens.checkpoint('Same tab reloaded');
  assert.deepEqual(after.changes, []);
});

test('invalid pointers fail before any browser observation', () => {
  const page = { url() { throw new Error('Browser work must not start'); } };
  for (const pointer of [null, 1, 'field', '/bad~', '/bad~2', '/x'.repeat(33), '/' + 'あ'.repeat(700)]) {
    assert.throws(() => createStateLens(page, { probes: [{ ...local, pointer }] }), /pointer/);
  }
  assert.throws(() => createStateLens(page, { probes: [{ ...local, json: false, pointer: '/field' }] }), /json:true/);
  assert.throws(() => createStateLens(page, { probes: [{ name: 'raw', source: 'sessionStorage', key: 'draft', pointer: '' }] }), /json:true/);
});
