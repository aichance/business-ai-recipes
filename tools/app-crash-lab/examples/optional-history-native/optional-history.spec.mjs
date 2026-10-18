import { test, expect } from '@playwright/test';

const target = new URL(process.env.OPTIONAL_HISTORY_BASE_URL || 'http://127.0.0.1:54201');
if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:') throw new Error('Use a disposable IPv4 loopback app');
const KEY = 'translation_history';
const DENIED = 'C_SYNTHETIC_HISTORY_WRITE_DENIED';
// Adapt this visible main-failure signature when adapting the MAL UI/locale.
const mainFailure = /^(?:Error:\s*C_SYNTHETIC_HISTORY_WRITE_DENIED$|(?:Error:\s*)?(?:Translation|OCR)\s+(?:failed|unsuccessful)\b)/i;
const fakeKey = 'fake-local-test-only';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/y4sAAAAASUVORK5CYII=', 'base64');

test.use({ serviceWorkers: 'block', browserName: 'chromium' });
test.setTimeout(30000);
test.beforeEach(async ({ page }) => {
  page.__unhandledErrors = [];
  page.on('pageerror', error => page.__unhandledErrors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(page.__unhandledErrors, 'PRECONDITION: unrelated page errors invalidate the fixture').toEqual([]);
});

async function prepare(context, page, { providerFailure = false } = {}) {
  const network = { fulfilled: 0, blocked: 0, providerFailure, responses: [] };
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === target.origin) return route.continue();
    const provider = url.origin === 'https://generativelanguage.googleapis.com' &&
      /^\/v1beta\/models\/[^/]+:generateContent$/.test(url.pathname) && url.searchParams.get('key') === fakeKey;
    if (!provider || !['POST', 'OPTIONS'].includes(request.method())) {
      network.blocked++;
      return route.abort('blockedbyclient');
    }
    const headers = { 'access-control-allow-origin': target.origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const payload = request.postDataJSON();
    expect(payload.contents[0].parts[1].inlineData.mimeType).toBe('image/jpeg');
    expect(payload.contents[0].parts[1].inlineData.data.length).toBeGreaterThan(0);
    network.fulfilled++;
    const value = { ocr: `Synthetic OCR ${network.fulfilled}`, translation: `Synthetic translation ${network.fulfilled}` };
    network.responses.push(value);
    await route.fulfill({ status: providerFailure ? 500 : 200, headers, contentType: 'application/json',
      body: JSON.stringify(providerFailure ? { error: { message: 'C_SYNTHETIC_PROVIDER_FAILURE' } } :
        { candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) });
  });
  await context.addInitScript(({ key, denied }) => {
    const original = Storage.prototype.setItem;
    window.__historyProbe = { armed: false, denied: 0, attempted: 0, toasts: [] };
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && String(name) === key) {
        window.__historyProbe.attempted++;
        if (window.__historyProbe.armed) {
          window.__historyProbe.denied++;
          queueMicrotask(() => {
            const toast = document.querySelector('#toast');
            window.__historyProbe.denialOutcome = {
              toast: document.querySelector('#toastText')?.textContent || '',
              toastShown: !!toast?.classList.contains('show') && !!toast.getClientRects().length,
              translation: document.querySelector('#engTextarea')?.value,
            };
          });
          throw new DOMException(denied, 'QuotaExceededError');
        }
      }
      return Reflect.apply(original, this, [name, value]);
    };
    new MutationObserver(() => {
      const toast = document.querySelector('#toast');
      if (toast?.classList.contains('show') && toast.getClientRects().length) {
        const text = document.querySelector('#toastText')?.textContent || '';
        if (window.__historyProbe.toasts.at(-1) !== text) window.__historyProbe.toasts.push(text);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  }, { key: KEY, denied: DENIED });
  await page.goto(target.href);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Gemini API Key', { exact: true }).fill(fakeKey);
  await page.getByRole('button', { name: 'Save Configuration', exact: true }).click();
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#translateBtn')).toBeEnabled();
  return network;
}

async function successfulTranslation(page, number) {
  await page.locator('#translateBtn').click();
  await expect(page.locator('#resultsSection')).toBeVisible();
  await expect(page.locator('#malTextarea')).toHaveValue(`Synthetic OCR ${number}`);
  await expect(page.locator('#engTextarea')).toHaveValue(`Synthetic translation ${number}`);
  await expect(page.locator('#translateBtn')).toBeEnabled();
}

async function baseline(page, network) {
  await successfulTranslation(page, 1);
  expect(network.fulfilled).toBe(1);
  await expect(page.locator('#toastText')).toHaveText('Translation completed!');
  const raw = await page.evaluate((key) => localStorage.getItem(key), KEY);
  const records = JSON.parse(raw);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ ocr: 'Synthetic OCR 1', translation: 'Synthetic translation 1' });
  return raw;
}

test('normal translation succeeds and persists its history', async ({ context, page }) => {
  const network = await prepare(context, page);
  await baseline(page, network);
});

test('successful translation is not reported as failed when optional history is denied', async ({ context, page }, testInfo) => {
  const network = await prepare(context, page);
  const prior = await baseline(page, network);
  await page.evaluate(() => { window.__historyProbe.armed = true; window.__historyProbe.toasts = []; });
  await successfulTranslation(page, 2);
  expect(network.fulfilled).toBe(2);
  const probe = await page.evaluate(() => structuredClone(window.__historyProbe));
  const persisted = await page.evaluate((key) => localStorage.getItem(key), KEY);
  expect(probe.denied, 'Fault precondition: a real history write must be denied').toBeGreaterThan(0);
  expect(probe.denialOutcome, 'PRECONDITION: capture feedback before the toast expires').toBeTruthy();
  expect(probe.denialOutcome.translation).toBe('Synthetic translation 2');
  expect(persisted, 'Prior durable history must remain byte-identical').toBe(prior);
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach('optional-history.png', { body: screenshot, contentType: 'image/png' });
  await testInfo.attach('optional-history.json', { body: JSON.stringify({ network, probe,
    resultVisible: await page.locator('#resultsSection').isVisible(),
    translation: await page.locator('#engTextarea').inputValue(), priorHistoryPreserved: persisted === prior }), contentType: 'application/json' });
  // A truthful history-only warning is allowed. Ignore hidden text left in the DOM.
  const visibleNotices = [...probe.toasts,
    ...(probe.denialOutcome.toastShown ? [probe.denialOutcome.toast] : [])];
  expect(visibleNotices.filter(text => mainFailure.test(text)),
    'OUTCOME: provider succeeded; optional cache failure is not translation failure').toEqual([]);
});

test('real provider failure remains a failure, without a history write', async ({ context, page }) => {
  const network = await prepare(context, page, { providerFailure: true });
  await page.locator('#translateBtn').click();
  await expect(page.locator('#toastText')).toHaveText('Error: C_SYNTHETIC_PROVIDER_FAILURE');
  await expect(page.locator('#toast')).toBeVisible();
  await expect(page.locator('#resultsSection')).toBeHidden();
  await expect(page.locator('#translateBtn')).toBeEnabled();
  expect(network.fulfilled).toBe(1);
  const probe = await page.evaluate(() => structuredClone(window.__historyProbe));
  expect(probe.attempted).toBe(0);
});
