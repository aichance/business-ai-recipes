import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { createStateLens, renderTimeline } from '../lens.mjs';

// Authored local fixture, not a third-party app or an authentication session.
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Tab drafts · synthetic fixture</title>
<main><h1>A draft belonging to this tab</h1><label for="draft">Draft</label><textarea id="draft"></textarea><button id="save">Save draft</button><p id="status">Ready</p></main>
<script>
let saved=JSON.parse(sessionStorage.getItem('tab-draft')||'null');
const area=document.getElementById('draft');area.value=saved?.body||'';
document.getElementById('save').onclick=()=>{saved={body:area.value,revision:(saved?.revision||0)+1};sessionStorage.setItem('tab-draft',JSON.stringify(saved));document.getElementById('status').textContent='Saved'};
</script></html>`;

async function setup(t) {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(html); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 900, height: 620 }, serviceWorkers: 'block' });
  const page = await context.newPage(), url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  return { page, context, url };
}

const selected = { name: 'tabDraft', source: 'sessionStorage', key: 'tab-draft', json: true };

test('same-context pages retain separate session drafts through reload; native storageState is a separate baseline', async t => {
  const { page: a, context, url } = await setup(t);
  await a.evaluate(() => localStorage.setItem('tab-draft', 'shared-local-value'));
  const lensA = createStateLens(a, { title: 'Tab A', probes: [selected, { name: 'shared', source: 'localStorage', key: 'tab-draft' }] });
  await lensA.step('A saves alpha', async () => {
    await a.locator('#draft').fill('alpha-only'); await a.locator('#save').click();
    await a.getByText('Saved', { exact: true }).waitFor();
  });
  const b = await context.newPage(); await b.goto(url);
  assert.equal(await b.evaluate(() => sessionStorage.getItem('tab-draft')), null);
  const lensB = createStateLens(b, { title: 'Tab B', probes: [selected], screenshots: false });
  await lensB.step('B saves beta', async () => {
    await b.locator('#draft').fill('beta-only'); await b.locator('#save').click();
    await b.getByText('Saved', { exact: true }).waitFor();
  });
  const afterB = await lensA.checkpoint('A after B saved');
  assert.equal(afterB.values.tabDraft.value.body, 'alpha-only');
  assert.equal(afterB.values.shared.value, 'shared-local-value');
  assert.deepEqual(afterB.changes, []);
  assert.equal(lensB.report().checkpoints.at(-1).values.tabDraft.value.body, 'beta-only');
  await lensA.step('A reloads', () => a.reload());
  assert.equal(await a.locator('#draft').inputValue(), 'alpha-only');
  assert.equal(await b.locator('#draft').inputValue(), 'beta-only');
  const last = lensA.report().checkpoints.at(-1);
  assert.deepEqual(last.values.tabDraft.value, await a.evaluate(() => JSON.parse(sessionStorage.getItem('tab-draft'))));
  assert.deepEqual(last.changes, []);
  assert.ok(last.screenshot?.length > 1000);
  const native = await context.storageState({ indexedDB: true });
  assert.equal(native.origins[0].localStorage.find(x => x.name === 'tab-draft').value, 'shared-local-value');
  assert.equal(JSON.stringify(native).includes('alpha-only'), false);
  assert.equal(JSON.stringify(native).includes('beta-only'), false);
  const fresh = await context.newPage(); await fresh.goto(url);
  const empty = await createStateLens(fresh, { probes: [selected], screenshots: false }).checkpoint('Independent new Page');
  assert.equal(empty.values.tabDraft.status, 'OBSERVED'); assert.equal(empty.values.tabDraft.exists, false);
  const viewer = await context.newPage(); await viewer.setContent(renderTimeline(lensA.report()));
  assert.equal(await viewer.locator('#values').textContent().then(x => x.includes('shared-local-value')), true);
  await viewer.getByRole('button', { name: '5. A reloads · after', exact: true }).click();
  assert.equal(await viewer.locator('#values').textContent().then(x => x.includes('alpha-only')), true);
});

test('session probes preserve raw/null/missing distinctions, limits and read failures without modifying storage', async t => {
  const { page } = await setup(t);
  await page.evaluate(() => { sessionStorage.setItem('raw', 'not-json'); sessionStorage.setItem('null', 'null'); sessionStorage.setItem('large', 'x'.repeat(70000)); });
  const before = await page.evaluate(() => Object.entries(sessionStorage));
  const probes = [
    { name: 'raw', source: 'sessionStorage', key: 'raw' },
    { name: 'badJSON', source: 'sessionStorage', key: 'raw', json: true },
    { name: 'savedNull', source: 'sessionStorage', key: 'null', json: true },
    { name: 'missing', source: 'sessionStorage', key: 'missing', json: true },
    { name: 'large', source: 'sessionStorage', key: 'large' },
  ];
  const lens = createStateLens(page, { probes, screenshots: false });
  const c = await lens.checkpoint('Read selected values');
  assert.equal(c.values.raw.status, 'OBSERVED'); assert.equal(c.values.raw.value, 'not-json');
  assert.equal(c.values.badJSON.status, 'INCONCLUSIVE');
  assert.equal(c.values.savedNull.exists, true); assert.equal(c.values.savedNull.value, null);
  assert.equal(c.values.missing.exists, false); assert.equal(c.values.missing.value, null);
  assert.equal(c.values.large.status, 'INCONCLUSIVE'); assert.match(c.values.large.reason, /64KiB/);
  assert.deepEqual(await page.evaluate(() => Object.entries(sessionStorage)), before);
  assert.throws(() => createStateLens(page, { probes: [{ name: 'bad', source: 'sessionStorage', key: 42 }] }), /sessionStorage requires a string key/);
  await page.evaluate(() => Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Storage blocked by fixture', 'SecurityError'); } }));
  const denied = await lens.checkpoint('Read is refused');
  assert.ok(Object.values(denied.values).every(x => x.status === 'INCONCLUSIVE' && /Storage blocked/.test(x.reason)));
});
