import { test, expect } from '@playwright/test';

const origin = 'http://127.0.0.1:54194';
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('livepage-page-storage')));
const titleBox = page => page.getByRole('textbox', { name: 'Page title', exact: true });
async function stable(page, expected) {
  let since = null;
  await expect.poll(async () => {
    const equal = JSON.stringify(await saved(page)) === JSON.stringify(expected);
    if (!equal) since = null;
    else since ??= Date.now();
    return equal && Date.now() - since >= 1000;
  }, { timeout: 10000, intervals: [100] }).toBe(true);
}
async function editTitle(page, value) {
  await titleBox(page).fill(value);
  await titleBox(page).press('Enter');
  await expect.poll(async () => (await saved(page))?.componentTree?.[0]?.attributes?.title, { timeout: 10000 }).toBe(value);
  await expect(titleBox(page)).toHaveValue(value);
}

for (const mode of ['same-tab', 'fresh-peer']) test(`LivePage preservation control: ${mode}`, async ({ browser }, testInfo) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, serviceWorkers: 'block' });
  const blocked = [], dialogs = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push(route.request().url()); return route.abort();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  const watch = page => {
    page.setDefaultTimeout(10000);
    page.on('dialog', async dialog => { dialogs.push({ type: dialog.type(), message: dialog.message() }); await dialog.dismiss(); });
  };
  try {
    const primary = await context.newPage(); watch(primary);
    await primary.goto(`${origin}/try`, { waitUntil: 'domcontentloaded' });
    const initialTitle = `Crash Lab control initial ${mode} — 日本語 🐾`;
    const finalTitle = `Crash Lab control saved ${mode} — keep this row`;
    await editTitle(primary, initialTitle);
    await stable(primary, await saved(primary));
    await primary.getByRole('button', { name: 'Add Row', exact: true }).click();
    await expect.poll(async () => (await saved(primary))?.componentTree?.[0]?.children?.length).toBe(1);
    await editTitle(primary, finalTitle);
    const before = await saved(primary);
    await stable(primary, before);
    let actor = primary;
    if (mode === 'fresh-peer') {
      actor = await context.newPage(); watch(actor);
      await actor.goto(`${origin}/try`, { waitUntil: 'domcontentloaded' });
      await expect(titleBox(actor)).toHaveValue(finalTitle);
      await stable(primary, before);
    }
    expect(before.toolbarMinimized).toBe(false);
    await actor.getByRole('button', { name: 'Minimize', exact: true }).click();
    await expect.poll(async () => (await saved(primary))?.toolbarMinimized).toBe(true);
    const afterCommit = await saved(primary);
    await stable(primary, afterCommit);
    await primary.reload({ waitUntil: 'domcontentloaded' });
    await expect(titleBox(primary)).toHaveValue(finalTitle);
    await stable(primary, afterCommit);
    const afterReload = await saved(primary);
    await testInfo.attach('complete-state-control', { body: JSON.stringify({ mode, before, afterCommit, afterReload, dialogs, blocked }, null, 2), contentType: 'application/json' });
    expect(afterReload.componentTree).toEqual(before.componentTree);
    expect(afterReload.toolbarMinimized).toBe(true);
    expect(dialogs).toEqual([]);
  } finally { await context.close(); }
});
