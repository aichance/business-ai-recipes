import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.use({ locale: 'en-US', serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });

const PIN = 'b4a7a592c7e09cf97d9ee348a23105c10a9857a9';
const DB = 'osw-studio-db';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVR4nGNgaPj/nyI8asCoAaMGDBcDAIHifh+5bmkmAAAAAElFTkSuQmCC', 'base64');
const FILE_TEXT = 'Synthetic primary-tab save. No private data.\n';

async function appReady(page) {
  const disable = page.getByRole('button', { name: 'Disable analytics', exact: true });
  await expect(page.getByRole('heading', { name: /^(Anonymous Usage Analytics|Projects|Dashboard)$/ }).first()).toBeVisible({ timeout: 30000 });
  if (await disable.isVisible()) await disable.click();
  await expect(page.getByRole('heading', { name: /^(Projects|Dashboard)$/ }).first()).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveTitle('OSW Studio');
}

async function boot(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await appReady(page);
  if (await page.getByRole('heading', { name: 'Dashboard', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Projects', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const notNow = page.getByRole('button', { name: 'Not now', exact: true });
  if (await notNow.isVisible()) await notNow.click();
  await page.locator('button:has(svg.lucide-layout-grid)').click();
}

async function idle(page) {
  await expect.poll(() => page.evaluate(() => window.__crashlabTransactions.pending),
    { message: 'PRECONDITION: real application IndexedDB transactions must settle' }).toBe(0);
}

async function records(page, projectId) {
  return page.evaluate(async ({ name, projectId }) => {
    if (!(await indexedDB.databases()).some(d => d.name === name)) throw new Error('PRECONDITION: application database missing');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onupgradeneeded = () => { req.transaction.abort(); reject(new Error('PRECONDITION: do not create a missing database')); };
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    try {
      const stores = ['projects', 'files', 'fileTree', 'checkpoints'];
      if (!stores.every(s => db.objectStoreNames.contains(s))) throw new Error('PRECONDITION: required stores missing');
      const all = await new Promise((resolve, reject) => {
        const tx = db.transaction(stores, 'readonly');
        const result = {};
        for (const s of stores) {
          const req = tx.objectStore(s).getAll();
          req.onsuccess = () => { result[s] = req.result; };
        }
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error);
        tx.onerror = () => reject(tx.error);
      });
      const project = projectId ? all.projects.find(p => p.id === projectId) : undefined;
      const out = { project, projects: all.projects, files: [], fileTree: [], checkpoints: [] };
      for (const s of ['files', 'fileTree', 'checkpoints']) {
        out[s] = all[s].filter(x => x.projectId === projectId).sort((a, b) => a.id.localeCompare(b.id));
      }
      return JSON.parse(JSON.stringify(out, (_, v) => v instanceof ArrayBuffer
        ? { type: 'ArrayBuffer', bytes: Array.from(new Uint8Array(v)) } : v));
    } finally { db.close(); }
  }, { name: DB, projectId });
}

async function rename(page, oldName, newName) {
  const heading = page.getByRole('heading', { level: 3, name: oldName, exact: true });
  await heading.locator('..').getByRole('button').first().click();
  const field = page.locator('input[maxlength="50"]');
  await expect(field).toHaveCount(1);
  await expect(field).toHaveValue(oldName);
  await field.fill(newName);
  await page.locator('button:has(svg.lucide-check)').click();
  await expect(page.getByRole('heading', { level: 3, name: newName, exact: true })).toBeVisible();
  await idle(page);
}

async function upload(page, button, payload) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(payload);
}

function protectedProject(p) {
  const { previewImage, previewUpdatedAt, updatedAt, ...unchanged } = p;
  return unchanged;
}

test.beforeEach(async ({ context, baseURL }) => {
  if (typeof baseURL !== 'string') throw new Error('PRECONDITION: configure loopback APP_URL as baseURL');
  const url = new URL(baseURL);
  if (url.protocol !== 'http:' || url.username || url.password) throw new Error('PRECONDITION: credential-free loopback HTTP required');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('PRECONDITION: loopback APP_URL required');
  await context.route('**/*', route => {
    const target = new URL(route.request().url());
    return target.origin === url.origin || ['data:', 'blob:'].includes(target.protocol)
      ? route.continue() : route.abort();
  });
  // Observe real transactions; never supply data, alter a write, or force completion.
  await context.addInitScript(() => {
    window.__crashlabTransactions = { pending: 0, completed: 0, aborted: 0 };
    const native = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = native.apply(this, args);
      if (this.name !== 'osw-studio-db') return tx;
      const state = window.__crashlabTransactions;
      state.pending++;
      tx.addEventListener('complete', () => { state.pending--; state.completed++; }, { once: true });
      tx.addEventListener('abort', () => { state.pending--; state.aborted++; }, { once: true });
      return tx;
    };
  });
});

for (const mode of ['same tab', 'fresh peer', 'earlier peer']) {
  test(`${mode}: thumbnail-only update preserves saved project`, async ({ page, context }, info) => {
    const initialName = { 'same tab': 'CRASHLAB-same', 'fresh peer': 'CRASHLAB-new', 'earlier peer': 'CRASHLAB-old' }[mode];
    const savedName = initialName + '-SAVED';
    const pageErrors = [];
    const unexpectedDialogs = [];
    const observe = watched => {
      watched.on('pageerror', e => pageErrors.push(String(e)));
      watched.on('dialog', async dialog => {
        unexpectedDialogs.push({ type: dialog.type(), message: dialog.message() });
        await dialog.dismiss();
      });
    };
    observe(page);
    context.on('page', observe);
    await boot(page);
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(initialName);
    await page.getByRole('textbox', { name: 'Description (optional)', exact: true }).fill('Synthetic local fixture');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Back to Projects', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Projects', exact: true }).click();
    await page.locator('button:has(svg.lucide-layout-grid)').click();
    await expect(page.getByRole('heading', { level: 3, name: initialName, exact: true })).toBeVisible();
    await idle(page);
    const created = await records(page);
    const matches = created.projects.filter(p => p.name === initialName);
    expect(matches, 'PRECONDITION: exactly one synthetic project').toHaveLength(1);
    const id = matches[0].id;
    let target = page;
    if (mode === 'earlier peer') {
      target = await context.newPage();
      await boot(target);
      await expect(target.getByRole('heading', { level: 3, name: initialName, exact: true })).toBeVisible();
      await idle(target);
    }

    // A real file upload and manual Save establish a new durable checkpoint.
    await page.getByRole('heading', { level: 3, name: initialName, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Upload Files', exact: true })).toBeVisible();
    await upload(page, 'Upload Files', { name: 'crashlab-proof.txt', mimeType: 'text/plain', buffer: Buffer.from(FILE_TEXT) });
    await expect.poll(async () => (await records(page, id)).files.some(f => f.path.endsWith('/crashlab-proof.txt') && f.content === FILE_TEXT),
      { message: 'PRECONDITION: primary uploaded file must be persisted' }).toBe(true);
    const save = page.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await idle(page);
    const saved = await records(page, id);
    expect(saved.project.lastSavedCheckpointId, 'PRECONDITION: manual Save must establish checkpoint pointer').toBeTruthy();
    expect(saved.checkpoints.some(c => c.id === saved.project.lastSavedCheckpointId), 'PRECONDITION: saved checkpoint must really exist').toBe(true);
    await page.getByRole('button', { name: 'Back to Projects', exact: true }).click();
    await page.locator('button:has(svg.lucide-layout-grid)').click();
    await rename(page, initialName, savedName);
    if (mode === 'fresh peer') {
      target = await context.newPage();
      await boot(target);
      await expect(target.getByRole('heading', { level: 3, name: savedName, exact: true })).toBeVisible();
      await idle(target);
    }
    const before = await records(page, id);
    expect(before.project.name, 'PRECONDITION: new name must be persisted before thumbnail change').toBe(savedName);
    expect(before.project.previewImage, 'PRECONDITION: synthetic project starts without a thumbnail').toBeFalsy();
    await page.screenshot({ path: info.outputPath('primary-saved.png'), fullPage: true });
    const targetHeadings = await target.getByRole('heading', { level: 3 }).allTextContents();
    await upload(target, 'Upload image', { name: 'crashlab-blue.png', mimeType: 'image/png', buffer: PNG });
    await expect.poll(async () => (await records(page, id)).project.previewImage ?? '',
      { message: 'PRECONDITION: thumbnail change must really persist' }).toMatch(/^data:image\//);
    await idle(target);
    const after = await records(page, id);
    await fs.writeFile(info.outputPath('before-reload.json'), JSON.stringify({ before, after, url: target.url() }, null, 2));
    await expect(target.locator('img[src^="data:image/"]')).toHaveAttribute('src', after.project.previewImage);
    await target.screenshot({ path: info.outputPath('after-thumbnail.png'), fullPage: true });
    await target.reload({ waitUntil: 'domcontentloaded' });
    // Reload legitimately opens Dashboard when a project exists. Read persisted
    // state there, before selecting/opening the project could repair its save state.
    await appReady(target);
    await idle(target);
    const reloaded = await records(target, id);

    const observation = { sourcePin: PIN, mode, projectId: id, targetHeadingsBeforeUpload: targetHeadings,
      expectedName: savedName, actualName: after.project.name, expectedSavedCheckpoint: before.project.lastSavedCheckpointId,
      actualSavedCheckpoint: after.project.lastSavedCheckpointId ?? null,
      changedFields: [...new Set([...Object.keys(before.project), ...Object.keys(after.project)])].filter(k => JSON.stringify(before.project[k]) !== JSON.stringify(after.project[k])),
      savedFileStillPresent: after.files.some(f => f.path.endsWith('/crashlab-proof.txt') && f.content === FILE_TEXT),
      pageErrors, unexpectedDialogs };
    await fs.writeFile(info.outputPath('observation.json'), JSON.stringify(observation, null, 2));
    await fs.writeFile(info.outputPath('snapshots.json'), JSON.stringify({ before, after, reloaded }, null, 2));
    console.log(JSON.stringify(observation));
    expect(unexpectedDialogs, 'PRECONDITION: no unexpected native dialog is accepted').toEqual([]);
    expect.soft(after.project.name, 'PRESERVATION: thumbnail-only operation must retain the saved name').toBe(savedName);
    expect.soft(protectedProject(after.project), 'PRESERVATION: all unrelated project fields, including saved checkpoint, remain').toEqual(protectedProject(before.project));
    expect.soft(after.files).toEqual(before.files);
    expect.soft(after.fileTree).toEqual(before.fileTree);
    expect.soft(after.checkpoints).toEqual(before.checkpoints);
    expect.soft(protectedProject(reloaded.project)).toEqual(protectedProject(before.project));
    expect.soft(reloaded.files).toEqual(before.files);
    expect.soft(reloaded.fileTree).toEqual(before.fileTree);
    expect.soft(reloaded.checkpoints).toEqual(before.checkpoints);
    expect.soft(reloaded.project.previewImage).toBe(after.project.previewImage);
  });
}
