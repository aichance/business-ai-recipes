import assert from 'node:assert/strict';
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';
// Optional real-browser cross-check. Use an existing @playwright/test installation.
const { chromium } = await import('@playwright/test');
assert.ok(process.env.MISANECO_EVIDENCE_DIR, 'SETUP: set MISANECO_EVIDENCE_DIR outside your app source');
const root = resolve(process.env.MISANECO_DX_ROOT || '.');
const here = resolve(process.env.MISANECO_EVIDENCE_DIR);
assert.ok(here !== root && !here.startsWith(root + sep), 'SETUP: evidence must be outside dx/');
await mkdir(here, { recursive: true });
const expectedSources = {
  'data.js': '8b81a352f1a0be07b5d274add9fd20461557199d7840f31c210eb595e42ac6f6',
  'logic.js': 'f45ca29bbe47022de38508564d83d1365e77cd7630667235c500f72136c8720c',
  'app.js': '3e064dc2ffd7dfaac7595cbd2aad748e5a31bec10ad290829963277bac335554',
};
for (const [name, sha] of Object.entries(expectedSources)) {
  assert.equal(createHash('sha256').update(await readFile(resolve(root, 'js', name))).digest('hex'), sha,
    `SETUP: ${name} must match upstream 02e7befca9d5e0248f8668adf94607d8c62a9c88`);
}
const key = 'dx-diag-v1';
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    assert.ok(path === root || path.startsWith(root + sep));
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
let browserVersion;
const results = [];
async function ready(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.locator('#interClose').isVisible()) await page.locator('#interClose').click();
  await page.locator('#selCount').waitFor({ state: 'visible' });
}
async function reveal(locator) {
  assert.equal(await locator.count(), 1, 'SETUP: unique real UI control');
  for (const detail of await locator.locator('xpath=ancestor::details').all()) {
    if (!(await detail.evaluate(node => node.open))) await detail.locator(':scope > summary').click();
  }
}
try {
  browser = await chromium.launch({ headless: true });
  browserVersion = browser.version();
  for (const mode of ['same-state', 'fresh-state', 'earlier-state']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    const network = [];
    await ctx.route('**/*', route => {
      const request = route.request();
      const local = new URL(request.url()).origin === new URL(base).origin;
      network.push({ url: request.url(), method: request.method(), allowed: local });
      return local ? route.continue() : route.abort('blockedbyclient');
    });
    try {
      const primary = await ctx.newPage(); await ready(primary);
      let earlier = null;
      if (mode === 'earlier-state') { earlier = await ctx.newPage(); await ready(earlier); }
      for (const task of ['invoice', 'reconcile']) {
        const box = primary.locator(`input[data-task="${task}"]`);
        await reveal(box); await box.check();
      }
      const before = await primary.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      assert.deepEqual(before.order, ['invoice', 'reconcile'], 'SETUP: actual UI selections were persisted');
      await primary.locator('#selCount').scrollIntoViewIfNeeded();
      await primary.screenshot({ path: resolve(here, `browser-${mode}-before.png`) });
      let target = earlier || primary;
      if (mode === 'fresh-state') { target = await ctx.newPage(); await ready(target); }
      const radio = target.locator('input[name="industry"][value="realestate"]');
      await reveal(radio); await radio.check();
      await target.waitForFunction(key => JSON.parse(localStorage.getItem(key))?.industry === 'realestate', key);
      const after = await target.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      const expected = { ...before, industry: 'realestate' };
      await primary.reload({ waitUntil: 'networkidle' });
      if (await primary.locator('#interClose').isVisible()) await primary.locator('#interClose').click();
      const reloadedSelection = await primary.locator('#selCount').innerText();
      await primary.locator('#selCount').scrollIntoViewIfNeeded();
      await primary.screenshot({ path: resolve(here, `browser-${mode}-after.png`) });
      assert.equal(network.filter(x => x.allowed && x.method !== 'GET').length, 0, 'No submit or other write request');
      assert.ok(network.every(x => !x.allowed || new URL(x.url).origin === new URL(base).origin));
      const preserved = isDeepStrictEqual(after, expected);
      if (preserved) assert.equal(reloadedSelection, '2件選択中');
      results.push({ mode, before, after, expected, reloadedSelection, preserved,
        classification: preserved ? 'PASS' : 'PRESERVATION_FAIL', network });
    } finally { await ctx.close(); }
  }
} finally {
  try { if (browser) await browser.close(); }
  finally { await new Promise(done => server.close(done)); }
}
const output = { at: new Date().toISOString(), node: process.version, browser: browserVersion, base,
  source_pin: '02e7befca9d5e0248f8668adf94607d8c62a9c88', scope: 'Unchanged original app in fresh real Chromium contexts, actual UI actions, complete stored record and reloaded visible selection. All remote requests blocked; no analytics or affiliate submission.', results };
await writeFile(resolve(here, 'browser-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(results.map(x => ({ mode: x.mode, classification: x.classification, reloadedSelection: x.reloadedSelection })), null, 2));
process.exitCode = results.some(x => !x.preserved) ? 1 : 0;
