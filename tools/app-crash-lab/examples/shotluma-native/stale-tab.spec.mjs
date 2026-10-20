import { test, expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// A standalone test: no App Crash Lab runner, account, model or key.
const app = new URL(process.env.SHOTLUMA_URL ?? 'http://127.0.0.1:4173/');
const title = page => page.getByRole('textbox', { name: 'Project name', exact: true });
const windowMs = 1000; // Consulted source debounces auto-save by 350 ms.
test.use({ browserName: 'chromium' });

for (const mode of ['normal reload', 'current-tab rename', 'older-tab rename']) {
  test(mode, async ({ browser }, info) => {
    test.setTimeout(35000);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(app.hostname);
    expect(local ? app.protocol === 'http:' : app.origin === 'https://app.shotluma.com').toBe(true);
    expect(app.username + app.password, 'Use the app URL without credentials').toBe('');
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      storageState: { cookies: [], origins: [] }, serviceWorkers: 'block',
    });
    const dialogs = [], blocked = [];
    context.on('page', page => page.on('dialog', async dialog => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.dismiss();
    }));
    if (process.env.SHOTLUMA_HAR) {
      // Optional offline replay of an operator-owned, credential-free capture.
      await context.routeFromHAR(process.env.SHOTLUMA_HAR, { notFound: 'abort' });
    } else {
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        const allowed = url.origin === app.origin
          || ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'].includes(url.origin);
        if (req.method() === 'GET' && allowed) return route.continue();
        blocked.push({ method: req.method(), url: url.origin + url.pathname });
        return route.abort('blockedbyclient');
      });
    }
    const read = async page => {
      expect(dialogs, 'PRECONDITION: unexpected native dialog').toEqual([]);
      return page.evaluate(async () => {
        if (!(await indexedDB.databases()).some(x => x.name === 'frameflow')) {
          throw new Error('PRECONDITION: the app has not initialized its database');
        }
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('frameflow');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(['projects', 'settings', 'assets'], 'readonly');
            const projects = tx.objectStore('projects').getAll();
            const active = tx.objectStore('settings').get('activeProjectId');
            const assets = tx.objectStore('assets').count();
            tx.oncomplete = () => {
              const project = projects.result.find(x => x.id === active.result?.value);
              db.close();
              if (!project) return reject(new Error('PRECONDITION: no active saved project'));
              resolve({ project, assetCount: assets.result });
            };
            tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
          };
        });
      });
    };
    const design = state => ({
      id: state.project.id, createdAt: state.project.createdAt,
      slides: state.project.slides, uploads: state.project.uploads,
      assetCount: state.assetCount,
    });
    const elementCount = state => state.project.slides.reduce((n, s) => n + s.elements.length, 0);
    const saved = page => page.getByText('Saved locally', { exact: true }).waitFor();
    const checkpoints = { mode };
    let baseline, firstLoss;
    const watch = async page => {
      const end = performance.now() + windowMs;
      do {
        const state = await read(page);
        if (!isDeepStrictEqual(design(state), design(baseline)) && !firstLoss) {
          firstLoss = { state, observedAt: new Date().toISOString() };
        }
        await delay(75);
      } while (performance.now() < end);
    };
    try {
      const a = await context.newPage();
      checkpoints.phase = 'initial DOM navigation';
      await a.goto(app.href, { waitUntil: 'commit' });
      checkpoints.phase = 'initial saved indicator';
      await saved(a);
      checkpoints.phase = 'create blank screen';
      await a.getByRole('button', { name: 'Blank screen', exact: true }).click();
      await expect.poll(async () => (await read(a)).project.slides.length).toBe(1);
      checkpoints.initial = await read(a);
      expect(elementCount(checkpoints.initial), 'PRECONDITION: fresh empty screen').toBe(0);
      let b;
      if (mode === 'older-tab rename') {
        b = await context.newPage();
        await b.goto(app.href, { waitUntil: 'commit' });
        await saved(b);
        await expect(title(b)).toHaveValue(checkpoints.initial.project.projectName);
      }
      await a.getByRole('button', { name: /Midnight pitch/ }).click();
      await expect.poll(async () => elementCount(await read(a))).toBeGreaterThan(0);
      await saved(a);
      baseline = await read(a);
      expect(baseline.assetCount, 'This template case does not cover uploaded blobs').toBe(0);
      expect(baseline.project.uploads).toEqual([]);
      checkpoints.newerSaved = baseline;
      await watch(a);
      if (mode === 'normal reload') {
        await a.reload({ waitUntil: 'commit' });
        await saved(a);
        await watch(a);
        checkpoints.afterReload = await read(a);
      } else {
        const actor = b ?? a;
        const nextName = `ACL synthetic ${mode} — 日本語 🐾`;
        await info.attach('newer-design-saved', { body: await a.screenshot(), contentType: 'image/png' });
        await title(actor).fill(nextName);
        await title(actor).press('Tab');
        const conflict = actor.getByRole('alert').filter({ hasText: /conflict|newer|another tab|out of date|couldn.t save/i });
        await expect.poll(async () => {
          const state = await read(actor);
          if (!isDeepStrictEqual(design(state), design(baseline)) && !firstLoss) {
            firstLoss = { state, observedAt: new Date().toISOString() };
          }
          return state.project.projectName === nextName || (mode === 'older-tab rename' && await conflict.isVisible());
        }, { message: 'PRECONDITION: name commit or explicit visible conflict rejection' }).toBe(true);
        checkpoints.afterAction = await read(actor);
        checkpoints.visibleConflictRejection = await conflict.isVisible();
        if (!checkpoints.visibleConflictRejection) await saved(actor);
        await watch(actor);
        await actor.reload({ waitUntil: 'commit' });
        await saved(actor);
        await watch(actor);
        checkpoints.afterReload = await read(actor);
        await info.attach('after-action-and-reload', { body: await actor.screenshot(), contentType: 'image/png' });
      }
      expect(firstLoss, 'PRESERVATION: an observed saved design was replaced').toBeUndefined();
      expect(design(checkpoints.afterReload)).toEqual(design(baseline));
    } finally {
      await info.attach('saved-design-checkpoints', {
        body: JSON.stringify({ ...checkpoints, firstLoss, dialogs, blocked }, null, 2),
        contentType: 'application/json',
      });
      await context.close();
    }
  });
}
