import { test, expect } from '@playwright/test';
import { createStateLens } from '../lens.mjs';
import { startFixture } from '../demo/fixture.mjs';

let server;
test.beforeAll(async () => { server = await startFixture(); });
test.afterAll(async () => { await server?.close(); });

test('attach selected persistence observations to an ordinary Playwright test', async ({ page }, testInfo) => {
  await page.goto(server.url);
  await page.waitForFunction(() => window.fixture?.ready);
  const lens = createStateLens(page, {
    probes: [{ name: 'draft', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' }],
  });
  try {
    await lens.step('Save', async () => {
      await page.getByLabel('Your draft').fill('A normal Playwright test');
      await page.getByRole('button', { name: 'Save draft', exact: true }).click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    });
    await lens.step('Reload', async () => {
      await page.reload();
      await expect(page.getByText('Ready', { exact: true })).toBeVisible();
    });
    await expect(page.getByLabel('Your draft')).toHaveValue('A normal Playwright test');
    expect(lens.report().checkpoints.at(-1).values.draft.value.body).toBe('A normal Playwright test');
  } finally {
    const path = testInfo.outputPath('selected-state.html');
    await lens.writeHTML(path);
    await testInfo.attach('selected-state', { path, contentType: 'text/html' });
  }
});
