import { test, expect } from '@playwright/test';

// Standalone operator reproduction on the pinned unchanged local app.
// Start NestSave on this loopback port; only synthetic records in fresh contexts.
const BASE_URL = 'http://127.0.0.1:54594';

async function createGoal(page, alreadySaved) {
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('button', { name: 'Create Goal', exact: true }).click();
  await page.getByPlaceholder('https://example.com/product...').fill('https://example.com/study-laptop');
  await page.getByRole('button', { name: 'Create Manually', exact: true }).click();
  const fields = page.locator('input:visible,select:visible,textarea:visible');
  await fields.nth(0).fill('Work Laptop');
  await fields.nth(1).fill('75000');
  await fields.nth(2).fill(String(alreadySaved));
  await fields.nth(3).selectOption('Technology');
  await fields.nth(4).selectOption('purchase');
  await fields.nth(5).fill('OLED laptop fund for autumn study');
  await page.getByRole('button', { name: 'Next: Time Plan', exact: true }).click();
  const timeFields = page.locator('input:visible,select:visible,textarea:visible');
  await timeFields.nth(0).fill('2026-10-15');
  await timeFields.nth(1).fill('2027-04-15');
  await timeFields.nth(2).selectOption('monthly');
  await timeFields.nth(3).selectOption('high');
  await page.getByText('Enable recurring contribution reminder', { exact: true }).click();
  await page.getByPlaceholder('e.g. 5000').fill('2500');
  await page.getByRole('button', { name: 'Next: Financial Capacity', exact: true }).click();
  const capacityFields = page.locator('input:visible,select:visible,textarea:visible');
  await capacityFields.nth(0).fill('60000');
  await capacityFields.nth(1).fill('18000');
  await capacityFields.nth(2).fill('5000');
  await capacityFields.nth(3).fill('5000');
  await page.getByRole('button', { name: 'Next: Plan Review', exact: true }).click();
  await page.getByRole('button', { name: 'Create Savings Plan', exact: true }).click();
  await page.getByText('Your savings plan is ready.', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
}


async function savedTotals(page) {
  return page.evaluate(async () => {
    const name = 'nest_save_vault';
    if (!(await indexedDB.databases()).some(db => db.name === name)) throw new Error('The saved database is absent');
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onupgradeneeded = () => { try { request.transaction.abort(); } finally { request.result.close(); } reject(new Error('The saved database disappeared')); };
      request.onblocked = () => reject(new Error('The saved database is blocked'));
      request.onerror = () => reject(new Error('Could not read the saved database'));
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(['goals', 'transactions'], 'readonly');
        const goals = tx.objectStore('goals').getAll();
        const transactions = tx.objectStore('transactions').getAll();
        tx.onabort = tx.onerror = () => reject(new Error('Could not read the saved records'));
        tx.oncomplete = () => resolve({ goalCount: goals.result.length, amount: goals.result[0]?.currentAmount, transactionCount: transactions.result.length, transactionSum: transactions.result.reduce((sum, row) => sum + (row.type === 'withdrawal' ? -row.amount : row.amount), 0) });
      });
    } finally { db.close(); }
  });
}

for (const initial of [5000, 0]) {
  test(`Already Saved ${initial} remains ${initial} after creating one plan`, async ({ browser }, testInfo) => {
    test.setTimeout(60000);
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    try {
      await context.route('**/*', route => new URL(route.request().url()).origin === BASE_URL ? route.continue() : route.abort('blockedbyclient'));
      await context.routeWebSocket('**/*', socket => socket.close());
      const page = await context.newPage();
      await createGoal(page, initial);
      await expect(page.locator('main h1')).toHaveText('Work Laptop');
      const actual = await savedTotals(page);
      const displayed = await page.locator('main span.text-2xl').first().innerText();
      await testInfo.attach('synthetic-balance-observation', { body: JSON.stringify({ initial, displayed, ...actual }), contentType: 'application/json' });
      expect(actual.goalCount).toBe(1);
      expect(actual.transactionCount).toBe(initial ? 1 : 0);
      expect(actual.transactionSum).toBe(initial);
      // No assertion of the known wrong value: this becomes green after a fix.
      expect(actual.amount).toBe(initial);
      await expect(page.locator('main span.text-2xl').first()).toHaveText(initial ? '₹5,000' : '₹0');
    } finally { await context.close(); }
  });
}
