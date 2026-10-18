import { test, expect, type Page } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Measured app: tbdal/Perma-Design-Kit 426ebb6. Keep the app unchanged.
// Garden data is created through the UI. IndexedDB is observed read-only.
const stores = ['plants', 'polycultures', 'gardenPlans', 'varietyLists'];
const cases = [
  { title: 'settled editor / stored deletion', path: 'editor', pending: false, check: 'store' },
  { title: 'pending editor / stored deletion', path: 'editor', pending: true, check: 'store' },
  { title: 'settled list / stored deletion', path: 'list', pending: false, check: 'store' },
  { title: 'pending list / stored deletion', path: 'list', pending: true, check: 'store' },
  { title: 'settled editor / view cleanup', path: 'editor', pending: false, check: 'view' },
  { title: 'settled list / view cleanup', path: 'list', pending: false, check: 'view' },
];
type State = { records: Record<string, any[]>; targetView: string | null };
const tile = (page: Page, id: string) => page.locator(`[data-plan-id=${JSON.stringify(id)}]`);

async function read(page: Page, id: string | null = null): Promise<State> {
  return page.evaluate(async ({ stores, id }) => {
    const name = 'permaculture-guilds';
    if (!(await indexedDB.databases()).some(db => db.name === name)) {
      throw new Error('PRECONDITION: the app has not created its database');
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error('PRECONDITION: database open failed'));
      req.onblocked = () => reject(new Error('PRECONDITION: database open blocked'));
      req.onupgradeneeded = () => { req.transaction?.abort(); reject(new Error('PRECONDITION: unexpected database creation')); };
    });
    try {
      if (!stores.every(store => db.objectStoreNames.contains(store))) throw new Error('PRECONDITION: missing store');
      const tx = db.transaction(stores, 'readonly');
      const done = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new Error('PRECONDITION: read transaction failed'));
      });
      const requests = stores.map(store => new Promise<any[]>((resolve, reject) => {
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('PRECONDITION: getAll failed'));
      }));
      const [_, ...values] = await Promise.all([done, ...requests]);
      return { records: Object.fromEntries(stores.map((store, i) => [store, values[i]])),
        targetView: id === null ? null : localStorage.getItem(`pgd-gartenplan-view-${id}`) };
    } finally { db.close(); }
  }, { stores, id });
}

const withoutTarget = (state: State, id: string) => ({ ...state.records,
  gardenPlans: state.records.gardenPlans.filter(plan => plan.id !== id) });
const hasTarget = (state: State, id: string) => state.records.gardenPlans.some(plan => plan.id === id);

test.describe.configure({ mode: 'default' });
for (const scenario of cases) {
  test(scenario.title, async ({ browser }, info) => {
    test.setTimeout(45000);
    const origin = new URL(process.env.PERMA_URL ?? info.project.use.baseURL ?? 'http://127.0.0.1:4399');
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(origin.hostname);
    expect(origin.protocol).toBe('http:');
    expect(origin.username + origin.password).toBe('');
    const context = await browser.newContext({ locale: 'de-DE',
      viewport: info.project.use.viewport ?? { width: 1400, height: 950 },
      storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      // Same display-only preferences as the app's upstream test setup.
      localStorage.setItem('pdk-welcome-seen', '1');
      localStorage.setItem('pdk-persist-later', String(Date.now()));
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin.origin && !['data:', 'blob:'].includes(url.protocol)) return route.abort();
      if (/^\/(api|geo)\//.test(url.pathname)) return route.fulfill({ status: 404, body: '' });
      return route.continue();
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const checkpoints: Record<string, any> = {};
    const dialogs: { type: string; message: string; accepted: boolean }[] = [];
    let expectedDialog: { type: string; message: string } | null = null;
    let id = ''; // Only retained as empty in diagnostics if setup fails before saving.
    let firstResurrection: State | null = null;
    let firstCollateralLoss: State | null = null;
    let firstOrphanView: { phase: string; value: string } | null = null;
    let viewCheckActive = false;
    const remember = (state: State, phase: string) => {
      if (hasTarget(state, id) && !firstResurrection) firstResurrection = state;
      if (!isDeepStrictEqual(withoutTarget(state, id), withoutTarget(checkpoints.baseline, id)) && !firstCollateralLoss) {
        firstCollateralLoss = state;
      }
      if (viewCheckActive && state.targetView !== null && firstOrphanView === null) {
        firstOrphanView = { phase, value: state.targetView };
      }
    };
    page.on('dialog', async dialog => {
      const accepted = expectedDialog?.type === dialog.type() && dialog.message().includes(expectedDialog.message);
      dialogs.push({ type: dialog.type(), message: dialog.message(), accepted });
      expectedDialog = null;
      if (accepted) await dialog.accept(); else await dialog.dismiss();
    });
    const shot = async (name: string) => {
      const path = info.outputPath(`${name}.png`); await page.screenshot({ path });
      await info.attach(name, { path, contentType: 'image/png' });
    };
    try {
      await test.step('Create a real UI plan, plant and retained sibling', async () => {
        await page.goto(new URL('/', origin).href);
        await page.locator('#data-menu > summary').click();
        expectedDialog = { type: 'alert', message: '2 Beispielpflanzen importiert' };
        await page.locator('#btn-load-samples').click();
        await expect(page.locator('#plant-list [data-id]')).toHaveCount(2);
        expect((await read(page)).records.plants).toHaveLength(2);
        await page.goto(new URL('/gartenplan/', origin).href);
        await page.locator('#btn-new-plan').click();
        await page.locator('#g-name').fill('Synthetic deletion target');
        await page.locator('input[name="draw-mode"][value="grid"]').check();
        await page.locator('#btn-start-drawing').click();
        const box = await page.locator('#drawing-svg').boundingBox();
        expect(box, 'PRECONDITION: drawing canvas').not.toBeNull();
        for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]) {
          await page.mouse.click(box!.x + box!.width * x, box!.y + box!.height * y);
        }
        await page.locator('#btn-finish-boundary').click();
        await expect(page.locator('#phase-b')).not.toHaveClass(/hidden/);
        await page.locator('#plant-picker [data-picker-plant]').first().click();
        const canvas = await page.locator('#plan-svg').boundingBox();
        expect(canvas, 'PRECONDITION: plan canvas').not.toBeNull();
        await page.mouse.click(canvas!.x + canvas!.width / 2, canvas!.y + canvas!.height / 2);
        await expect(page.locator('#plan-markers [data-placement-id]')).toHaveCount(1);
        await page.locator('#btn-save-plan').click();
        await expect(page.locator('#plan-list-view')).toBeVisible();
        await delay(1100); // settle the original 500ms autosave and 700ms view timer
        const saved = await read(page);
        expect(saved.records.gardenPlans).toHaveLength(1);
        id = saved.records.gardenPlans[0].id;
        expect(typeof id, 'PRECONDITION: app-generated plan ID').toBe('string');
        expect(id.length, 'PRECONDITION: nonempty saved ID').toBeGreaterThan(0);
        expect(saved.records.gardenPlans[0].placements).toHaveLength(1);
        await tile(page, id).locator('[data-plan-action="duplicate"]').click();
        await expect.poll(async () => (await read(page)).records.gardenPlans.length).toBe(2);
        await page.reload();
        await expect(tile(page, id)).toBeVisible();
        await tile(page, id).locator('h3 > span').click();
        await expect(page.locator('#plan-markers [data-placement-id]')).toHaveCount(1);
        await page.locator('#tool-select').click();
        await delay(1100);
        checkpoints.baseline = await read(page, id);
        expect(checkpoints.baseline.records.gardenPlans).toHaveLength(2);
        expect(checkpoints.baseline.targetView, 'PRECONDITION: an actual view exists before deletion').not.toBeNull();
        if (scenario.title === 'pending editor / stored deletion') await shot('before-pending-delete');
      });
      let pointerUpNotBefore = 0;
      await test.step('Actually move the plant, then delete through the requested path', async () => {
        const marker = page.locator('#plan-markers [data-placement-id]').first();
        const before = await marker.getAttribute('transform');
        const box = await marker.boundingBox();
        expect(box, 'PRECONDITION: visible plant').not.toBeNull();
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await page.mouse.down();
        await page.mouse.move(box!.x + box!.width / 2 + 24, box!.y + box!.height / 2 + 12, { steps: 3 });
        pointerUpNotBefore = performance.now();
        await page.mouse.up();
        expect(await marker.getAttribute('transform'), 'PRECONDITION: the plant really moved').not.toBe(before);
        if (!scenario.pending) {
          const old = checkpoints.baseline.records.gardenPlans.find((p: any) => p.id === id).placements;
          await expect.poll(async () => {
            const plan = (await read(page, id)).records.gardenPlans.find(p => p.id === id);
            return plan && !isDeepStrictEqual(plan.placements, old);
          }, { message: 'PRECONDITION: moved plant was saved normally' }).toBe(true);
          await delay(1100);
        }
        expectedDialog = { type: 'confirm', message: 'Synthetic deletion target' };
        if (scenario.path === 'list') {
          await page.locator('#btn-back-to-list').click();
          await tile(page, id).locator('[data-plan-action="delete"]').click();
        } else await page.locator('#btn-delete-plan').click();
        const deadline = performance.now() + 2000;
        do {
          const state = await read(page, id);
          if (!hasTarget(state, id)) { checkpoints.firstAbsent = state; break; }
          await delay(15);
        } while (performance.now() < deadline);
        expect(checkpoints.firstAbsent, 'PRECONDITION: actual deletion must commit').toBeDefined();
        checkpoints.deletionAfterPointerUpUpperBoundMs = performance.now() - pointerUpNotBefore;
        if (scenario.pending) expect(checkpoints.deletionAfterPointerUpUpperBoundMs,
          'PRECONDITION: deletion must commit before the original 500ms autosave').toBeLessThan(500);
        expect(dialogs.filter(d => d.type === 'confirm' && d.accepted)).toHaveLength(1);
        remember(checkpoints.firstAbsent, 'first committed absence');
        if (scenario.check === 'view') {
          // Start the view assertion after the handler's visible completion,
          // not between the IDB delete and its following synchronous cleanup.
          await expect(page.locator('#plan-list-view')).toBeVisible();
          await expect(tile(page, id)).toHaveCount(0);
          viewCheckActive = true;
          checkpoints.completedUiDelete = await read(page, id);
          remember(checkpoints.completedUiDelete, 'completed UI deletion');
        }
      });
      await test.step('Keep the deleted ID absent and preserve every retained record', async () => {
        const until = performance.now() + 1200;
        do {
          const state = await read(page, id);
          remember(state, 'after deletion');
          await delay(40);
        } while (performance.now() < until);
        checkpoints.afterWindow = await read(page, id);
        remember(checkpoints.afterWindow, 'final window sample');
        await page.reload();
        await expect(page.locator('#plan-list-view')).toBeVisible();
        checkpoints.afterReload = await read(page, id);
        remember(checkpoints.afterReload, 'after reload');
        if (scenario.title === 'pending editor / stored deletion') await shot('after-deletion-and-reload');
        expect(firstCollateralLoss, 'PRESERVATION: an unrelated complete record changed').toBeNull();
        expect(withoutTarget(checkpoints.afterReload, id)).toEqual(withoutTarget(checkpoints.baseline, id));
        expect(firstResurrection, 'DELETED_RECORD_REAPPEARED: a delayed write restored the deleted ID').toBeNull();
        expect(hasTarget(checkpoints.afterReload, id), 'DELETED_RECORD_REAPPEARED: deleted ID survived reload').toBe(false);
        if (scenario.check === 'view') expect(firstOrphanView,
          'ORPHAN_VIEW_KEY: view state remained after completed deletion').toBeNull();
        expect(dialogs.filter(d => !d.accepted), 'PRECONDITION: unexpected native dialog').toEqual([]);
        expect(pageErrors, 'PRECONDITION: uncaught application error').toEqual([]);
      });
    } finally {
      await info.attach('deletion-checkpoints', { body: JSON.stringify({ scenario, id, checkpoints,
        firstResurrection, firstCollateralLoss, firstOrphanView, dialogs, pageErrors,
        scope: 'Chromium local static public build; not iOS standalone, bfcache, private expert mode, or backup import.' }, null, 2), contentType: 'application/json' });
      await context.close();
    }
  });
}
