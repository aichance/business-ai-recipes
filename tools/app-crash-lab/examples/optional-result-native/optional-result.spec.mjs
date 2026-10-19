import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const target = new URL(process.env.BANK_STATEMENT_BASE_URL || 'http://localhost:3000');
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname) || target.username || target.password) throw new Error('Use a disposable loopback app');
const KEY = 'bank-statement-converter:conversion-result';
const DENIED = 'ACL_SYNTHETIC_OPTIONAL_RESULT_WRITE_DENIED';
// This pinned app already supports /ja; these are its visible Japanese labels.
const ui = { start: '変換して確認', more: 'その他の形式', failed: '変換が完了しませんでした' };
// Entirely synthetic response and one-page PDF; no real financial records.
const result = {
  "schemaVersion": "1",
  "filename": "synthetic-statement.pdf",
  "pageCount": 1,
  "tables": [
    {
      "id": "synthetic-A",
      "pageStart": 1,
      "pageEnd": 1,
      "columns": [
        { "key": "date", "label": "Date", "index": 0 },
        { "key": "description", "label": "Description", "index": 1 },
        { "key": "amount", "label": "Amount", "index": 2 }
      ],
      "rows": [
        { "values": { "date": "2026-01-02", "description": "ACL synthetic first", "amount": "-12.50" }, "source": { "page": 1, "row": 1 }, "status": "valid", "warnings": [] },
        { "values": { "date": "2026-01-03", "description": "ACL synthetic café", "amount": "100.00" }, "source": { "page": 1, "row": 2 }, "status": "valid", "warnings": [] }
      ],
      "warnings": []
    },
    {
      "id": "synthetic-B",
      "pageStart": 1,
      "pageEnd": 1,
      "columns": [
        { "key": "date", "label": "Date", "index": 0 },
        { "key": "description", "label": "Description", "index": 1 },
        { "key": "amount", "label": "Amount", "index": 2 }
      ],
      "rows": [
        { "values": { "date": "2026-01-04", "description": "ACL synthetic 別表", "amount": "0.01" }, "source": { "page": 1, "row": 3 }, "status": "valid", "warnings": [] }
      ],
      "warnings": []
    }
  ],
  "summary": { "status": "success", "tableCount": 2, "rowCount": 3, "validRowCount": 3, "warningRowCount": 0, "failedRowCount": 0 },
  "errors": []
};
const pdf = Buffer.from('JVBERi0xLjcKJYGBgYEKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMjgKPj4Kc3RyZWFtCnicHYsxCgJBDEX7nCK1ICaZ2WQGxEIZsbARcgGRVVzWQhHPvxkJefz/SN6wdyDs83nA5jTOv/H7vF3XRrXkQlYqcka/gwTPwP9TRiGshP6C7ZCsarOsRYdg1SSk3ZBFlyaUmx7DabfKsSkS6yFcVo4flrZDn8BX0BwusADVDiCVCmVuZHN0cmVhbQplbmRvYmoKCjcgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA1Ci9GaXJzdCAyNgovTGVuZ3RoIDQzMgo+PgpzdHJlYW0KeJzVU0tr3DAQvutXzLE9BD3sleyyLGzWdgslNCSBlpYeHFssLosUbG1J/31nJDmPQ8m5NoPmKX3fMCNBgIKyhAJMBSWYUsEGaiVhu2X87s+DBX7dH+3C+OdpXOAH5gi4gZ+MH/zZBZBst2PPuYc+9Cd/ZKkIJCWvGdezH8+DnWHbtV0nhBFC6BJFC6EaPA8oNYpCG2OqQh3FlFnQZwohij3GuiTapBqKx9xNrm/xxFxNOU3KLatkP71Lb7XpDvUWnnrH+JUfmz5YeNd8UEJpIfGP3/f32I7Z9sH/v+Qi/sm7fzO8m8LJrvw2+L7Jb6z49CbrdcJHPEuZuYlsUx0qWia+VBf9h+Rb+7Pij7X53ti3JsfbxDfq+gVfmc8i+2Tiqlb+MmOUu9eTSwNLYztbmuo4t/zGLv48DzjIlNd5jJDyyZ5+2zAN/YURdYWdN1WNW5NHnX/7cv/LDjGVzPYxfLwN1NXkIN+VHaf+0j/iPgn8Cy1AVoK2au+cD7RnccNcQDRk6bx1ryATIMZvz/chmuSUjF/2i41Qn3EiCDf4cXJH4F8nt3fLtDroxr/E9/CbCmVuZHN0cmVhbQplbmRvYmoKCjggMCBvYmoKPDwKL1NpemUgOQovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDQyCi9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDkgXQo+PgpzdHJlYW0KeJxjYGD4/5+JgZ2BAUQwgggmEMEMIlgYGQQYGBgZbgIJpvcMDABjNwQTCmVuZHN0cmVhbQplbmRvYmoKCnN0YXJ0eHJlZgo3NTEKJSVFT0Y=', 'base64');
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const complete = result.tables.map((table, tableIndex) =>
  frame('table', { tableIndex, table: { ...table, rows: [] } }) +
  frame('rows', { tableIndex, startIndex: 0, rows: table.rows })).join('') + frame('complete', result);

test.use({ browserName: 'chromium', locale: 'en-US', serviceWorkers: 'block' });
test.setTimeout(45000);

async function prepare(context, page, { deny = false, providerFailure = false } = {}) {
  const network = { quota: 0, conversions: 0, completedResponses: 0, blockedExternal: [], unexpectedApi: [], providerFailure };
  const pageErrors = [];
  const run = { network, pageErrors };
  page.__aclRun = run;
  page.on('pageerror', error => pageErrors.push(error.message));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== target.origin) {
      network.blockedExternal.push(url.origin + url.pathname);
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/api/convert/quota' && request.method() === 'GET') {
      network.quota++;
      return route.fulfill({ json: { remainingPages: 10, limitPages: 10, period: 'day', periodEnd: '2030-01-01T00:00:00Z' } });
    }
    if (url.pathname === '/api/convert' && request.method() === 'POST') {
      expect(request.headers()['accept']).toContain('text/event-stream');
      expect(request.postDataBuffer()?.includes(Buffer.from('synthetic-statement.pdf'))).toBe(true);
      expect(request.postDataBuffer()?.includes(pdf)).toBe(true);
      network.conversions++;
      await route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: providerFailure ? frame('error', { message: 'ACL_SYNTHETIC_CONVERSION_FAILED' }) : complete });
      if (!providerFailure) network.completedResponses++;
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      network.unexpectedApi.push({ path: url.pathname, method: request.method() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.addInitScript(({ key, denied, deny }) => {
    const original = Storage.prototype.setItem;
    window.__aclOptionalResult = { documentId: crypto.randomUUID(), attempted: 0, denied: 0, attemptedPayloads: [] };
    Storage.prototype.setItem = function (name, value) {
      if (this === sessionStorage && String(name) === key) {
        window.__aclOptionalResult.attempted++;
        window.__aclOptionalResult.attemptedPayloads.push(String(value));
        if (deny) {
          window.__aclOptionalResult.denied++;
          throw new DOMException(denied, 'QuotaExceededError');
        }
      }
      return Reflect.apply(original, this, [name, value]);
    };
  }, { key: KEY, denied: DENIED, deny });
  await page.goto(new URL('/ja', target).href);
  await page.locator('#statement-pdf').setInputFiles({ name: 'synthetic-statement.pdf', mimeType: 'application/pdf', buffer: pdf });
  const submit = page.getByRole('button', { name: ui.start, exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect.poll(() => network.conversions).toBe(1);
  await expect(page.getByRole('button', { name: ui.more, exact: true })
    .or(page.getByText(ui.failed, { exact: true }))).toBeVisible({ timeout: 15000 });
  return run;
}

function assertRun(run) {
  // Existing app checks on file selection, then revalidates on submit.
  expect(run.network.quota).toBe(2);
  expect(run.network.conversions).toBe(1);
  expect(run.network.completedResponses).toBe(run.network.providerFailure ? 0 : 1);
  expect(run.network.unexpectedApi).toEqual([]);
  expect(run.pageErrors, 'Unrelated browser errors invalidate this fixture').toEqual([]);
}

async function record(page, testInfo, run) {
  const storage = await page.evaluate(key => ({
    probe: structuredClone(window.__aclOptionalResult), raw: sessionStorage.getItem(key),
  }), KEY);
  const observation = { ...storage, ...run, body: await page.locator('body').innerText(),
    moreFormatsVisible: await page.getByRole('button', { name: ui.more, exact: true }).isVisible() };
  await testInfo.attach('optional-result.json', { body: JSON.stringify(observation, null, 2), contentType: 'application/json' });
  await testInfo.attach('optional-result.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  assertRun(run);
  return storage;
}

test.afterEach(async ({ page }, testInfo) => {
  const run = page.__aclRun;
  if (!run) return;
  // Preserve setup/failure diagnostics without replacing the original failure.
  const diagnostics = { ...run };
  try {
    diagnostics.browser = await page.evaluate(key => ({ url: location.href,
      probe: window.__aclOptionalResult, raw: sessionStorage.getItem(key), body: document.body?.innerText,
      buttons: [...document.querySelectorAll('button')].map(button => ({ text: button.innerText,
        label: button.getAttribute('aria-label'), popup: button.getAttribute('aria-haspopup'),
        visible: !!button.getClientRects().length })) }), KEY);
  } catch (error) { diagnostics.captureError = String(error); }
  await testInfo.attach('final-diagnostics.json', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' });
});

async function downloadWholeResult(page) {
  await page.getByRole('button', { name: ui.more, exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'JSON', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  expect(JSON.parse(await readFile(path, 'utf8')), 'Complete original records must survive export').toEqual(result);
}

test('normal completion saves, exports the whole result and restores after reload', async ({ context, page }, testInfo) => {
  const run = await prepare(context, page);
  const { probe, raw } = await record(page, testInfo, run);
  expect(probe.attempted).toBe(1);
  expect(probe.denied).toBe(0);
  expect(JSON.parse(raw)).toEqual({ version: 1, filename: result.filename, result });
  await downloadWholeResult(page);
  page.once('dialog', async dialog => {
    expect(dialog.type()).toBe('beforeunload');
    await dialog.accept();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => {
    const id = await page.evaluate(() => window.__aclOptionalResult?.documentId);
    return typeof id === 'string' && id !== probe.documentId;
  }).toBe(true);
  await expect(page.getByRole('button', { name: ui.more, exact: true })).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(raw);
  await downloadWholeResult(page);
  await record(page, testInfo, run);
});

test('server-error response stays an error without saving or exporting a result', async ({ context, page }, testInfo) => {
  const run = await prepare(context, page, { providerFailure: true });
  const { probe, raw } = await record(page, testInfo, run);
  expect(probe.attempted).toBe(0);
  expect(raw).toBeNull();
  await expect(page.getByText('ACL_SYNTHETIC_CONVERSION_FAILED', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: ui.more, exact: true })).toHaveCount(0);
  assertRun(run);
});

test('optional storage failure preserves the completed result and its JSON export', async ({ context, page }, testInfo) => {
  const run = await prepare(context, page, { deny: true });
  const { probe, raw } = await record(page, testInfo, run);
  expect(probe.attempted, 'PRECONDITION: exercise the actual result write').toBe(1);
  expect(probe.denied).toBe(1);
  expect(JSON.parse(probe.attemptedPayloads[0])).toEqual({ version: 1, filename: result.filename, result });
  expect(raw).toBeNull();
  await expect(page.getByRole('button', { name: ui.more, exact: true }),
    'PRESERVATION: successful server result must remain downloadable when optional session storage fails').toBeVisible();
  await downloadWholeResult(page);
  await record(page, testInfo, run);
});
