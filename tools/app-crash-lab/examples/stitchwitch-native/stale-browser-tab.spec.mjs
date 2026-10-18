import { test, expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Source measured: carinaruut/stitchwitch f31655c3. No App Crash Lab dependency.
// Only the deliberately renamed pattern.name is outside the protected document.
const protectedValue = document => {
  if (!document?.pattern) return null;
  const { name, ...pattern } = document.pattern;
  return { ...document, pattern };
};
const nameInput = page => page.getByRole('textbox', { name: 'Project name', exact: true });
const firstCell = page => page.getByRole('gridcell').first();
const windowMs = 1000; // The measured app's autosave debounce is 300 ms.
test.describe.configure({ mode: 'default' });

for (const mode of ['same-tab control', 'fresh-peer control', 'earlier-peer regression', 'fresh-peer reload regression']) {
  test(mode, async ({ browser }, info) => {
    test.setTimeout(35000);
    const app = new URL('/#/', process.env.STITCHWITCH_URL ?? info.project.use.baseURL ?? 'http://127.0.0.1:4173');
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(app.hostname);
    expect(app.protocol).toBe('http:');
    expect(app.username + app.password).toBe('');
    const context = await browser.newContext({
      locale: 'en-US', viewport: info.project.use.viewport ?? { width: 1280, height: 900 },
      storageState: { cookies: [], origins: [] }, serviceWorkers: 'block',
    });
    const expectedReload = new Set();
    const dialogs = [];
    context.on('page', page => page.on('dialog', async dialog => {
      const accepted = dialog.type() === 'beforeunload' && expectedReload.has(page);
      dialogs.push({ type: dialog.type(), message: dialog.message(), accepted });
      if (accepted) await dialog.accept();
      else await dialog.dismiss();
    }));
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === app.origin || ['data:', 'blob:'].includes(url.protocol)
        ? route.continue() : route.abort();
    });
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      if (url.origin === app.origin) socket.connectToServer();
      else socket.close();
    });
    const primary = await context.newPage();
    const checkpoints = {};
    const capture = async (page, name) => {
      const path = info.outputPath(`${name}.png`);
      await page.screenshot({ path });
      await info.attach(name, { path, contentType: 'image/png' });
    };
    let key;
    let baseline;
    let firstLoss;
    const read = page => page.evaluate(key => {
      const raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    }, key);
    const observe = async check => {
      const end = performance.now() + windowMs;
      do { check(await read(primary)); await delay(75); } while (performance.now() < end);
      check(await read(primary));
    };
    const remember = (document, phase) => {
      if (!isDeepStrictEqual(protectedValue(document), protectedValue(baseline)) && !firstLoss) {
        firstLoss = { phase, document };
      }
    };
    const reload = async page => {
      expectedReload.add(page);
      try { await page.reload(); await expect(nameInput(page)).toBeVisible(); }
      finally { expectedReload.delete(page); }
    };
    const rename = async (page, name) => {
      await nameInput(page).fill(name);
      await nameInput(page).blur();
      await expect.poll(async () => (await read(primary))?.pattern.name, {
        message: 'PRECONDITION: the name-only action must actually commit', timeout: 10000,
      }).toBe(name);
      await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
    };
    const initialName = 'Initial chart — 日本語';
    const peerName = `Name-only save / ${mode}`;
    const openPeer = async expectedColor => {
      const peer = await context.newPage();
      await peer.goto(app.href);
      await expect(nameInput(peer)).toHaveValue(initialName);
      await expect(firstCell(peer)).toHaveAttribute('aria-label', new RegExp(expectedColor, 'i'));
      // Wait for this peer's own startup autosave before editing the primary.
      await expect(peer.getByText('Saved locally', { exact: true })).toBeVisible();
      expect(await peer.evaluate(() => JSON.parse(localStorage.getItem('stitch-project-tabs-v1')).activeProjectId))
        .toBe(key.slice('stitch-project-autosave:'.length));
      return peer;
    };
    try {
      await test.step('Save and reload an identifiable, unchanged initial chart', async () => {
        await primary.goto(app.href);
        await expect(nameInput(primary)).toBeVisible();
        const id = await primary.evaluate(() => JSON.parse(localStorage.getItem('stitch-project-tabs-v1')).activeProjectId);
        expect(typeof id).toBe('string');
        key = `stitch-project-autosave:${id}`;
        await rename(primary, initialName);
        checkpoints.initial = await read(primary);
        expect(checkpoints.initial.pattern.cells).toHaveLength(20);
        expect(checkpoints.initial.pattern.cells[0]).toHaveLength(20);
        await reload(primary);
        await expect(nameInput(primary)).toHaveValue(initialName);
        await expect(primary.getByText('Saved locally', { exact: true })).toBeVisible();
        await observe(document => expect(document).toEqual(checkpoints.initial));
      });
      const oldColor = checkpoints.initial.pattern.cells[0][0];
      let peer;
      if (mode === 'earlier-peer regression') peer = await openPeer(oldColor);
      await test.step('Persist an actual grid edit before the name-only action', async () => {
        await firstCell(primary).press('f'); // App's documented Fill shortcut.
        await firstCell(primary).click();
        await expect.poll(async () => {
          const cells = (await read(primary))?.pattern.cells;
          return cells?.flat().length === 400 && cells.flat().every(color => color === '#7c3aed');
        }).toBe(true);
        await expect(primary.getByText('Saved locally', { exact: true })).toBeVisible();
        baseline = await read(primary);
        expect(protectedValue(baseline)).not.toEqual(protectedValue(checkpoints.initial));
        await observe(document => expect(document).toEqual(baseline));
        checkpoints.primarySaved = baseline;
        if (mode === 'earlier-peer regression') await capture(primary, 'primary-saved-grid');
      });
      if (mode.startsWith('fresh-peer')) peer = await openPeer(baseline.pattern.cells[0][0]);
      const actor = peer ?? primary;
      await test.step('Commit a disjoint rename and latch any protected-document loss', async () => {
        expect(await read(primary)).toEqual(baseline);
        await nameInput(actor).fill(peerName);
        await nameInput(actor).blur();
        await expect.poll(async () => {
          const document = await read(primary);
          remember(document, 'waiting for the peer rename');
          if (document?.pattern.name === peerName) checkpoints.peerCommitted = document;
          return document?.pattern.name;
        }, { message: 'PRECONDITION: confirm the name-only save committed', timeout: 10000 }).toBe(peerName);
        await observe(document => {
          remember(document, 'after the peer rename');
          expect(document?.pattern.name).toBe(peerName);
        });
        if (mode === 'earlier-peer regression') await capture(actor, 'peer-after-name-only-save');
      });
      await test.step('Observe reload without erasing an earlier loss', async () => {
        // This app flushes on pagehide: a later repair must not hide an earlier rollback.
        await reload(primary);
        await expect(primary.getByText('Saved locally', { exact: true })).toBeVisible();
        await observe(document => remember(document, 'after primary reload'));
        checkpoints.afterReload = await read(primary);
        expect(dialogs.filter(dialog => !dialog.accepted), 'PRECONDITION: unexpected dialog').toEqual([]);
        expect(firstLoss?.phase, 'PRESERVATION: a name-only save replaced another saved field').toBeUndefined();
        expect(protectedValue(checkpoints.afterReload)).toEqual(protectedValue(baseline));
        if (mode === 'fresh-peer reload regression') {
          expect(checkpoints.afterReload.pattern.name, 'RELOAD_RENAME: reloading an older primary undid the peer name').toBe(peerName);
        }
      });
    } finally {
      await info.attach('saved-document-checkpoints', {
        body: JSON.stringify({ mode, key, checkpoints, firstLoss, dialogs,
          scope: 'All fields except deliberately edited pattern.name are protected in every case; fresh-peer reload regression also checks the committed name after primary reload.' }, null, 2),
        contentType: 'application/json',
      });
      await context.close();
    }
  });
}
