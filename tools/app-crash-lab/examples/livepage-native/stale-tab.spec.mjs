import { test, expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// ADAPT 1: disposable local app URL, saved envelope and its complete protected value.
const app = new URL(process.env.LIVEPAGE_URL ?? 'http://127.0.0.1:54194/try');
const key = 'livepage-page-storage';
const title = page => page.getByRole('textbox', { name: 'Page title', exact: true });
const savedTitle = state => state?.componentTree?.[0]?.attributes?.title;
const windowMs = 1000; // LivePage's measured autosave debounce is 500 ms.

for (const mode of ['same-tab control', 'new-tab control', 'earlier-tab regression']) {
  test(mode, async ({ browser }, info) => {
    test.setTimeout(35000);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(app.hostname);
    expect(app.protocol).toBe('http:');
    expect(app.username + app.password, 'Use a local URL without credentials').toBe('');
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] }, serviceWorkers: 'block',
    });
    const dialogs = [];
    context.on('page', page => page.on('dialog', async dialog => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      await dialog.dismiss();
    }));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === app.origin || ['data:', 'blob:'].includes(url.protocol)
        ? route.continue() : route.abort();
    });
    // ADAPT 2: this read is one atomic, read-only snapshot, never a storage write.
    const read = async page => {
      expect(dialogs, 'PRECONDITION: unexpected dialog; this test does not handle it').toEqual([]);
      return page.evaluate(key => {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      }, key);
    };
    const checkpoints = {};
    let firstLoss;
    let baseline;
    const remember = (state, phase) => {
      if (!isDeepStrictEqual(state?.componentTree, baseline.componentTree) && !firstLoss) {
        firstLoss = { phase, state };
      }
    };
    const watch = async (page, check) => {
      const end = performance.now() + windowMs;
      do {
        check(await read(page));
        await delay(75);
      } while (performance.now() < end);
      check(await read(page));
    };
    const primary = await context.newPage();
    const initialTitle = 'Initial saved page — 日本語 🐾';
    const editedTitle = 'Later saved page — keep the complete row';
    const saveTitle = async (page, value) => {
      await title(page).fill(value);
      await title(page).press('Enter');
      await expect.poll(async () => savedTitle(await read(primary)), {
        message: 'PRECONDITION: title must actually be saved', timeout: 10000,
      }).toBe(value);
    };
    const openPeer = async expectedTitle => {
      const peer = await context.newPage();
      await peer.goto(app.href);
      await expect(title(peer), 'PRECONDITION: peer hydrated the saved page').toHaveValue(expectedTitle);
      return peer;
    };
    try {
      await test.step('Save and reload a non-default initial page', async () => {
        await primary.goto(app.href);
        await saveTitle(primary, initialTitle);
        const initial = await read(primary);
        expect(initial.componentTree[0].children, 'PRECONDITION: disposable empty page').toHaveLength(0);
        await watch(primary, state => expect(state).toEqual(initial));
        await primary.reload();
        await expect(title(primary)).toHaveValue(initialTitle);
        expect(await read(primary)).toEqual(initial);
        checkpoints.initial = initial;
      });
      let peer;
      if (mode === 'earlier-tab regression') peer = await openPeer(initialTitle);
      await test.step('Save the primary edit before the peer action', async () => {
        // ADAPT 3: ordinary UI actions must create a distinguishable saved change.
        await primary.getByRole('button', { name: 'Add Row', exact: true }).click();
        await saveTitle(primary, editedTitle);
        baseline = await read(primary);
        expect(baseline.componentTree[0].children, 'PRECONDITION: row is saved').toHaveLength(1);
        expect(baseline.componentTree).not.toEqual(checkpoints.initial.componentTree);
        expect(baseline.toolbarMinimized, 'PRECONDITION: peer commit starts false').toBe(false);
        await watch(primary, state => expect(state).toEqual(baseline));
        checkpoints.primarySaved = baseline;
      });
      if (mode === 'new-tab control') peer = await openPeer(editedTitle);
      // Do not require the old peer UI to stay stale: a live-sync fix is valid.
      const actor = peer ?? primary;
      await test.step('Confirm a real, disjoint peer save and observe preservation', async () => {
        expect(await read(primary), 'PRECONDITION: baseline still saved before action').toEqual(baseline);
        // ADAPT 4: the peer changes another persisted field, outside the protected tree.
        await actor.getByRole('button', { name: 'Minimize', exact: true }).click();
        await expect.poll(async () => {
          const state = await read(primary);
          remember(state, 'waiting for peer commit');
          if (state?.toolbarMinimized === true) checkpoints.peerCommitted = state;
          return state?.toolbarMinimized;
        }, { message: 'PRECONDITION: peer must persist false → true', timeout: 10000 }).toBe(true);
        await watch(primary, state => {
          remember(state, 'after peer commit');
          expect(state?.toolbarMinimized, 'Peer commit must remain saved').toBe(true);
        });
      });
      await test.step('Reload the primary and compare the complete protected tree', async () => {
        await primary.reload();
        await expect(title(primary)).toBeVisible();
        await watch(primary, state => {
          remember(state, 'after primary reload');
          expect(state?.toolbarMinimized, 'Peer commit must survive reload').toBe(true);
        });
        checkpoints.afterReload = await read(primary);
        // A later repair cannot erase a loss observed earlier in the window.
        expect(firstLoss, 'PRESERVATION: an observed saved tree changed').toBeUndefined();
        expect(checkpoints.afterReload.componentTree).toEqual(baseline.componentTree);
        await expect(title(primary)).toHaveValue(editedTitle);
      });
    } finally {
      await info.attach('saved-state-checkpoints', {
        body: JSON.stringify({ mode, checkpoints, firstLoss, dialogs }, null, 2),
        contentType: 'application/json',
      });
      await context.close();
    }
  });
}
