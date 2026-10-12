import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

// Synthetic records only. Run against a disposable unchanged local DevTasks.
const origin = 'http://127.0.0.1:54431';
const importError = 'File validation failed — invalid task schema detected.';

async function localPage(browser) {
  const context = await browser.newContext();
  await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort());
  return { context, page: await context.newPage() };
}

for (const category of ['FEATURE', 'DOCS']) {
  test(`${category}: restore the app's own unedited export in a fresh context`, async ({ browser }, testInfo) => {
    const source = await localPage(browser);
    const target = await localPage(browser);
    try {
      await source.page.goto(`${origin}/taskmanage/add-tasks`);
      if (category === 'DOCS') {
        await source.page.getByRole('button', { name: '+ Add', exact: true }).click();
        await source.page.getByPlaceholder('NEW...', { exact: true }).fill(category);
        await source.page.getByRole('button', { name: 'Add', exact: true }).click();
      }
      await source.page.getByLabel('Task Description', { exact: true }).fill(`Crash Lab ${category} backup`);
      await source.page.getByRole('button', { name: 'Create Task', exact: true }).click();
      await expect.poll(() => source.page.evaluate(() => JSON.parse(localStorage.getItem('tasks') || '[]').length)).toBe(1);
      const saved = await source.page.evaluate(() => JSON.parse(localStorage.getItem('tasks')));
      expect(saved[0].category).toBe(category);
      await source.page.goto(`${origin}/taskmanage/data-center`);
      const downloading = source.page.waitForEvent('download');
      await source.page.getByRole('button', { name: 'Export JSON', exact: true }).click();
      const download = await downloading;
      const backup = await readFile(await download.path());
      expect(JSON.parse(backup.toString()).tasks).toEqual(saved);
      const backupPath = testInfo.outputPath('unedited-backup.json');
      await writeFile(backupPath, backup);
      await testInfo.attach('unedited-backup.json', { path: backupPath, contentType: 'application/json' });

      await target.page.goto(`${origin}/taskmanage/data-center`);
      // Wait for the startup splash to leave before exercising the visible import UI.
      await expect(target.page.getByRole('button', { name: 'Upload Backup', exact: true })).toBeVisible();
      await expect(target.page.getByRole('heading', { name: 'DevTasks', exact: true })).toHaveCount(0);
      expect(await target.page.evaluate(() => localStorage.getItem('tasks'))).toBeNull();
      await target.page.locator('input[type=file]').setInputFiles({
        name: 'unedited-backup.json', mimeType: 'application/json', buffer: backup,
      });
      await expect(target.page.locator('[data-sonner-toast][data-type]')).toBeVisible();
      await expect(target.page.locator('[data-sonner-toast][data-type]')).toBeInViewport({ ratio: 1 });
      const screenshotPath = testInfo.outputPath('import-result.png');
      await target.page.screenshot({ path: screenshotPath });
      await testInfo.attach('import-result.png', { path: screenshotPath, contentType: 'image/png' });
      const errorCount = await target.page.getByText(importError, { exact: true }).count();
      const observationsPath = testInfo.outputPath('observations.json');
      await writeFile(observationsPath, JSON.stringify({
        category, errorCount,
        tasksAfterImport: await target.page.evaluate(() => localStorage.getItem('tasks')),
      }, null, 2));
      await testInfo.attach('observations.json', { path: observationsPath, contentType: 'application/json' });
      // This is the required behavior, not an assertion that the current bug is correct.
      // DOCS is expected to fail on the pinned upstream commit; FEATURE is the control.
      await expect.poll(() => target.page.evaluate(() => JSON.parse(localStorage.getItem('tasks') || '[]'))).toEqual(saved);
      await target.page.goto(`${origin}/taskmanage/list-tasks`);
      await expect(target.page.getByText(`Crash Lab ${category} backup`, { exact: true })).toBeVisible();
      await target.page.reload();
      await expect(target.page.getByText(`Crash Lab ${category} backup`, { exact: true })).toBeVisible();
    } finally {
      await source.context.close();
      await target.context.close();
    }
  });
}
