import { test, expect } from '@playwright/test';

const base = new URL(process.env.CHALKY_BASE_URL || 'http://127.0.0.1:54196');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('CHALKY_BASE_URL must be a loopback HTTP origin.');
}
const origin = base.origin;
const noteSelector = '[aria-label="Task details"] [contenteditable="true"]';

async function readTasks(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('chalky');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('tasks').objectStore('tasks').getAll();
      request.onsuccess = () => { resolve(request.result); db.close(); };
      request.onerror = () => { reject(request.error); db.close(); };
    };
  }));
}

async function begin(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort());
  await page.goto(origin);
  await page.getByRole('button', { name: "Let's-a go!", exact: true }).click();
  const add = page.locator('section.col[data-day="__someday__"] textarea[placeholder="Add task"]');
  await add.fill('ACL explicit commit sample');
  await add.press('Enter');
  await expect.poll(async () => (await readTasks(page)).length).toBe(1);
}

async function openNote(page) {
  await page.locator('.task .chip').click();
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
  return page.locator(noteSelector);
}

async function leaveNote(page, path) {
  if (path === 'close') await page.getByRole('button', { name: 'Close', exact: true }).click();
  if (path === 'escape') await page.locator(noteSelector).press('Escape');
  if (path === 'blur') await page.locator('[aria-label="Task details"] textarea.title').click();
  if (path !== 'blur') await expect(page.locator('[aria-label="Task details"]')).toBeHidden();
}

for (const path of ['close', 'escape', 'blur']) {
  for (const delay of [0, 350]) {
    test(`${path}: last edit survives with ${delay}ms added`, async ({ page }, info) => {
      await begin(page);
      let note = await openNote(page);
      await note.fill('Synthetic baseline');
      // Establish the baseline before testing the final edit's commit boundary.
      await page.waitForTimeout(350);
      await leaveNote(page, 'close');
      note = await openNote(page);
      await expect(note).toHaveText('Synthetic baseline');
      await note.press('ControlOrMeta+A');
      await note.press('x');
      const started = Date.now();
      await expect(note).toHaveText('x');
      if (delay) await page.waitForTimeout(delay);
      await leaveNote(page, path);
      const elapsedMs = Date.now() - started;
      // Read persisted bytes at the tested boundary, before another close can
      // accidentally rescue a failed blur commit.
      const persisted = (await readTasks(page))[0].notes;
      if (path === 'blur') await leaveNote(page, 'close');
      note = await openNote(page);
      const reopened = await note.textContent();
      await page.reload();
      note = await openNote(page);
      const reloaded = await note.textContent();
      const result = { path, delay, elapsedMs, persisted, reopened, reloaded };
      console.log(JSON.stringify(result));
      await info.attach('commit-boundary', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
      await page.screenshot({ path: info.outputPath('after-reload.png') });
      expect(persisted.trim()).toBe('x');
      expect(reopened).toBe('x');
      expect(reloaded).toBe('x');
    });
  }

  test(`${path}: untouched raw markdown and metadata remain byte-exact`, async ({ page }, info) => {
    await begin(page);
    const raw = '**a *b* c**'; // Intentionally lacks the serializer's trailing newline.
    await page.evaluate(raw => new Promise((resolve, reject) => {
      const open = indexedDB.open('chalky');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('tasks', 'readwrite');
        const store = tx.objectStore('tasks');
        const request = store.getAll();
        request.onsuccess = () => store.put({ ...request.result[0], notes: raw, dirty: false });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    }), raw);
    await page.reload();
    const before = (await readTasks(page))[0];
    const note = await openNote(page);
    await expect(note).toHaveText('a b c');
    await note.click();
    // Negative control: allow pending initialization/listener work to run.
    await page.waitForTimeout(350);
    await leaveNote(page, path);
    if (path === 'blur') await leaveNote(page, 'close');
    await page.reload();
    const after = (await readTasks(page))[0];
    await info.attach('untouched-record', { body: JSON.stringify({ before, after }, null, 2), contentType: 'application/json' });
    expect(after).toEqual(before);
    expect(after.notes).toBe(raw);
  });
}

test('a second edit after a blur flush remains current', async ({ page }, info) => {
  await begin(page);
  const note = await openNote(page);
  await note.fill('first');
  await leaveNote(page, 'blur');
  await note.press('ControlOrMeta+A');
  await note.press('z');
  await expect(note).toHaveText('z');
  await leaveNote(page, 'escape');
  await page.reload();
  const reopened = await openNote(page);
  const actual = await reopened.textContent();
  await info.attach('second-edit', { body: JSON.stringify({ actual }), contentType: 'application/json' });
  expect(actual).toBe('z');
});

for (const path of ['close', 'escape']) {
test(`visible filled text after blur is committed on ${path}`, async ({ page }, info) => {
  await begin(page);
  const note = await openNote(page);
  await note.fill('first');
  await leaveNote(page, 'blur');
  await note.fill('second');
  await expect(note).toHaveText('second');
  const started = Date.now();
  await leaveNote(page, path);
  const elapsedMs = Date.now() - started;
  await page.reload();
  const reopened = await openNote(page);
  const actual = await reopened.textContent();
  await info.attach('filled-edit', { body: JSON.stringify({ elapsedMs, actual }), contentType: 'application/json' });
  expect(actual).toBe('second');
});
}

test('notes-only new task survives Save and add another', async ({ page }, info) => {
  await begin(page);
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
  const note = page.locator(noteSelector);
  await note.press('z');
  await expect(note).toHaveText('z');
  const before = (await readTasks(page)).find(t => t.text === '' && !t.deleted);
  await page.getByRole('button', { name: 'Save and add another task', exact: true }).click();
  const after = (await readTasks(page)).find(t => t.id === before.id);
  await info.attach('notes-only-task', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
  expect(after.notes.trim()).toBe('z');
  expect(after.deleted).toBeFalsy();
  await expect(page.locator(noteSelector)).toHaveText('');
});

for (const switchTask of [false, true]) {
test(`one rejected write can recover ${switchTask ? 'after another task' : 'on the same task'}`, async ({ page }, info) => {
  // One deterministic, local storage failure; no remote requests or real data.
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let rejected = false;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (!rejected && this.name === 'tasks' && value.notes?.trim() === 'retry-note') {
        rejected = true;
        throw new DOMException('Synthetic one-shot write rejection', 'QuotaExceededError');
      }
      return put.call(this, value, ...args);
    };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await begin(page);
  let note = await openNote(page);
  await note.fill('retry-note');
  await expect(note).toHaveText('retry-note');
  await leaveNote(page, 'blur');
  await expect.poll(() => errors.some(e => e.includes('Synthetic one-shot'))).toBe(true);
  if (switchTask) {
    // Use the existing global New task shortcut while focus is not in text.
    await page.getByRole('button', { name: 'Bold', exact: true }).focus();
    await page.keyboard.press('n');
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    await page.locator('[aria-label="Task details"] textarea.title').fill('Different task');
    await leaveNote(page, 'close');
    await page.locator('.task .chip').filter({ hasText: 'ACL explicit commit sample' }).click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    note = page.locator(noteSelector);
  }
  await leaveNote(page, 'close');
  await page.reload();
  const task = (await readTasks(page)).find(t => t.text === 'ACL explicit commit sample');
  await info.attach('write-recovery', { body: JSON.stringify({ switchTask, task, errors }), contentType: 'application/json' });
  expect(task.notes.trim()).toBe('retry-note');
});
}
