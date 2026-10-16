import { test, expect } from '@playwright/test';

const baseURL = process.env.APP_CRASH_LAB_BASE_URL ?? 'http://127.0.0.1:30092';
const origin = new URL(baseURL);
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
    || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Use an HTTP loopback origin for a disposable local app only.');
}
const expected = {
  theme: 'Synthetic draft: a library on the moon',
  level: 'B1',
  length: '5 min',
  model: 'Gemini 3.1 Flash Lite',
};

test.use({ baseURL, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
test.beforeEach(async ({ context }) => {
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin.origin) return route.continue();
    return route.abort('blockedbyclient');
  });
});

async function selectedRadio(page, names) {
  const selected = [];
  for (const name of names) {
    if (await page.getByRole('radio', { name, exact: true }).isChecked()) selected.push(name);
  }
  expect(selected).toHaveLength(1);
  return selected[0];
}

async function choices(page) {
  return {
    theme: await page.getByRole('textbox', { name: 'Theme (optional)', exact: true }).inputValue(),
    level: await selectedRadio(page, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
    length: await selectedRadio(page, ['5 min', '10 min', '15 min']),
    model: (await page.getByRole('combobox', { name: 'Model', exact: true }).textContent()).trim(),
  };
}

async function fillDraft(page) {
  await page.goto('/#/new');
  await page.getByRole('textbox', { name: 'Theme (optional)', exact: true }).fill(expected.theme);
  await page.getByRole('radio', { name: expected.level, exact: true }).click();
  await page.getByRole('radio', { name: expected.length, exact: true }).click();
  // The checked upstream exposes only one supported model. Its value is observed;
  // this does not prove that changing between multiple models is preserved.
  expect(await choices(page)).toEqual(expected);
  await expect(page.getByRole('button', { name: 'Generate Story', exact: true })).toBeDisabled();
}

async function compareDraft(page, testInfo, transition) {
  const actual = await choices(page);
  const savedStoryCount = await page.evaluate(() => JSON.parse(localStorage.getItem('era.v1.stories') ?? '[]').length);
  await testInfo.attach('draft-observation', {
    body: Buffer.from(JSON.stringify({ transition, expected, actual, savedStoryCount }, null, 2)),
    contentType: 'application/json',
  });
  await testInfo.attach('after-transition', { body: await page.screenshot(), contentType: 'image/png' });
  expect.soft(actual).toEqual(expected);
  expect.soft(savedStoryCount).toBe(0);
}

// These are ordinary failing regression tests on the pinned upstream, not test.fail()
// cases. After the author implements issue26, the same assertions should turn green.
test('unfinished draft survives a full reload', async ({ page }, testInfo) => {
  await fillDraft(page);
  await page.reload();
  await compareDraft(page, testInfo, 'reload');
});

test('unfinished draft survives Settings navigation and return', async ({ page }, testInfo) => {
  await fillDraft(page);
  await page.getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'New Story', exact: true }).click();
  await compareDraft(page, testInfo, 'Settings and return');
});
