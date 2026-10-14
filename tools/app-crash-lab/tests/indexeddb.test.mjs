import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { runContract } from '../lib/runner.mjs';
import { executeCheck, confineContext } from '../lib/protocol.mjs';
import { validateContract } from '../lib/contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const checkpoint = { schema: 1, day: 2, birds: ['Amber', 'Cloud'], supplies: { seed: 2, water: 3 } };
const entry = value => ({ exists: true, value });
const probe = (store = 'checkpoints', key = 'current') => ({ source: 'indexedDB', database: 'synthetic-loft', store, key });
const contract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'IndexedDB checkpoint preservation',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 1000, stabilityMs: 50,
  setup: [
    { action: 'setFile', target: { css: '#file' }, save: true, file: { name: 'checkpoint.json', mimeType: 'application/json', text: JSON.stringify(checkpoint) } },
    { action: 'expectText', target: { css: '#status' }, value: 'Saved' },
  ],
  observe: { saved: probe(), metadata: probe('metadata', 'current') },
  expected: { saved: entry(checkpoint), metadata: entry({ day: 2 }) },
  afterReload: [{ action: 'expectText', target: { css: '#status' }, value: 'Ready' }],
  rejectedUpdate: {
    steps: [{ action: 'setFile', target: { css: '#file' }, file: { name: 'broken.json', mimeType: 'application/json', text: '{' } }],
    observe: { message: { source: 'text', target: { css: '#status' } } }, expected: { message: 'Rejected JSON' },
  },
};

async function startFixture() {
  // Authored fault fixture. This is not a modified third-party game.
  const html = `<!doctype html><meta charset="utf-8"><input id="file" type="file"><p id="status">Loading</p><script>
    const mode = new URLSearchParams(location.search).get('mode');
    const done = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
    const get = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const db = mode === 'no-db' ? null : awaitOpen();
    function awaitOpen() { return new Promise((resolve, reject) => {
      const r = indexedDB.open('synthetic-loft', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('checkpoints'); r.result.createObjectStore('metadata'); };
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); window.fixtureDb = r.result; resolve(r.result); };
      r.onerror = () => reject(r.error);
    }); }
    async function write(value, metadata = { day: 2 }, key = 'current') {
      const d = await db; const tx = d.transaction(['checkpoints', 'metadata'], 'readwrite');
      tx.objectStore('checkpoints').put(value, key); tx.objectStore('metadata').put(metadata, 'current');
      await done(tx);
    }
    window.commitNext = () => write({ ...${JSON.stringify(checkpoint)}, day: 3 }, { day: 3 });
    async function load() {
      if (!db) return;
      const d = await db; const value = await get(d.transaction('checkpoints').objectStore('checkpoints').get('current'));
      if (value === undefined) return;
      if (mode === 'broken-reload') await write({ ...value, birds: [] });
      if (['delete-record', 'delete-null'].includes(mode)) { const tx = d.transaction('checkpoints', 'readwrite'); tx.objectStore('checkpoints').delete('current'); await done(tx); }
    }
    const ready = load().then(() => { document.querySelector('#status').textContent = 'Ready'; });
    document.querySelector('#file').onchange = async event => {
      await ready;
      let value;
      try { value = JSON.parse(await event.target.files[0].text()); }
      catch {
        if (mode === 'broken-reject') await write({ ...${JSON.stringify(checkpoint)}, birds: [] });
        document.querySelector('#status').textContent = 'Rejected JSON'; return;
      }
      if (mode === 'no-db') { document.querySelector('#status').textContent = 'Saved'; return; }
      if (mode === 'delayed') await new Promise(r => setTimeout(r, 120));
      if (mode === 'date') value = new Date('2026-01-01T00:00:00Z');
      if (mode === 'map') value = new Map([['day', 2]]);
      if (mode === 'blob') value = new Blob(['synthetic'], { type: 'text/plain' });
      if (mode === 'binary') value = new Uint8Array([1, 2]).buffer;
      if (mode === 'bigint') value = 2n;
      if (mode === 'nan') value = NaN;
      if (mode === 'cycle') { value = {}; value.self = value; }
      if (mode === 'undefined') value = undefined;
      if (['null', 'delete-null'].includes(mode)) value = null;
      if (mode === 'array-key') { await write(value, { day: 2 }, ['slot', 2]); }
      else await write(value);
      if (mode === 'unavailable') indexedDB.databases = undefined;
      if (mode === 'stalled-list') indexedDB.databases = () => new Promise(() => {});
      if (mode === 'delete-race') {
        const list = indexedDB.databases.bind(indexedDB); let first = true;
        indexedDB.databases = async () => {
          const snapshot = await list();
          if (first) { first = false; (await db).close(); await get(indexedDB.deleteDatabase('synthetic-loft')); }
          return snapshot;
        };
      }
      if (mode === 'late-upgrade' || mode === 'blocked-event') {
        const list = indexedDB.databases.bind(indexedDB), open = indexedDB.open.bind(indexedDB);
        window.realDatabases = list; window.realOpen = open;
        window.observerUpgrades = 0; window.observerCloses = 0;
        indexedDB.open = (...args) => {
          const r = open(...args);
          const trackClose = () => { const connection = r.result, close = connection.close.bind(connection); connection.close = () => { window.observerCloses++; close(); }; };
          r.addEventListener('upgradeneeded', () => { window.observerUpgrades++; trackClose(); });
          r.addEventListener('success', trackClose);
          if (mode === 'blocked-event') queueMicrotask(() => r.dispatchEvent(new Event('blocked')));
          return r;
        };
        if (mode === 'late-upgrade') {
          const snapshot = await list(), held = await db;
          held.onversionchange = null;
          window.pendingDeletion = get(indexedDB.deleteDatabase('synthetic-loft'));
          indexedDB.databases = () => Promise.resolve(snapshot);
          setTimeout(() => held.close(), 500);
        }
      }
      document.querySelector('#status').textContent = 'Saved';
    };
  </script>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('IndexedDB saves, faults, missing namespaces and standalone specs', { timeout: 180000 }, async t => {
  const app = await startFixture();
  const temp = await mkdtemp(join(root, '.crash-lab-indexeddb-'));
  t.after(async () => { await app.close(); await rm(temp, { recursive: true, force: true }); });
  const run = (name, changes = {}) => runContract({ ...contract, baseURL: app.baseURL, ...changes }, { out: join(temp, name) });
  let fixed, broken;
  await t.test('delayed save then reload and rejected JSON preserve both object stores', async () => {
    fixed = await run('normal', { path: '/?mode=delayed' });
    assert.deepEqual(fixed.results.map(r => r.status), ['pass', 'pass'], JSON.stringify(fixed));
    for (const r of fixed.results) assert.deepEqual(r.after, { saved: entry(checkpoint), metadata: entry({ day: 2 }) });
  });
  await t.test('actual stored corruption after reload or rejection fails', async () => {
    for (const mode of ['broken-reload', 'broken-reject']) {
      const r = await run(mode, { path: '/?mode=' + mode });
      assert.equal(r.exitCode, 1, JSON.stringify(r));
      assert.equal(r.results[mode === 'broken-reload' ? 0 : 1].status, 'fail');
      assert.ok(r.results.some(x => x.differences.some(d => d.path.includes('birds'))));
      broken = r;
    }
  });
  await t.test('missing record differs from an existing JSON-null record', async () => {
    const nullContract = { observe: { saved: probe() }, expected: { saved: entry(null) }, checks: ['reload'] };
    const good = await run('null', { ...nullContract, path: '/?mode=null' });
    assert.equal(good.exitCode, 0, JSON.stringify(good));
    const deleted = await run('deleted', { ...nullContract, path: '/?mode=delete-null' });
    assert.equal(deleted.exitCode, 1, JSON.stringify(deleted));
    assert.deepEqual(deleted.results[0].after.saved, { exists: false, value: null });
  });
  await t.test('JSON string parsing, paths and array keys are explicit', async () => {
    const parsed = await run('parsed', { setup: [{ ...contract.setup[0], file: { ...contract.setup[0].file, text: JSON.stringify(JSON.stringify(checkpoint)) } }], observe: { day: { ...probe(), parse: 'json', jsonPath: ['value', 'day'] } }, expected: { day: 2 }, checks: ['reload'] });
    assert.equal(parsed.exitCode, 0, JSON.stringify(parsed));
    const array = await run('array', { path: '/?mode=array-key', observe: { saved: probe('checkpoints', ['slot', 2]) }, expected: { saved: entry(checkpoint) }, checks: ['reload'] });
    assert.equal(array.exitCode, 0, JSON.stringify(array));
    const valueOnly = await run('value-only', { observe: { saved: { ...probe(), field: 'value' } }, expected: { saved: checkpoint }, checks: ['reload'] });
    assert.equal(valueOnly.exitCode, 0, JSON.stringify(valueOnly));
    assert.deepEqual(valueOnly.results[0].after.saved, checkpoint);
  });
  await t.test('unsupported structured-clone data never becomes an equal JSON value', async () => {
    for (const mode of ['date', 'map', 'blob', 'binary', 'bigint', 'nan', 'cycle', 'undefined']) {
      const r = await run(mode, { path: '/?mode=' + mode, checks: ['reload'] });
      assert.equal(r.exitCode, 2, JSON.stringify(r));
      assert.equal(r.results[0].phase, 'baseline');
      assert.match(r.results[0].error, /JSON data/);
    }
    const exists = await run('exists', { path: '/?mode=undefined', observe: { saved: { ...probe(), field: 'exists' } }, expected: { saved: true }, checks: ['reload'] });
    assert.equal(exists.exitCode, 0, JSON.stringify(exists));
  });
  await t.test('missing database, missing store and unavailable API are inconclusive', async () => {
    for (const [name, changes, error] of [
      ['no-db', { path: '/?mode=no-db' }, /database is missing/],
      ['no-store', { observe: { ...contract.observe, saved: probe('not-a-store') } }, /store not-a-store is missing/],
      ['no-api', { path: '/?mode=unavailable' }, /enumeration is unavailable/],
      ['stalled', { path: '/?mode=stalled-list' }, /listing timed out/],
    ]) {
      const r = await run(name, { ...changes, timeoutMs: 200, checks: ['reload'] });
      assert.equal(r.exitCode, 2, JSON.stringify(r)); assert.match(r.results[0].error, error);
    }
  });
  await t.test('listing/open deletion race does not create a persistent replacement database', async () => {
    const browser = await chromium.launch(); const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await confineContext(context, app.baseURL); const page = await context.newPage();
      const result = await executeCheck(page, validateContract({ ...contract, baseURL: app.baseURL, path: '/?mode=delete-race', timeoutMs: 250, checks: ['reload'] }), 'reload');
      assert.equal(result.status, 'inconclusive', JSON.stringify(result));
      assert.deepEqual(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name)), []);
    } finally { await context.close(); await browser.close(); }
  });
  await t.test('a writer between page reads cannot mix two stores in one baseline', async () => {
    const browser = await chromium.launch(); const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await confineContext(context, app.baseURL); const page = await context.newPage(); const evaluate = page.evaluate.bind(page); let changed = false;
      page.evaluate = async (...args) => { const value = await evaluate(...args); if (!changed && value?.values?.saved) { changed = true; await evaluate(() => window.commitNext()); } return value; };
      const r = await executeCheck(page, validateContract({ ...contract, baseURL: app.baseURL, checks: ['reload'] }), 'reload');
      assert.deepEqual(r.before, { saved: entry(checkpoint), metadata: entry({ day: 2 }) });
      assert.equal(r.after.saved.value.day, 3); assert.equal(r.after.metadata.value.day, 3); assert.equal(r.status, 'fail');
      // Only the fixture connection should remain; the observer must not block an upgrade.
      await evaluate(async () => { window.fixtureDb.close(); await new Promise((resolve, reject) => { const r = indexedDB.open('synthetic-loft', 2); const timer = setTimeout(() => reject(Error('observer leaked a connection')), 500); r.onupgradeneeded = () => r.result.createObjectStore('next-version'); r.onsuccess = () => { clearTimeout(timer); r.result.close(); resolve(); }; r.onerror = () => { clearTimeout(timer); reject(r.error); }; }); });
    } finally { await context.close(); await browser.close(); }
  });
  await t.test('late open events after timeout or blocked failure close their connections', async () => {
    const browser = await chromium.launch();
    try {
      for (const mode of ['late-upgrade', 'blocked-event']) {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        try {
          await confineContext(context, app.baseURL); const page = await context.newPage();
          const r = await executeCheck(page, validateContract({ ...contract, baseURL: app.baseURL, path: '/?mode=' + mode, timeoutMs: 200, checks: ['reload'] }), 'reload');
          assert.equal(r.status, 'inconclusive', JSON.stringify(r));
          assert.match(r.error, mode === 'late-upgrade' ? /read timed out/ : /open blocked/);
          await page.waitForFunction(() => window.observerCloses > 0, null, { timeout: 2000 });
          if (mode === 'late-upgrade') {
            assert.equal(await page.evaluate(() => window.observerUpgrades), 1);
            assert.deepEqual(await page.evaluate(async () => (await window.realDatabases()).map(d => d.name)), []);
          }
          await page.evaluate(async () => {
            window.fixtureDb.close();
            await new Promise((resolve, reject) => { const r = window.realOpen('synthetic-loft', 2); const timer = setTimeout(() => reject(Error('late observer connection leaked')), 500); r.onupgradeneeded = () => r.result.createObjectStore('after-observer'); r.onsuccess = () => { clearTimeout(timer); r.result.close(); resolve(); }; r.onerror = () => { clearTimeout(timer); reject(r.error); }; });
          });
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
  });
  await t.test('generated standalone checks reproduce both PASS and stored corruption FAIL', async () => {
    for (const [r, expectedCode] of [[fixed, 0], [broken, 1]]) {
      const spec = await readFile(join(r.out, 'repro.spec.mjs'), 'utf8');
      assert.ok(!spec.includes("from '../lib"));
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(r.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
        child.on('error', reject); child.on('close', code => resolve({ code, output }));
      });
      assert.equal(result.code, expectedCode, result.output);
    }
  });
});
