import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// All inputs and the recorded publication URL are synthetic. Nothing is posted.
const fields = {
  'work-title': ['title', 'Synthetic file round-trip'],
  'work-link': ['link', 'https://example.com/synthetic-piece'],
  caption: ['caption', 'Synthetic caption: 日本語 + English.\nSecond line.'],
  credits: ['credits', 'Synthetic test fixture by aichance.'],
  description: ['description', 'Synthetic accessibility description.']
};
const recordedURL = 'https://example.com/synthetic-publication';

async function downloadDraft(page, testInfo, name) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download draft', exact: true }).click();
  const download = await pending;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  return { path, json: JSON.parse(await readFile(path, 'utf8')) };
}

async function localOnly(context, baseURL) {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', route => {
    return new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort();
  });
}

test('exported draft survives rejection and a fresh-context import', async ({ page, context, browser, baseURL }, testInfo) => {
  await localOnly(context, baseURL);
  await page.goto(baseURL);
  await page.locator('[data-view="prepare"]').click();
  for (const [id, [, value]] of Object.entries(fields)) {
    await page.locator(`#${id}`).fill(value);
  }
  await page.locator('#rights').check();
  await page.getByRole('button', { name: 'Choose where to share', exact: true }).click();
  await page.getByRole('button', { name: 'Review sharing text', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm this handoff', exact: true }).click();
  await page.locator('#publication-link').fill(recordedURL);
  await page.getByRole('button', { name: 'Record my publication link', exact: true }).click();
  await expect(page.locator('#workspace-status')).toHaveText('Publication link recorded by you; not independently verified. Download the draft to keep it.');

  const baseline = await downloadDraft(page, testInfo, 'before.json');
  for (const [, [key, value]] of Object.entries(fields)) expect(baseline.json[key]).toBe(value);
  expect(baseline.json).toMatchObject({
    schema: 'pixie-artist-draft/v1', rights: true, destination: 'bluesky',
    mediaIncluded: false, publication: 'manual; not independently verified'
  });
  expect(baseline.json.pixie_id).toMatch(/^[A-Za-z0-9-]{1,80}$/);
  expect(baseline.json.receipts).toHaveLength(1);
  expect(baseline.json.receipts[0]).toMatchObject({
    url: recordedURL, title: fields['work-title'][1], destination: 'bluesky',
    verification: 'user-reported; not independently verified'
  });
  expect(Number.isSafeInteger(baseline.json.receipts[0].revision)).toBe(true);
  expect(Number.isFinite(Date.parse(baseline.json.receipts[0].recorded_at))).toBe(true);

  await page.locator('[data-view="work"]').click();
  await page.locator('#draft-file').setInputFiles({
    name: 'unsupported.json', mimeType: 'application/json',
    buffer: Buffer.from('{"schema":"unsupported-pixie-draft"}')
  });
  await expect(page.locator('#workspace-status')).toHaveText('Import rejected: Unsupported PIXIE draft. Current work retained.');
  const afterRejection = await downloadDraft(page, testInfo, 'after-rejection.json');
  expect(afterRejection.json).toEqual(baseline.json);

  const reopened = await browser.newContext({
    baseURL, acceptDownloads: true, serviceWorkers: 'block'
  });
  try {
    await localOnly(reopened, baseURL);
    const fresh = await reopened.newPage();
    await fresh.goto(baseURL);
    await fresh.locator('#draft-file').setInputFiles(baseline.path);
    await expect(fresh.locator('#workspace-status')).toHaveText('Draft restored. Select media separately and review again.');
    for (const [id, [, value]] of Object.entries(fields)) {
      await expect(fresh.locator(`#${id}`)).toHaveValue(value);
    }
    await expect(fresh.locator('#rights')).toBeChecked();
    await fresh.locator('[data-view="share"]').click();
    await expect(fresh.locator('#destination')).toHaveValue('bluesky');
    await expect(fresh.locator('#receipt-list a')).toHaveAttribute('href', recordedURL);
    // Imports intentionally invalidate the earlier review and handoff.
    await expect(fresh.locator('#review-block')).toBeHidden();
    await expect(fresh.locator('#handoff-block')).toBeHidden();
    await expect(fresh.locator('#public-preview')).toHaveValue('');
    await expect(fresh.locator('#accessibility-preview')).toHaveValue('');
    const restored = await downloadDraft(fresh, testInfo, 'after-reopen.json');
    expect(restored.json).toEqual(baseline.json);
    await fresh.screenshot({ path: testInfo.outputPath('after-reopen.png'), fullPage: true });
  } finally {
    await reopened.close();
  }
});
