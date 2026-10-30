import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createStateLens, renderTimeline } from '../lens.mjs';
import { startFixture } from '../demo/fixture.mjs';

const probe = { name: 'note', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' };

async function setup(t) {
  const server = await startFixture();
  let browser;
  t.after(async () => { if (browser) await browser.close(); await server.close(); });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1080, height: 780 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(server.url); await page.waitForFunction(() => window.fixture?.ready);
  return { page, context };
}

test('nested and array Dates remain typed across reload without changing IndexedDB', async t => {
  const { page, context } = await setup(t);
  await page.evaluate(() => window.fixture.seed({ body: 'Synthetic dated note', revision: 1,
    createdAt: new Date('2026-10-01T10:20:30.456Z'), optional: undefined,
    nested: { 'a/b~c': new Date(0) }, items: [new Date(1), undefined, null] }));
  const nativeRead = () => page.evaluate(async () => {
    const v = await window.fixture.read();
    return { types: [v.createdAt, v.nested['a/b~c'], v.items[0]].map(x => Object.prototype.toString.call(x)),
      epochs: [v.createdAt.getTime(), v.nested['a/b~c'].getTime(), v.items[0].getTime()],
      optionalPresent: Object.hasOwn(v, 'optional'), optionalType: typeof v.optional,
      arrayUndefinedPresent: Object.hasOwn(v.items, 1), arrayUndefinedType: typeof v.items[1], nullValue: v.items[2] };
  });
  const before = await nativeRead();
  const lens = createStateLens(page, { probes: [probe], screenshots: false });
  const c = await lens.checkpoint('Saved dated note');
  assert.equal(c.values.note.status, 'OBSERVED');
  assert.equal(c.values.note.valueEncoding, 'json-with-type-paths-v1');
  assert.deepEqual(c.values.note.datePaths, ['/createdAt', '/items/0', '/nested/a~1b~0c']);
  assert.deepEqual(c.values.note.undefinedPaths, ['/items/1', '/optional']);
  assert.equal(c.values.note.value.createdAt, '2026-10-01T10:20:30.456Z');
  assert.deepEqual(c.values.note.value.items, ['1970-01-01T00:00:00.001Z', null, null]);
  assert.equal(c.values.note.value.nested['a/b~c'], '1970-01-01T00:00:00.000Z');
  assert.deepEqual(before.types, ['[object Date]', '[object Date]', '[object Date]']);
  assert.deepEqual(before.epochs, [1790850030456, 0, 1]);
  assert.equal(before.optionalPresent, true); assert.equal(before.optionalType, 'undefined');
  assert.equal(before.arrayUndefinedPresent, true); assert.equal(before.arrayUndefinedType, 'undefined');
  assert.equal(before.nullValue, null);
  assert.deepEqual(await nativeRead(), before);
  await page.reload(); await page.waitForFunction(() => window.fixture?.ready);
  const reloaded = await lens.checkpoint('Reloaded dated note');
  assert.deepEqual(reloaded.changes, []); assert.deepEqual(await nativeRead(), before);
  assert.equal(lens.report().schema, 4); assert.equal(lens.report().libraryVersion, '0.6.0-experimental.1');
  const viewer = await context.newPage(); await viewer.setContent(renderTimeline(lens.report()));
  assert.match(await viewer.locator('#value-note').textContent(), /datePaths.*not saved plain strings/);
  assert.match(await viewer.locator('#value-note').textContent(), /undefinedPaths.*observed undefined/);
  await viewer.getByRole('button', { name: '2. Reloaded dated note', exact: true }).click();
  assert.match(await viewer.locator('#values').textContent(), /2026-10-01T10:20:30.456Z/);
});

test('a root Date change and a Date-to-identical-ISO-string change are different observations', async t => {
  const { page } = await setup(t);
  const store = epoch => page.evaluate(async epoch => {
    const value = epoch === null ? '1970-01-01T00:00:00.001Z' : new Date(epoch);
    const tx = window.fixture.db.transaction('notes', 'readwrite'); tx.objectStore('notes').put(value, 'current');
    await new Promise(resolve => tx.oncomplete = resolve);
  }, epoch);
  const lens = createStateLens(page, { probes: [probe], screenshots: false });
  await store(0); const initial = await lens.checkpoint('Epoch zero');
  assert.deepEqual(initial.values.note.datePaths, ['']);
  assert.equal(initial.values.note.value, '1970-01-01T00:00:00.000Z');
  await store(1); const changed = await lens.checkpoint('One millisecond later');
  assert.ok(changed.changes.some(x => x.path.endsWith('.value') && x.before.endsWith('.000Z') && x.after.endsWith('.001Z')));
  await store(null); const text = await lens.checkpoint('Same ISO text stored as a string');
  assert.equal(text.values.note.value, changed.values.note.value);
  assert.equal(Object.hasOwn(text.values.note, 'datePaths'), false);
  assert.ok(text.changes.some(x => x.path.endsWith('.datePaths') && x.before[0] === '' && x.after === '(missing)'));
});

test('valid Date range endpoints stay observable; invalid Date is inconclusive and unchanged', async t => {
  const { page } = await setup(t);
  const lens = createStateLens(page, { probes: [probe], screenshots: false });
  for (const epoch of [-8640000000000000, -1, 8640000000000000, null]) {
    await page.evaluate(async epoch => {
      const tx = window.fixture.db.transaction('notes', 'readwrite');
      tx.objectStore('notes').put(new Date(epoch === null ? NaN : epoch), 'current');
      await new Promise(resolve => tx.oncomplete = resolve);
    }, epoch);
    const native = await page.evaluate(async () => { const v = await window.fixture.read(); return { isDate: v instanceof Date, invalid: Number.isNaN(v.getTime()), iso: Number.isNaN(v.getTime()) ? null : v.toISOString() }; });
    const c = await lens.checkpoint(String(epoch));
    assert.equal(native.isDate, true);
    if (epoch === null) {
      assert.equal(native.invalid, true); assert.equal(c.values.note.status, 'INCONCLUSIVE');
      assert.match(c.values.note.reason, /Date value is invalid/); assert.equal(Object.hasOwn(c.values.note, 'value'), false);
    } else {
      assert.equal(c.values.note.status, 'OBSERVED'); assert.equal(c.values.note.value, native.iso);
      assert.deepEqual(c.values.note.datePaths, ['']);
    }
    assert.equal(await page.evaluate(async () => Number.isNaN((await window.fixture.read()).getTime())), epoch === null);
  }
});

test('Date path metadata counts toward the selected-value limit', async t => {
  const { page } = await setup(t);
  const sizes = await page.evaluate(async () => {
    const value = { body: '', when: new Date(0) };
    const base = new TextEncoder().encode(JSON.stringify(value)).byteLength;
    value.body = 'x'.repeat(65535 - base);
    const projected = JSON.parse(JSON.stringify(value));
    const tx = window.fixture.db.transaction('notes', 'readwrite'); tx.objectStore('notes').put(value, 'current');
    await new Promise(resolve => tx.oncomplete = resolve);
    return { plain: new TextEncoder().encode(JSON.stringify(projected)).byteLength,
      annotated: new TextEncoder().encode(JSON.stringify({ value: projected, datePaths: ['/when'] })).byteLength };
  });
  assert.equal(sizes.plain, 65535); assert.ok(sizes.annotated > 65536);
  const c = await createStateLens(page, { probes: [probe], screenshots: false }).checkpoint('Annotation size limit');
  assert.equal(c.values.note.status, 'INCONCLUSIVE'); assert.match(c.values.note.reason, /64KiB/);
});

test('ordinary ISO text and metadata-shaped application fields are not revived as Date', async t => {
  const { page } = await setup(t);
  const value = { body: 'Synthetic', revision: 1, when: '2026-10-01T10:20:30.456Z', datePaths: ['/when'], valueEncoding: 'json-with-type-paths-v1' };
  await page.evaluate(value => window.fixture.seed(value), value);
  const c = await createStateLens(page, { probes: [probe], screenshots: false }).checkpoint('Literal application JSON');
  assert.deepEqual(c.values.note.value, value);
  assert.equal(Object.hasOwn(c.values.note, 'datePaths'), false);
  assert.equal(Object.hasOwn(c.values.note, 'valueEncoding'), false);
});

test('current renderer opens schema1 and schema2 projections without checkout-only files', async t => {
  const { context } = await setup(t);
  const oldReport = { schema: 1, title: 'Legacy scalar projection', checkpoints: [
    { label: 'Existing selected note', action: { status: 'CHECKPOINT' }, changes: [],
      values: { note: { status: 'OBSERVED', exists: true, value: { body: 'Synthetic legacy note' } } } },
  ] };
  const viewer = await context.newPage(); await viewer.setContent(renderTimeline(oldReport));
  assert.equal(await viewer.getByRole('button').count(), oldReport.checkpoints.length);
  const schema2 = { schema: 2, libraryVersion: '0.3.0-experimental.1', title: 'Preserved undefined projection', checkpoints: [
    { label: 'Existing undefined', action: { status: 'CHECKPOINT' }, changes: [], values: { note: { status: 'OBSERVED', exists: true, value: { optional: null }, valueEncoding: 'json-with-undefined-paths-v1', undefinedPaths: ['/optional'] } } },
  ] };
  // Opening another standalone report creates a new document/global scope.
  const legacyViewer = await context.newPage();
  await legacyViewer.setContent(renderTimeline(schema2));
  assert.match(await legacyViewer.locator('#value-note').textContent(), /observed undefined/);
  assert.equal((await legacyViewer.locator('#value-note').textContent()).includes('datePaths'), false);
});
