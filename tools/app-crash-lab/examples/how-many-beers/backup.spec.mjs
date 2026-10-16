import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { test, expect } from '@playwright/test';

// Original black-box tests. No upstream application code is included here.
const baseURL = process.env.ACL_HMB_URL || 'http://127.0.0.1:60291/how-many-beers/';
const parsedURL = new URL(baseURL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(parsedURL.hostname)
    || !['http:', 'https:'].includes(parsedURL.protocol)
    || parsedURL.username || parsedURL.password) {
  throw new Error('Use a disposable loopback app with synthetic data only.');
}
const activeKey = 'how-many-beers:meal:v1';
const historyKey = 'how-many-beers:history:v1';
const confirmation = 'Restore this backup? It replaces the active cook and saved history on this device.';
const archiveName = 'ACL synthetic archived cook';
const activeName = 'ACL synthetic active cook';
const archiveStep = 'ACL synthetic archived step';
const activeStep = 'ACL synthetic active checkpoint';

test.use({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'UTC' });
test.setTimeout(120000);

async function snapshot(page) {
  return page.evaluate(({ activeKey, historyKey }) => ({
    active: JSON.parse(localStorage.getItem(activeKey)),
    history: JSON.parse(localStorage.getItem(historyKey)),
  }), { activeKey, historyKey });
}

async function addStep(page, title, instructions) {
  await page.getByRole('button', { name: '+ Add a checklist step', exact: true }).click();
  await page.getByLabel('Step title', { exact: true }).fill(title);
  await page.getByLabel('Instructions (optional)', { exact: true }).fill(instructions);
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await expect(page.getByRole('article', { name: title, exact: true })).toBeVisible();
}

async function prepareSource(page) {
  await page.goto(baseURL);
  await expect(page.getByLabel('Meal name', { exact: true })).toHaveValue('Next cook');
  await page.getByLabel('Meal name', { exact: true }).fill(archiveName);
  await addStep(page, archiveStep, 'ACL synthetic archived instructions');
  await page.getByRole('button', { name: '🔥 Start the cook', exact: true }).click();
  await page.getByLabel('Quick notes', { exact: true }).fill('ACL synthetic note');
  await page.getByRole('button', { name: '+ Log temperature', exact: true }).click();
  await page.getByLabel('Food temperature', { exact: true }).fill('169');
  await page.getByLabel('Location / details (optional)', { exact: true }).fill('ACL synthetic reading');
  await page.getByRole('button', { name: 'Save timestamped reading', exact: true }).click();
  await page.getByRole('checkbox', { name: `Complete ${archiveStep}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: "That's a wrap!", exact: true })).toBeVisible();
  await page.getByRole('button', { name: '✓ Finish & Save Cook', exact: true }).click();
  await page.getByLabel('How did it turn out? (optional)', { exact: true }).fill('ACL synthetic outcome');
  await page.getByRole('button', { name: 'Save Cook & Start Fresh', exact: true }).click();
  await expect(page.getByLabel('Meal name', { exact: true })).toHaveValue('Next cook');
  await expect(page.locator('.history-item strong')).toHaveText(archiveName);
  await page.getByLabel('Meal name', { exact: true }).fill(activeName);
  await addStep(page, activeStep, 'ACL synthetic active instructions');
  await expect.poll(async () => (await snapshot(page)).active?.customTasks?.[0]?.title).toBe(activeStep);
  const saved = await snapshot(page);
  expect(saved.history.cooks).toHaveLength(1);
  expect(saved.history.cooks[0].meal.events.map(event => event.kind)).toEqual(['started', 'temperature', 'completed']);
  expect(saved.active.dishes).toEqual([]);
  expect(saved.history.cooks[0].meal.dishes).toEqual([]);
  return saved;
}

async function realBackup(page, saved) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const bytes = await readFile(await download.path());
  const json = JSON.parse(bytes.toString('utf8'));
  expect(json.format).toBe('how-many-beers-backup');
  expect(json.version).toBe(1);
  expect(json.active).toEqual(saved.active);
  expect(json.history).toEqual(saved.history);
  return { bytes, json, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function trackDialogs(page) {
  const dialogs = [];
  page.on('dialog', async dialog => {
    const accepted = dialog.type() === 'confirm' && dialog.message() === confirmation && dialogs.length === 0;
    dialogs.push({ type: dialog.type(), message: dialog.message(), accepted });
    if (accepted) await dialog.accept();
    else await dialog.dismiss();
  });
  return dialogs;
}

async function attach(info, name, value) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
  await info.attach(name, { path, contentType: 'application/json' });
}

async function stableEqual(page, expected) {
  await expect.poll(() => snapshot(page)).toEqual(expected);
  // A bounded stability window, not a delay before taking the first observation.
  for (let index = 0; index < 4; index += 1) {
    expect(await snapshot(page)).toEqual(expected);
    await page.waitForTimeout(125);
  }
}

test('real downloaded JSON preserves complete active cook and nonempty archive after fresh restore and reload', async ({ page, browser }, info) => {
  const source = await prepareSource(page);
  const backup = await realBackup(page, source);
  const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1280, height: 900 } });
  try {
    expect(await context.storageState()).toEqual({ cookies: [], origins: [] });
    const target = await context.newPage();
    await target.goto(baseURL);
    await expect(target.getByLabel('Meal name', { exact: true })).toHaveValue('Next cook');
    const empty = await snapshot(target);
    expect(empty.active.id).not.toBe(source.active.id);
    expect(empty.active.dishes).toEqual([]);
    expect(empty.active.completed).toEqual({});
    expect(empty.active.notes).toEqual({});
    expect(empty.history).toBeNull();
    const dialogs = trackDialogs(target);
    await expect(target.locator('p.notice[role="status"]')).toHaveCount(0);
    await target.getByLabel('Restore a backup', { exact: true }).setInputFiles({ name: 'acl-real-backup.json', mimeType: 'application/json', buffer: backup.bytes });
    await expect(target.locator('p.notice[role="status"]')).toHaveText('Your cook history has been restored.');
    await stableEqual(target, source);
    await expect(target.getByLabel('Meal name', { exact: true })).toHaveValue(activeName);
    await expect(target.locator('.history-item strong')).toHaveText(archiveName);
    await expect(target.getByRole('article', { name: activeStep, exact: true })).toBeVisible();
    await target.reload();
    await expect(target.getByLabel('Meal name', { exact: true })).toHaveValue(activeName);
    await stableEqual(target, source);
    await expect(target.locator('.history-item strong')).toHaveText(archiveName);
    expect(dialogs).toEqual([{ type: 'confirm', message: confirmation, accepted: true }]);
    await attach(info, 'complete-roundtrip-observation', { backupBytes: backup.bytes.length, backupSha256: backup.sha256, empty, source, afterReload: await snapshot(target), dialogs });
  } finally {
    await context.close();
  }
});

test('invalid null task in a real backup must be rejected without changing active cook or archive', async ({ page }, info) => {
  const before = await prepareSource(page);
  const backup = await realBackup(page, before);
  const invalid = structuredClone(backup.json);
  invalid.active.customTasks.push(null);
  const mutationControl = structuredClone(invalid);
  mutationControl.active.customTasks.pop();
  expect(mutationControl).toEqual(backup.json);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const dialogs = trackDialogs(page);
  await page.getByLabel('Restore a backup', { exact: true }).setInputFiles({
    name: 'acl-invalid-null-task.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)),
  });
  let rejectionObserved = true;
  try {
    await expect(page.getByRole('alert').filter({ hasText: 'Could not restore backup:' })).toBeVisible({ timeout: 4000 });
  } catch {
    rejectionObserved = false;
  }
  const afterImport = await snapshot(page);
  const importText = await page.locator('body').innerText();
  await page.reload();
  // Observe persisted state even if React cannot render the corrupted import.
  await expect.poll(() => page.locator('body').innerText()).not.toBe('');
  const afterReload = await snapshot(page);
  const reloadText = await page.locator('body').innerText();
  await attach(info, 'invalid-task-observation', {
    backupBytes: backup.bytes.length, backupSha256: backup.sha256,
    mutation: 'append one null at /active/customTasks/-; all other exported values unchanged',
    before, afterImport, afterReload, dialogs, errors, rejectionObserved,
    activePreservedAfterImport: isDeepStrictEqual(afterImport.active, before.active),
    historyPreservedAfterImport: isDeepStrictEqual(afterImport.history, before.history),
    activePreservedAfterReload: isDeepStrictEqual(afterReload.active, before.active),
    historyPreservedAfterReload: isDeepStrictEqual(afterReload.history, before.history),
    importText, reloadText,
  });
  expect.soft(rejectionObserved, 'the malformed file must produce a new explicit rejection').toBe(true);
  expect.soft(afterImport, 'both complete saved values must remain unchanged after rejection').toEqual(before);
  expect.soft(afterReload, 'both complete saved values must remain unchanged after reload').toEqual(before);
  await expect.soft(page.getByLabel('Meal name', { exact: true })).toHaveValue(activeName);
});
