// App Crash Lab — MIT. Copy into Stockroom's existing tests/e2e/ directory.
// Source pin: mikoto2000/spring-boot-jquery-playwright-demo@4d0f7613.
// Real browser UI + Spring Boot + the e2e profile's disposable in-memory H2.
// HTTP refusal and request delay are injected at the browser boundary, not H2.
import { test, expect } from '@playwright/test';

const seed = [
  { name: '会議室モニター', category: 'PC・周辺機器', quantity: 3, status: '利用可能' },
  { name: 'ノートパソコン', category: 'PC・周辺機器', quantity: 5, status: '貸出中' },
  { name: 'ホワイトボード', category: 'オフィス用品', quantity: 2, status: '利用可能' },
];
const visibleFields = (records) => records.map((item) => [
  item.name, item.category, String(item.quantity), item.status,
]);
const rowFor = (page, item) => page.getByRole('row').filter({
  has: page.getByRole('cell', { name: item.name, exact: true }),
});
const dialogFor = (page) => page.getByRole('dialog', { name: '備品の削除', exact: true });
const successFor = (page) => page.getByRole('status').filter({ hasText: '備品を削除しました' });

async function readStored(request) {
  const response = await request.get('/api/equipment');
  expect(response.status()).toBe(200);
  return response.json();
}

async function readVisible(page) {
  const rows = [];
  for (const row of await page.getByRole('row').all()) {
    const cells = await row.getByRole('cell').allTextContents();
    if (cells.length) {
      expect(cells).toHaveLength(5);
      rows.push(cells.slice(0, 4).map((text) => text.trim()));
    }
  }
  return rows;
}

async function expectVisible(page, records) {
  await expect.poll(() => readVisible(page)).toEqual(visibleFields(records));
}

async function baselineFor(page, request) {
  const records = await readStored(request);
  expect(records.map(({ id, ...record }) => record)).toEqual(seed);
  expect(records.every((item) => Number.isSafeInteger(item.id) && item.id > 0)).toBe(true);
  expect(new Set(records.map((item) => item.id)).size).toBe(seed.length);
  await expectVisible(page, records);
  return records;
}

function isDelete(response, url) {
  return response.url() === url && response.request().method() === 'DELETE';
}

async function openDelete(page, item) {
  await rowFor(page, item).getByRole('button', { name: '削除', exact: true }).click();
  await expect(dialogFor(page)).toBeVisible();
  await expect(dialogFor(page)).toContainText(item.name);
}

async function expectCommitted(page, request, records) {
  await expect(dialogFor(page)).not.toBeVisible();
  await expect(successFor(page)).toBeVisible();
  expect(await readStored(request)).toEqual(records);
  await expectVisible(page, records);
  await page.reload();
  await expectVisible(page, records);
  expect(await readStored(request)).toEqual(records);
}

test.beforeEach(async ({ page, request, baseURL }) => {
  // Keep the app's original config: reuseExistingServer:false and workers:1.
  // The reset route must exist only on its disposable e2e-profile server.
  expect(baseURL).toBe('http://127.0.0.1:18765');
  expect((await request.post('/api/test/reset')).status()).toBe(204);
  await page.goto('/');
  await expect(page.getByRole('row')).toHaveCount(4);
});

test('control: successful delete removes only the selected full record after reload', async ({ page, request, baseURL }) => {
  const baseline = await baselineFor(page, request);
  const target = baseline[0];
  const url = new URL(`/api/equipment/${target.id}`, baseURL).href;
  await openDelete(page, target);
  const completed = page.waitForResponse((response) => isDelete(response, url));
  await dialogFor(page).getByRole('button', { name: '削除する', exact: true }).click();
  expect((await completed).status()).toBe(204);
  await expectCommitted(page, request, baseline.filter((item) => item.id !== target.id));
});

test('control: a browser-paused delete preserves every record and claims no success', async ({ page, request, baseURL }) => {
  const baseline = await baselineFor(page, request);
  const target = baseline[0];
  const url = new URL(`/api/equipment/${target.id}`, baseURL).href;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered = false;
  await page.route(url, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    entered = true;
    await held;
    await route.continue();
  });
  await openDelete(page, target);
  const completed = page.waitForResponse((response) => isDelete(response, url));
  try {
    await dialogFor(page).getByRole('button', { name: '削除する', exact: true }).click();
    await expect.poll(() => entered).toBe(true);
    await expect(dialogFor(page)).toHaveAttribute('aria-busy', 'true');
    await expect(dialogFor(page).getByRole('button', { name: '削除する', exact: true })).toBeDisabled();
    await expect(successFor(page)).toHaveCount(0);
    expect(await readStored(request)).toEqual(baseline);
    await expectVisible(page, baseline);
  } finally {
    release();
    await completed;
  }
  expect((await completed).status()).toBe(204);
  await expectCommitted(page, request, baseline.filter((item) => item.id !== target.id));
});

test('refused delete preserves all full records, shows failure and can retry after reload', async ({ page, request, baseURL }) => {
  const baseline = await baselineFor(page, request);
  const target = baseline[0];
  const url = new URL(`/api/equipment/${target.id}`, baseURL).href;
  let refusals = 0;
  const refuseDelete = async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    refusals += 1;
    await route.fulfill({ status: 503, json: { message: 'synthetic delete refusal' } });
  };
  await page.route(url, refuseDelete);
  await openDelete(page, target);
  const rejected = page.waitForResponse((response) => isDelete(response, url));
  await dialogFor(page).getByRole('button', { name: '削除する', exact: true }).click();
  expect((await rejected).status()).toBe(503);
  expect(refusals).toBe(1);
  await expect(dialogFor(page)).toBeVisible();
  await expect(dialogFor(page).getByRole('alert')).toHaveText('削除できませんでした。もう一度お試しください。');
  await expect(dialogFor(page)).toHaveAttribute('aria-busy', 'false');
  await expect(successFor(page)).toHaveCount(0);
  expect(await readStored(request)).toEqual(baseline);
  await expectVisible(page, baseline);

  await dialogFor(page).getByRole('button', { name: 'キャンセル', exact: true }).click();
  await page.reload();
  await expectVisible(page, baseline);
  expect(await readStored(request)).toEqual(baseline);
  await page.unroute(url, refuseDelete);
  await openDelete(page, target);
  const retried = page.waitForResponse((response) => isDelete(response, url));
  await dialogFor(page).getByRole('button', { name: '削除する', exact: true }).click();
  expect((await retried).status()).toBe(204);
  await expectCommitted(page, request, baseline.filter((item) => item.id !== target.id));
});
