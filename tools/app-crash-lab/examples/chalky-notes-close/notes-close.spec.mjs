import { test, expect } from '@playwright/test';

const base = new URL(process.env.CHALKY_BASE_URL ?? 'http://127.0.0.1:54196');
if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' ||
    base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('CHALKY_BASE_URL must be an http://127.0.0.1:PORT origin');
}
const origin = base.origin;
for (const delay of [0, 350]) {
  test(`notes keep the last edit with ${delay}ms before close`, async ({ page }, testInfo) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin);
    await page.getByRole('button', { name: "Let's-a go!", exact: true }).click();
    const add = page.locator('section.col[data-day="__someday__"] textarea[placeholder="Add task"]');
    await add.fill('ACL close timing sample');
    await add.press('Enter');
    await page.locator('.task .chip').click();
    const note = page.locator('[aria-label="Task details"] [contenteditable="true"]');
    const close = page.locator('[aria-label="Task details"] button[aria-label="Close"]');
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    await note.fill('Synthetic baseline');
    // This is a timing diagnostic, not a recommended wait in a normal test.
    // Seed a saved baseline using a delay beyond Milkdown's 200ms listener.
    await page.waitForTimeout(350);
    await close.click();
    await page.locator('.task .chip').click();
    await expect(note).toHaveText('Synthetic baseline');
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    await note.press('ControlOrMeta+A');
    await note.press('x');
    const started = Date.now();
    await expect(note).toHaveText('x');
    if (delay) await page.waitForTimeout(delay);
    await close.click();
    const closeElapsedMs = Date.now() - started;
    await page.locator('.task .chip').click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    const afterReopen = await note.textContent();
    await page.reload();
    await page.locator('.task .chip').click();
    await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeVisible();
    const afterReload = await note.textContent();
    await testInfo.attach('timing-and-state', {
      body: JSON.stringify({ delay, closeElapsedMs, expected: 'x', afterReopen, afterReload }, null, 2),
      contentType: 'application/json',
    });
    console.log(JSON.stringify({ delay, closeElapsedMs, afterReopen, afterReload }));
    await page.screenshot({ path: testInfo.outputPath('after-reload.png') });
    expect(afterReopen).toBe('x');
    expect(afterReload).toBe('x');
  });
}
