import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const base = new URL(process.env.VOXELDRAFT_BASE_URL ?? 'http://127.0.0.1:54630');
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('Use a disposable app at one explicit HTTP loopback origin.');
}
const fileInput = 'input[type="file"][accept=".json,.vox,.png,.jpg,.jpeg"]';
const fixture = await readFile(new URL('./project.voxs.json', import.meta.url));
const contextOptions = {
  viewport: { width: 1280, height: 720 },
  serviceWorkers: 'block',
};

async function fresh(browser) {
  const context = await browser.newContext(contextOptions);
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    return url.origin === base.origin && ['GET', 'HEAD'].includes(request.method())
      ? route.continue() : route.abort();
  });
  return context;
}

async function open(context) {
  const page = await context.newPage();
  await page.goto(new URL('/ja/edit/', base).href, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(fileInput)).toBeAttached();
  await expect(page.locator('canvas')).toBeVisible();
  return page;
}

async function importFile(page, bytes, name) {
  await page.locator(fileInput).setInputFiles({
    name, mimeType: 'application/json', buffer: bytes,
  });
  await expect(page.locator('input[value="ACL 土台 🧱"]')).toBeVisible();
}

async function saved(page) {
  const projects = await page.evaluate(() => JSON.parse(localStorage.getItem('voxel-projects-v1')));
  expect(projects, 'One synthetic browser-local project').toHaveLength(1);
  return projects[0];
}

function selected(project) {
  return {
    // Only outer voxel order is insignificant; IDs and every voxel field remain exact.
    voxels: [...project.voxels].sort((a, b) => a.id.localeCompare(b.id)),
    layers: project.layers,
    activeLayerId: project.activeLayerId,
  };
}

async function exportFile(page) {
  await page.locator('button:has(svg.lucide-download)').click();
  const pending = page.waitForEvent('download', { timeout: 10000 });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  return { bytes: await readFile(path), name: download.suggestedFilename() };
}

for (const splitLayers of [false, true]) {
  test(splitLayers
    ? 'JSON backup preserves voxels assigned to two occupied layers'
    : 'control: JSON backup preserves one occupied layer', async ({ browser }) => {
    const contexts = [];
    try {
      const source = await fresh(browser);
      contexts.push(source);
      const page = await open(source);
      await importFile(page, fixture, 'acl-synthetic.voxs.json');
      await expect.poll(async () => (await saved(page)).voxels.length).toBe(2);
      if (splitLayers) {
        await page.locator('div:has(> input[value="ACL 上部 🌱"])')
          .getByRole('button', { name: 'Use', exact: true }).click();
        await page.locator('canvas').click();
        await expect.poll(async () => (await saved(page)).voxels.length).toBe(3);
      }
      const before = selected(await saved(page));
      expect(new Set(before.voxels.map(voxel => voxel.layerId)).size).toBe(splitLayers ? 2 : 1);
      const actualFile = await exportFile(page);
      expect(selected(await saved(page)), 'Export must not mutate selected source data').toEqual(before);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('input[value="ACL 土台 🧱"]')).toBeVisible();
      expect(selected(await saved(page)), 'Normal source reload').toEqual(before);

      const target = await fresh(browser);
      contexts.push(target);
      const restored = await open(target);
      // Deliver the app's original download bytes, not a reconstructed fixture.
      await importFile(restored, actualFile.bytes, actualFile.name);
      await expect.poll(async () => (await saved(restored)).voxels.length).toBe(before.voxels.length);
      const afterImport = selected(await saved(restored));
      await restored.reload({ waitUntil: 'domcontentloaded' });
      await expect(restored.locator('input[value="ACL 土台 🧱"]')).toBeVisible();
      const afterReload = selected(await saved(restored));
      expect.soft(afterImport, 'Fresh import keeps complete selected voxel/layer values').toEqual(before);
      expect(afterReload, 'Restored reload keeps original selected voxel/layer values').toEqual(before);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
}
