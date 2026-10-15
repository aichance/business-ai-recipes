import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Own synthetic inputs only, unchanged upstream source, isolated browser contexts.
const origin = 'http://127.0.0.1:54523';
const url = `${origin}/Focus-Workout-Tracker.html`;
const pin = '81b731bef0719f55f6a2ab93bf4dfd00d6d25037';
const userSettings = ['height', 'heightUnit', 'age', 'neck', 'neckUnit',
  'weightUnit', 'weekStartsOn', 'goals'];

async function snapshot(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('focus-tracker');
      request.onupgradeneeded = () => {
        request.transaction.abort();
        reject(new Error('The app must create its database first.'));
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const result = {};
      for (const name of ['workouts', 'measurements', 'challenges', 'settings']) {
        result[name] = await new Promise((resolve, reject) => {
          const transaction = db.transaction(name, 'readonly');
          const request = transaction.objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return result;
    } finally { db.close(); }
  });
}

async function emptyPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(url);
  await expect(page.locator('#quickAddBtn')).toBeVisible();
  // Upstream boots with demo history. Delete it through normal UI in this fresh
  // context, never from a real user's profile and never by rewriting storage.
  await page.locator('[data-view="data"]').click();
  await page.locator('[data-action="reset-all"]').click();
  await page.locator('#confirmBtn').click();
  await expect(page.getByText('All data deleted. The app is now empty.', { exact: true })).toBeVisible();
  const state = await snapshot(page);
  for (const store of ['workouts', 'measurements', 'challenges']) expect(state[store]).toEqual([]);
  return page;
}

async function roundtrip(browser, testInfo) {
  const contexts = [];
  try {
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ serviceWorkers: 'block',
        viewport: { width: 1280, height: 800 }, acceptDownloads: true });
      contexts.push(context);
      await context.route('**/*', route => new URL(route.request().url()).origin === origin
        ? route.continue() : route.abort());
    }
    const sourcePage = await emptyPage(contexts[0]);
    await sourcePage.locator('[data-view="settings"]').click();
    await sourcePage.locator('#setHeight').fill('171');
    await sourcePage.locator('#setAge').fill('31');
    await sourcePage.locator('#setNeck').fill('37');
    await sourcePage.locator('[data-action="save-profile"]').click();
    await expect(sourcePage.getByText('Profile saved — BMI & body-fat tools will use your height & neck', { exact: true })).toBeVisible();
    await sourcePage.locator('[data-tab="preferences"]').click();
    await sourcePage.locator('[data-set-weightunit="kg"]').click();
    await expect.poll(async () => (await snapshot(sourcePage)).settings.find(row => row.k === 'app').value.weightUnit).toBe('kg');
    await sourcePage.locator('[data-week-start="sunday"]').click();
    await expect.poll(async () => (await snapshot(sourcePage)).settings.find(row => row.k === 'app').value.weekStartsOn).toBe('sunday');
    await sourcePage.locator('[data-tab="goals"]').click();
    await sourcePage.locator('#goalCal').fill('450');
    await sourcePage.locator('#goalDur').fill('35');
    await sourcePage.locator('#goalWk').fill('4');
    await sourcePage.locator('[data-action="save-goals"]').click();
    await expect(sourcePage.getByText('Goals saved 🎯 — check your dashboard and calendar', { exact: true })).toBeVisible();
    await sourcePage.locator('[data-view="dashboard"]').click();
    await sourcePage.locator('#quickAddBtn').click();
    await sourcePage.locator('#wfDate').fill('2026-10-15');
    await sourcePage.locator('#wfPickerToggle').click();
    await sourcePage.locator('[data-picker="wf"][data-type="Walk"]').click();
    await sourcePage.locator('#wfDuration').fill('17');
    await sourcePage.locator('#wfCalories').fill('123');
    await sourcePage.locator('#wfNotes').fill('Synthetic backup round-trip fixture; no personal health data');
    await sourcePage.locator('#workoutForm button[type="submit"]').click();
    // The dialog closes before the IndexedDB write finishes. Wait for its ACK.
    await expect(sourcePage.getByText('Workout added 💪', { exact: true })).toBeVisible();
    await sourcePage.reload();
    await expect(sourcePage.locator('#quickAddBtn')).toBeVisible();
    const source = await snapshot(sourcePage);
    expect(source.workouts).toHaveLength(1);
    expect(source.measurements).toEqual([]);
    expect(source.challenges).toEqual([]);
    const settings = source.settings.find(row => row.k === 'app').value;
    expect(settings.goals).toEqual({ calPerDay: 450, durPerDay: 35,
      workoutsPerWeek: 4, weight: null, goalWeightUnit: 'kg', avoidJunkFood: true });
    expect(settings.height).toBe(171);
    expect(settings.age).toBe(31);
    expect(settings.neck).toBe(37);
    expect(settings.weightUnit).toBe('kg');
    expect(settings.weekStartsOn).toBe('sunday');
    await sourcePage.locator('[data-view="data"]').click();
    const downloading = sourcePage.waitForEvent('download');
    await sourcePage.locator('#dataBody [data-action="export-backup"]').click();
    const download = await downloading;
    const backupPath = testInfo.outputPath('unedited-backup.json');
    await download.saveAs(backupPath);
    const bytes = await readFile(backupPath);
    const payload = JSON.parse(bytes.toString('utf8'));
    expect(payload.workouts).toEqual(source.workouts);
    expect(payload.measurements).toEqual([]);
    expect(payload.monthlyChallenges).toEqual([]);
    for (const key of userSettings) expect(payload.settings[key]).toEqual(settings[key]);
    await testInfo.attach('unedited-backup', { path: backupPath, contentType: 'application/json' });

    const targetPage = await emptyPage(contexts[1]);
    const choosing = targetPage.waitForEvent('filechooser');
    await targetPage.locator('#dropJson').click();
    await (await choosing).setFiles(backupPath); // exact downloaded bytes
    await expect(targetPage.locator('#confirmImport')).toBeVisible();
    await expect(targetPage.locator('#modal')).toContainText('Focus JSON backup — full-fidelity restore.');
    await targetPage.locator('#confirmImport').click(); // app HTML preview-confirm button
    await expect(targetPage.getByText(/Import complete — 1 added/)).toBeVisible();
    await targetPage.reload();
    await targetPage.locator('[data-view="data"]').click();
    await expect(targetPage.locator('#dropJson')).toBeVisible();
    const restored = await snapshot(targetPage);
    const originalSettings = Object.fromEntries(userSettings.map(key => [key, settings[key]]));
    const targetSettings = restored.settings.find(row => row.k === 'app').value;
    const restoredSettings = Object.fromEntries(userSettings.map(key => [key, targetSettings[key]]));
    await testInfo.attach('observations', { contentType: 'application/json', body: JSON.stringify({
      pin, exportBytes: bytes.length, exportSha256: createHash('sha256').update(bytes).digest('hex'),
      completeWorkoutMatches: JSON.stringify(source.workouts) === JSON.stringify(restored.workouts),
      originalSettings, restoredSettings,
      excludedMetadata: ['lastBackupAt', 'lastImportAt', 'seedVersion', 'lastBackupReminderAt'],
    }, null, 2) });
    // No IDs, timestamps or record fields are removed from the workout comparison.
    expect(restored.workouts).toEqual(source.workouts);
    expect(restored.measurements).toEqual([]);
    expect(restored.challenges).toEqual([]);
    return { originalSettings, restoredSettings };
  } finally {
    for (const context of contexts) await context.close();
  }
}

test('control: the complete synthetic workout survives native restore and reload', async ({ browser }, testInfo) => {
  await roundtrip(browser, testInfo);
});

test('profile, preferences and goals survive the same backup restore', async ({ browser }, testInfo) => {
  const { originalSettings, restoredSettings } = await roundtrip(browser, testInfo);
  // Required behavior, not a test that approves the existing loss. This fails on
  // the pinned upstream source. Keep the assertion when checking an actual fix.
  expect(restoredSettings).toEqual(originalSettings);
});
