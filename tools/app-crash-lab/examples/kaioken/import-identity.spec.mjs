import { test, expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

// Independent UI regression check. No App Crash Lab runtime or storage seeding.
const base = new URL(process.env.KAIOKEN_BASE_URL ?? 'http://127.0.0.1:54670');
if (!['http:', 'https:'].includes(base.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) ||
    base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('Use a disposable loopback app origin without credentials or a path');
}
const origin = base.origin;
const baselineName = 'ACL baseline 合成 🧪';
const routine = (id, name) => ({
  id, name, date: '2026-10-01', status: 'scheduled', createdAt: 1790035200000,
  startedAt: null, endedAt: null, supps: null, bodyWeight: null, bwUnit: 'kg', exercises: [],
});
const cases = [
  { name: 'valid string ID remains usable', kind: 'control', row: routine('acl-valid-1', 'ACL valid control') },
  { name: 'numeric ID is rejected or repaired into a usable record', kind: 'numeric', row: routine(12345, 'ACL numeric ghost') },
  { name: 'object ID is rejected or repaired without an unhandled error', kind: 'object', row: routine({}, 'ACL object id') },
];

async function snapshot(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(db => db.name === 'gymlog')) {
      throw new Error('SETUP: expected the app to create gymlog');
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('gymlog');
      request.onupgradeneeded = () => {
        request.transaction.abort();
        reject(new Error('SCOPE: observer must not create or upgrade the database'));
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        let tx;
        try { tx = db.transaction(['routines', 'settings'], 'readonly'); }
        catch (error) { db.close(); reject(error); return; }
        const result = {};
        let bytes = 0;
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('SCOPE: observation aborted')); };
        for (const name of ['routines', 'settings']) {
          const store = tx.objectStore(name);
          const expectedKey = name === 'routines' ? 'id' : 'key';
          if (store.keyPath !== expectedKey || store.autoIncrement) {
            tx.abort(); return;
          }
          result[name] = [];
          const cursor = store.openCursor();
          cursor.onerror = () => tx.abort();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            const entry = { key: row.primaryKey, value: row.value };
            try { bytes += new TextEncoder().encode(JSON.stringify(entry)).length; }
            catch (error) { tx.abort(); reject(error); return; }
            if (result[name].length >= 32 || bytes > 65536) { tx.abort(); return; }
            result[name].push(entry);
            row.continue();
          };
        }
      };
    });
  });
}

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Each case owns a fresh context. A failing case must not skip the next one.
for (const scenario of cases) {
  test(scenario.name, async ({ browser }, testInfo) => {
    test.setTimeout(45000);
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const errors = [];
    const blocked = new Set();
    const evidence = { case: scenario.kind, syntheticOnly: true, sourceWrites: 'normal UI only' };
    try {
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin === origin || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
        blocked.add(url.origin);
        return route.abort('blockedbyclient');
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.name));
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.locator('#act-new').click();
      await page.locator('#in-name').fill(baselineName);
      await page.locator('#act-create').click();
      await page.locator('#act-back').click();
      await expect(page.locator('.item-name').filter({ hasText: baselineName }), 'SETUP: baseline appears once').toHaveCount(1);
      await expect.poll(async () => (await snapshot(page)).routines.length, { timeout: 10000 }).toBe(1);
      const before = await snapshot(page);
      expect(before.routines[0].value.name, 'SETUP: expected synthetic baseline').toBe(baselineName);
      expect(errors, 'SETUP: no page error before importing').toEqual([]);
      evidence.before = { routineCount: before.routines.length, sha256: hash(before) };

      await page.locator('#act-settings').click();
      await page.locator('#ta-import').fill(JSON.stringify({ routines: [scenario.row] }));
      await page.locator('#act-import').click();
      const emptyError = page.locator('#sheet').filter({ has: page.locator('.sheet-title').filter({ hasText: /^Import failed$/ }) });
      await expect(page.locator('#sheet .sheet-title'), 'SETUP: import response').toBeVisible();
      const initialTitle = await page.locator('#sheet .sheet-title').innerText();
      // A validation fix may reject before the confirmation, or at apply time.
      if (initialTitle === 'Import backup') {
        await expect(page.locator('#sheet'), 'SETUP: one incoming routine').toContainText('Adds 1 new.');
        await page.locator('#sheet-ok').click();
        await expect.poll(async () => errors.length + await page.locator('#act-settings').count() + await emptyError.count(), { timeout: 10000 }).toBeGreaterThan(0);
      } else {
        expect(initialTitle, 'SETUP: known explicit validation response').toBe('Import failed');
      }

      const after = await snapshot(page);
      const rejected = await emptyError.count() === 1;
      const accepted = await page.locator('#act-settings').count() === 1;
      evidence.importCompletion = rejected ? 'explicit-rejection' : accepted ? 'home-after-import' : 'no-completion';
      evidence.pageErrorNames = [...errors];
      evidence.after = { routineCount: after.routines.length, sha256: hash(after) };
      expect.soft(errors, 'REGRESSION: invalid IDs must not cause unhandled page errors').toEqual([]);
      expect.soft(accepted || rejected, 'REGRESSION: finish with a usable import or explicit rejection').toBe(true);
      const original = before.routines[0];
      expect.soft(after.routines.find(row => row.key === original.key), 'REGRESSION: preserve the complete existing routine and key').toEqual(original);
      expect.soft(after.settings, 'REGRESSION: this routine-only import must preserve settings').toEqual(before.settings);

      if (rejected) {
        expect.soft(scenario.kind !== 'control', 'REGRESSION: valid control must import').toBe(true);
        expect.soft(after, 'REGRESSION: rejected import must leave both stores unchanged').toEqual(before);
        await page.locator('#sheet-ok').click();
        await page.locator('#act-back').click();
        await expect.soft(page.locator('.item-name'), 'REGRESSION: rejected import keeps only the baseline in the UI').toHaveText([baselineName]);
      } else if (accepted) {
        const added = after.routines.filter(row => row.key !== original.key);
        expect.soft(added.length, 'REGRESSION: retain the incoming routine once').toBe(1);
        const saved = added[0];
        if (saved) {
          if (scenario.kind === 'control') {
            expect.soft(saved.key, 'REGRESSION: keep the valid imported string identity').toBe(scenario.row.id);
          }
          expect.soft(typeof saved.key === 'string' && saved.key.length > 0 && saved.value.id === saved.key,
            'REGRESSION: accepted routine identity must be a nonempty string matching its primary key').toBe(true);
          for (const [field, value] of Object.entries(scenario.row).filter(([key]) => key !== 'id')) {
            expect.soft(Object.hasOwn(saved.value, field) && isDeepStrictEqual(saved.value[field], value),
              `REGRESSION: keep incoming field ${field}`).toBe(true);
          }
        }
        await expect(page.getByText(scenario.row.name, { exact: true }), 'REGRESSION: imported entry is visible').toHaveCount(1);
        await page.getByText(scenario.row.name, { exact: true }).click();
        evidence.openedHeading = await page.locator('h1').allTextContents();
        expect.soft(evidence.openedHeading, 'REGRESSION: the imported entry opens its detail, not Home').toEqual([scenario.row.name]);
        if (await page.locator('#act-back').count()) await page.locator('#act-back').click();
      }

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#act-settings').waitFor({ state: 'visible' });
      const reloaded = await snapshot(page);
      evidence.reloaded = { routineCount: reloaded.routines.length, sha256: hash(reloaded) };
      evidence.completeRecordsAndKeysSurviveReload = isDeepStrictEqual(after, reloaded);
      expect.soft(reloaded, 'REGRESSION: retain all complete records and typed keys across reload').toEqual(after);
      expect.soft(reloaded.routines.find(row => row.key === original.key), 'REGRESSION: baseline survives reload').toEqual(original);
      if (accepted) {
        await page.getByText(scenario.row.name, { exact: true }).click();
        evidence.reopenedHeading = await page.locator('h1').allTextContents();
        expect.soft(evidence.reopenedHeading, 'REGRESSION: restored entry remains openable').toEqual([scenario.row.name]);
      }
      expect.soft(errors, 'REGRESSION: no unhandled error during detail opening or reload').toEqual([]);
    } finally {
      evidence.blockedOrigins = [...blocked];
      evidence.pageErrorNames = [...errors];
      // Captured records, keys, screenshots and traces are intentionally omitted.
      await testInfo.attach('identity-check-metadata', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
      await context.close();
    }
  });
}
