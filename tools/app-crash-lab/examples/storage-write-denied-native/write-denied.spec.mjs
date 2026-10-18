import { test, expect } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

// ADAPT: local app entry, actual saved key, normal UI and a specific visible error.
const app = new URL(process.env.STORAGE_APP_URL ?? 'http://127.0.0.1:54195/Kinetic_Curator/?boot=factory');
const key = 'kc:ledger:keeps:v1';
const errorText = /could not (?:save|write)|(?:save|write|storage) (?:failed|full)|not saved|quota exceeded/i;

for (const fault of [false, true]) test(fault ? 'a rejected keep write is visible and preserves the previous ledger' : 'control: normal keeps save and survive reload', async ({ browser }, info) => {
  test.setTimeout(60000);
  expect(app.protocol).toBe('http:');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(app.hostname);
  expect(app.username + app.password).toBe('');
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block', viewport: { width: 1400, height: 1000 } });
  const dialogs = [];
  context.on('page', page => page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); }));
  await context.route('**/*', route => new URL(route.request().url()).origin === app.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  const notice = () => page.locator('.shelf-line-text:visible').filter({ hasText: errorText });
  let controller;
  const observations = { fault, samples: [] };
  try {
    await page.goto(app.href);
    await expect(page.locator('.app')).toBeVisible();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.getByRole('tab', { name: /ASSETS/ }).click();
    await expect(page.locator('.shelf')).toBeVisible();
    await page.keyboard.press('f');
    await expect(page.locator('.hit-pill')).toHaveCount(1);
    await expect.poll(async () => {
      const value = await raw();
      if (!value) return false;
      try {
        const rows = value.trim().split('\n').map(JSON.parse);
        return rows.length === 1 && rows[0].seed === 2709429025 && Boolean(rows[0].recipe);
      } catch { return false; }
    }, { message: 'PRECONDITION: the first complete keep must actually save', timeout: 5000 }).toBe(true);
    const before = await raw();
    expect(before, 'PRECONDITION: an actual first keep must be saved').toBeTruthy();
    const lines = before.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).seed).toBe(2709429025);
    expect(JSON.parse(lines[0]).recipe).toBeTruthy();
    expect(await notice().count(), 'PRECONDITION: no old error can satisfy this check').toBe(0);
    observations.before = before;
    if (fault) {
      // Only this exact localStorage key is denied; other writes still delegate.
      // The handle proves the same controller/document remains active.
      controller = await page.evaluateHandle(key => {
        const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
        const original = descriptor.value;
        const events = [];
        function denied(name, value) {
          if (this === localStorage && String(name) === key) {
            events.push({ key, errorName: 'QuotaExceededError' });
            throw new DOMException('Synthetic exact-key write denial', 'QuotaExceededError');
          }
          return Reflect.apply(original, this, [name, value]);
        }
        Object.defineProperty(Storage.prototype, 'setItem', { ...descriptor, value: denied });
        return { events, active: () => Storage.prototype.setItem === denied, restore: () => Object.defineProperty(Storage.prototype, 'setItem', descriptor) };
      }, key);
    }
    await page.keyboard.press('f');
    if (!fault) {
      await expect.poll(async () => (await raw())?.trim().split('\n').length).toBe(2);
      const saved = await raw();
      expect(saved.startsWith(before)).toBe(true);
      const rows = saved.trim().split('\n').map(JSON.parse);
      for (const row of rows) {
        expect(typeof row.seed).toBe('number');
        expect(row.recipe).toBeTruthy();
        expect(row.timestamp).toBeTruthy();
      }
      await page.reload();
      await expect(page.locator('.app')).toBeVisible();
      expect(await raw()).toBe(saved);
      observations.afterReload = await raw();
    } else {
      await expect.poll(async () => (await controller.evaluate(c => c.events)).length, {
        message: 'PRECONDITION: the ordinary UI must attempt the denied write', timeout: 5000,
      }).toBeGreaterThan(0);
      let firstLoss;
      let visibleErrorSeen = false;
      const end = performance.now() + 1000;
      do {
        const control = await controller.evaluate(c => ({ active: c.active(), attempts: c.events.length }));
        expect(control.active, 'PRECONDITION: controller and document remain active').toBe(true);
        const value = await raw();
        if (value !== before && !firstLoss) firstLoss = { raw: value };
        visibleErrorSeen ||= await notice().count() > 0;
        observations.samples.push({ raw: value, visibleErrorSeen, ...control });
        await delay(75);
      } while (performance.now() < end);
      observations.firstLoss = firstLoss;
      observations.visibleErrorSeen = visibleErrorSeen;
      observations.fault = await controller.evaluate(c => ({ active: c.active(), events: c.events }));
      expect(firstLoss, 'PRESERVATION: a prior complete ledger changed').toBeUndefined();
      expect(await raw()).toBe(before);
      expect(visibleErrorSeen, 'FEEDBACK: a denied save must show a specific visible error').toBe(true);
    }
    expect(dialogs, 'PRECONDITION: native dialogs are outside this DOM-notice check').toEqual([]);
  } finally {
    await info.attach('saved-ledger-and-feedback', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
    try { if (controller) await controller.evaluate(c => c.restore()); }
    finally { await context.close(); }
  }
});
