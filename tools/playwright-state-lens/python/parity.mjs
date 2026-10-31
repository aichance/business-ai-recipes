import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createStateLens } from '../lens.mjs';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2]);
  const setup = await readFile(new URL('./fixture.js', import.meta.url), 'utf8');
  await page.evaluate(`(${setup})()`);
  const lens = createStateLens(page, { screenshots: false, probes: [
    { name: 'draft', source: 'localStorage', key: 'draft', json: true },
    { name: 'session', source: 'sessionStorage', key: 'session', json: true },
    { name: 'idb', source: 'indexedDB', database: 'lens-python-test', store: 'docs', key: 'one' },
    { name: 'absent', source: 'localStorage', key: 'absent', json: true },
  ] });
  await lens.checkpoint('initial');
  await lens.step('Save and reload', async () => {
    await page.locator('#save').click();
    await page.getByText('Saved', { exact: true }).waitFor();
    await page.reload();
  });
  console.log(JSON.stringify(lens.report().checkpoints.map(c => Object.fromEntries(
    ['label', 'action', 'values', 'changes', 'scopeStatus'].map(k => [k, c[k]])))));
} finally { await browser.close(); }
