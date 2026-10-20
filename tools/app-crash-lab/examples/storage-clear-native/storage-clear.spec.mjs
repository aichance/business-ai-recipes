import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sourceDir = process.env.STORAGE_CLEAR_SOURCE_DIR;
if (!sourceDir) throw new Error('SETUP: set STORAGE_CLEAR_SOURCE_DIR to a disposable pinned checkout');
const hookPath = resolve(sourceDir, 'src/useLocalStorageState.ts');
const acceptedHooks = {
  a95e073e7555c6c081921800d3996022af2119a7: '799291ab6152fbdca80823bf6b12e87257d98638',
  '89e465e1bbf027e367d3362e79a3a519a275698f': 'f53a57a5e069262713e3ab6ae096e4c679ebc327',
};
const baseline = {
  todos: [{ id: 'task-a', title: 'Synthetic saved task', done: false }],
  prefs: { theme: 'dark', columns: ['title', 'done'], revision: 7 },
};
const updated = { ...baseline, todos: [{ id: 'task-a', title: 'Updated in peer', done: true }] };
const empty = { todos: null, prefs: null };
const keys = ['acl-clear:todos', 'acl-clear:prefs'];
let server;
let baseURL;
let hookBlob;

async function verifyHook() {
  const value = await readFile(hookPath);
  const blob = createHash('sha1').update(`blob ${value.length}\0`).update(value).digest('hex');
  expect(acceptedHooks[blob], 'SETUP: upstream hook has an unreviewed source hash').toBeTruthy();
  return blob;
}

test.use({ browserName: 'chromium', viewport: { width: 1100, height: 800 } });
test.setTimeout(30_000);

test.beforeAll(async () => {
  hookBlob = await verifyHook();
  const bundle = await build({
    entryPoints: [resolve(here, 'consumer.mjs')],
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    alias: { react: require.resolve('react'), 'react-dom/client': require.resolve('react-dom/client') },
    plugins: [{ name: 'unchanged-upstream-hook', setup(plugin) {
      plugin.onResolve({ filter: /^measured-hook$/ }, () => ({ path: hookPath }));
    } }],
  });
  const script = bundle.outputFiles[0].contents;
  server = createServer((request, response) => {
    if (request.url === '/bundle.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(script);
    } else {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Native storage event lab</title><style>body{font:16px system-ui;padding:24px}button{padding:10px;margin:5px}pre{white-space:pre-wrap;background:#eee;padding:16px}</style><div id="root"></div><script src="/bundle.js"></script></html>');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server?.listening) await new Promise((done) => server.close(done));
  if (hookBlob) expect(await verifyHook(), 'Source must remain unchanged').toBe(hookBlob);
});

async function start(context) {
  const pageErrors = [];
  const blockedRequests = [];
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === baseURL) return route.continue();
    blockedRequests.push(route.request().url());
    return route.abort();
  });
  const reader = await context.newPage();
  const writer = await context.newPage();
  for (const page of [reader, writer]) {
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text()); });
    await page.goto(baseURL);
    await page.waitForFunction(() => window.__consumerMounted === true);
  }
  await writer.getByRole('button', { name: 'Seed local records', exact: true }).click();
  await expect(reader.getByTestId('hook-state')).toHaveText(JSON.stringify(baseline));
  await expect.poll(() => reader.evaluate(() => window.__nativeEvents.filter(
    (e) => e.area === 'local' && e.isTrusted && e.key !== null).length)).toBe(2);
  return { reader, writer, pageErrors, blockedRequests };
}

async function snapshot(page) {
  return page.evaluate((names) => ({
    hookState: JSON.parse(document.querySelector('[data-testid="hook-state"]').textContent),
    durable: names.map((key) => localStorage.getItem(key)),
    events: [...window.__nativeEvents],
  }), keys);
}

async function record(testInfo, env, checkpoints) {
  expect(env.pageErrors, 'SETUP: no console/runtime errors').toEqual([]);
  expect(env.blockedRequests, 'SETUP: no non-local request attempted').toEqual([]);
  await testInfo.attach('native-storage-measurement', {
    body: JSON.stringify({ sourcePin: acceptedHooks[hookBlob], hookBlob, checkpoints,
      pageErrors: env.pageErrors, blockedRequests: env.blockedRequests }, null, 2),
    contentType: 'application/json',
  });
}

test('control: actual peer setItem updates the complete record and keeps the other key', async ({ context }, testInfo) => {
  const env = await start(context);
  await env.writer.getByRole('button', { name: 'Update local todos', exact: true }).click();
  await expect(env.reader.getByTestId('hook-state')).toHaveText(JSON.stringify(updated));
  const after = await snapshot(env.reader);
  expect(after.durable).toEqual([JSON.stringify(updated.todos), JSON.stringify(updated.prefs)]);
  expect(after.events.filter((e) => e.isTrusted && e.area === 'local' && e.key === keys[0])).toHaveLength(2);
  await env.reader.reload();
  await expect(env.reader.getByTestId('hook-state')).toHaveText(JSON.stringify(updated));
  await record(testInfo, env, { after, reloaded: await snapshot(env.reader) });
});

test('control: actual iframe sessionStorage.clear leaves local records and hook values intact', async ({ context }, testInfo) => {
  const env = await start(context);
  const frame = env.reader.frameLocator('iframe[title="Session peer"]');
  await frame.getByRole('button', { name: 'Seed session storage', exact: true }).click();
  await frame.getByRole('button', { name: 'Clear session storage', exact: true }).click();
  await expect.poll(() => env.reader.evaluate(() => window.__nativeEvents.filter(
    (e) => e.area === 'session' && e.key === null && e.isTrusted).length)).toBe(1);
  const after = await snapshot(env.reader);
  expect(after.hookState).toEqual(baseline);
  expect(after.durable).toEqual([JSON.stringify(baseline.todos), JSON.stringify(baseline.prefs)]);
  await record(testInfo, env, { after });
});

test('peer localStorage.clear updates both mounted consumers before any reload', async ({ context }, testInfo) => {
  const env = await start(context);
  await env.writer.getByRole('button', { name: 'Clear local storage', exact: true }).click();
  await expect.poll(() => env.reader.evaluate(() => window.__nativeEvents.filter(
    (e) => e.area === 'local' && e.key === null && e.isTrusted).length)).toBe(1);
  const eventReceived = await snapshot(env.reader);
  expect(eventReceived.durable, 'PRECONDITION: browser really cleared both keys').toEqual([null, null]);
  const clearEvent = eventReceived.events.find((e) => e.area === 'local' && e.key === null);
  expect(clearEvent).toMatchObject({ oldValue: null, newValue: null, isTrusted: true });
  let staleAssertion;
  try {
    await expect(env.reader.getByTestId('hook-state'), 'CONSISTENCY: mounted hook values must reflect the actual clear event').toHaveText(JSON.stringify(empty), { timeout: 2000 });
  } catch (error) { staleAssertion = error; }
  const beforeReload = await snapshot(env.reader);
  await env.reader.screenshot({ path: testInfo.outputPath('before-reload.png') });
  await env.reader.reload();
  await expect(env.reader.getByTestId('hook-state')).toHaveText(JSON.stringify(empty));
  await record(testInfo, env, { eventReceived, beforeReload, afterReload: await snapshot(env.reader) });
  if (staleAssertion) throw staleAssertion;
});
