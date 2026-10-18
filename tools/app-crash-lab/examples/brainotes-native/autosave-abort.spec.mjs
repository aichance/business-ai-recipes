import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const origin = process.env.BRAINOTES_URL || 'http://127.0.0.1:57973';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) {
  throw new Error('Use a disposable local BraiNOTES instance. Public/production origins are refused.');
}
const savedTitle = 'Saved in this browser';
const failedTitle = 'Could not save, the browser storage may be full';
test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block',
  viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });

// The application still calls the real put. Only a matching native transaction
// is aborted, after its page request succeeds but before transaction commit.
function installObserver() {
  const observation = window.__acl = { armed: false, target: null, attempts: [], ui: [] };
  const nativeTransaction = IDBDatabase.prototype.transaction;
  const nativePut = IDBObjectStore.prototype.put;
  const seen = new WeakMap();
  // Register before idb wraps the returned transaction and installs its done
  // listener. A listener first added at put-time runs after idb's listener and
  // can timestamp complete after the app's promise continuation/DOM update.
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = nativeTransaction.apply(this, args);
    if (this.name === 'brainotes' && tx.mode === 'readwrite'
        && [...tx.objectStoreNames].sort().join(',') === 'notebooks,pages') {
      tx.addEventListener('abort', () => {
        const attempt = seen.get(tx);
        if (attempt) Object.assign(attempt, { aborted: true, abortAt: performance.now(), error: tx.error?.name ?? null });
      }, { once: true });
      tx.addEventListener('complete', () => {
        const attempt = seen.get(tx);
        if (attempt) Object.assign(attempt, { completed: true, completeAt: performance.now(),
          completionObserver: 'registered-at-native-transaction-return-before-idb' });
      }, { once: true });
    }
    return tx;
  };
  IDBObjectStore.prototype.put = function (...args) {
    const tx = this.transaction;
    const value = args[0];
    const target = observation.target;
    const matches = target && tx.db.name === 'brainotes' && tx.mode === 'readwrite'
      && [...tx.objectStoreNames].sort().join(',') === 'notebooks,pages'
      && this.name === 'pages' && value?.id === target.pageId
      && value?.notebookId === target.notebookId;
    let attempt;
    if (matches) {
      attempt = seen.get(tx);
      if (!attempt) {
        attempt = { index: observation.attempts.length, at: performance.now(),
          armed: observation.armed, payload: structuredClone(value),
          requestSucceeded: false, aborted: false, completed: false };
        observation.attempts.push(attempt);
        seen.set(tx, attempt);
      }
    }
    const request = nativePut.apply(this, args);
    if (attempt) request.addEventListener('success', () => {
      attempt.requestSucceeded = true;
      if (attempt.armed && !attempt.abortCalled) {
        attempt.abortCalled = true;
        tx.abort();
      }
    }, { once: true });
    return request;
  };
}

// All fields and keys in all three stores, including exact Blob bytes. This
// reads through IndexedDB directly; no app action, test DB write or model key.
async function snapshot(page) {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some(db => db.name === 'brainotes')) throw new Error('No application database');
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('brainotes');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => { req.transaction.abort(); reject(new Error('Refusing to create database')); };
    });
    const tx = db.transaction(['notebooks', 'pages', 'assets'], 'readonly');
    const result = {};
    const reads = [...tx.objectStoreNames].map(name => new Promise((resolve, reject) => {
      const store = tx.objectStore(name), values = store.getAll(), keys = store.getAllKeys();
      let v, k;
      const done = () => { if (v && k) { result[name] = k.map((key, i) => ({ key, value: v[i] })); resolve(); } };
      values.onsuccess = () => { v = values.result; done(); };
      keys.onsuccess = () => { k = keys.result; done(); };
      values.onerror = keys.onerror = () => reject(new Error('Snapshot read failed'));
    }));
    await Promise.all(reads);
    db.close();
    async function normalize(value) {
      if (value instanceof Blob) return { $blob: { type: value.type, size: value.size,
        base64: btoa(String.fromCharCode(...new Uint8Array(await value.arrayBuffer()))) } };
      if (ArrayBuffer.isView(value)) return { $typed: value.constructor.name, values: [...value] };
      if (value instanceof ArrayBuffer) return { $buffer: [...new Uint8Array(value)] };
      if (Array.isArray(value)) return Promise.all(value.map(normalize));
      if (value && typeof value === 'object') {
        const out = {}; for (const key of Object.keys(value).sort()) out[key] = await normalize(value[key]); return out;
      }
      return value;
    }
    return normalize(result);
  });
}

async function observeAttempts(page) {
  return page.evaluate(async () => {
    const out = [];
    for (const attempt of window.__acl.attempts) {
      const payload = {};
      for (const key of Object.keys(attempt.payload).sort()) {
        const value = attempt.payload[key];
        payload[key] = value instanceof Blob ? { $blob: { type: value.type, size: value.size,
          base64: btoa(String.fromCharCode(...new Uint8Array(await value.arrayBuffer()))) } } : value;
      }
      out.push({ ...attempt, payload });
    }
    return { attempts: out, ui: window.__acl.ui };
  });
}

function unpack(record) {
  const items = JSON.parse(Buffer.from(record.items.$blob.base64, 'base64').toString());
  const bytes = Buffer.from(record.pts.$blob.base64, 'base64');
  const points = Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4));
  let offset = 0;
  return items.map(item => {
    if (item.type !== 'stroke') return item;
    const { n, ...fields } = item;
    const pts = points.slice(offset, offset + n * 3); offset += n * 3;
    return { ...fields, pts };
  });
}

function expectedAfter(baseline, intendedPage) {
  return { ...baseline, pages: baseline.pages.map(row => row.key === intendedPage.id
    ? { key: row.key, value: intendedPage } : row) };
}

// A final flush can touch only Notebook.updatedAt. Every other notebook field,
// page, asset, key and order remains part of the equality assertion.
function withoutUpdatedAt(value) {
  return { ...value, notebooks: value.notebooks.map(row => {
    const { updatedAt: _updatedAt, ...fields } = row.value;
    return { key: row.key, value: fields };
  }) };
}

function assertDomain(actual, expected) {
  expect(withoutUpdatedAt(actual)).toEqual(withoutUpdatedAt(expected));
  for (const row of actual.notebooks) {
    const before = expected.notebooks.find(entry => entry.key === row.key).value.updatedAt;
    expect(Number.isFinite(row.value.updatedAt)).toBe(true);
    expect(row.value.updatedAt).toBeGreaterThanOrEqual(before);
    expect(row.value.updatedAt).toBeLessThanOrEqual(Date.now() + 1000);
  }
}

async function ready(page) {
  const pen = page.getByRole('toolbar', { name: 'Tools', exact: true }).getByRole('button', { name: 'Pen', exact: true });
  await expect(pen).toHaveCount(1);
  await expect(pen).toBeVisible();
  await pen.click();
  await expect(pen).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.save-dot')).toHaveCount(1);
  await expect(page.locator('.save-dot')).toHaveAttribute('title', savedTitle);
  await expect(page.locator('.canvas-area .layers')).toHaveCount(1);
  await expect(page.locator('.canvas-area .layers')).toBeVisible();
}

async function draw(page, offset) {
  const box = await page.locator('.canvas-area .layers').boundingBox();
  expect(box?.width).toBeGreaterThan(800);
  const x = box.x + 180 + offset, y = box.y + 140;
  await page.mouse.move(x, y + 70);
  await page.mouse.down();
  await page.mouse.move(x + 40, y, { steps: 5 });
  await page.mouse.move(x + 80, y + 70, { steps: 5 });
  await page.mouse.move(x + 20, y + 40, { steps: 5 });
  await page.mouse.move(x + 60, y + 40, { steps: 5 });
  await page.mouse.up();
  await page.mouse.move(8, 890);
}

// Read visible, local 2D canvas pixels in the UI-drawn stroke's rectangle.
// Dark neutral ink excludes the light blue paper dots. Separate A/B regions
// must change from blank and keep the exact masks after a reload.
async function inkMask(page, offset) {
  return page.locator('.canvas-area .layers').evaluate((layers, offset) => {
    const width = 104, height = 94, left = 168 + offset, top = 128;
    const mask = new Uint8Array(width * height);
    const canvases = [...layers.querySelectorAll('canvas')];
    if (canvases.length !== 2) throw new Error('Expected the two measured canvas layers');
    for (const canvas of canvases) {
      const style = getComputedStyle(canvas);
      if (style.display === 'none' || style.visibility !== 'visible') throw new Error('Canvas layer hidden');
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) throw new Error('Expected measured DPR=1 canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas readback unavailable');
      const pixels = ctx.getImageData(left, top, width, height).data;
      for (let i = 0; i < width * height; i++) {
        const j = i * 4;
        if (pixels[j + 3] > 200 && pixels[j] < 90 && pixels[j + 1] < 90 && pixels[j + 2] < 90) mask[i] = 1;
      }
    }
    return [...mask.entries()].filter(([, value]) => value === 1).map(([index]) => index);
  }, offset);
}

async function runCase(page, info, fault) {
  const evidence = { fault, sourcePin: '6682d3279ca95a802400148470a97bd0cdb54eb3',
    exceptionInjected: false, realTransactionAbort: fault, appBehaviorEdits: false, independentUseCredit: 0 };
  const errors = [];
  page.on('pageerror', error => errors.push({ name: error.name, message: error.message, stack: error.stack }));
  try {
    await page.context().route('**/*', route => new URL(route.request().url()).origin === new URL(origin).origin ? route.continue() : route.abort());
    await page.context().routeWebSocket(/.*/, ws => {
      const url = new URL(ws.url()), local = new URL(origin);
      return url.protocol === 'ws:' && url.hostname === local.hostname && url.port === local.port && url.pathname === '/'
        ? ws.connectToServer() : ws.close();
    });
    await page.addInitScript(installObserver);
    await page.goto(origin, { waitUntil: 'networkidle' });
    await ready(page);
    evidence.stage = 'baseline-autosave';
    expect(await inkMask(page, 0)).toEqual([]);
    expect(await inkMask(page, 320)).toEqual([]);
    await draw(page, 0);
    await expect.poll(async () => {
      const record = (await snapshot(page)).pages[0]?.value;
      return record ? unpack(record).length : 0;
    }).toBe(1);
    await expect(page.locator('.save-dot')).toHaveAttribute('title', savedTitle);
    await expect.poll(async () => (await inkMask(page, 0)).length).toBeGreaterThan(40);
    evidence.maskA = await inkMask(page, 0);
    evidence.savedA = await snapshot(page);
    await page.reload({ waitUntil: 'networkidle' });
    await ready(page);
    await expect.poll(() => inkMask(page, 0)).toEqual(evidence.maskA);
    expect(await inkMask(page, 320)).toEqual([]);
    evidence.baseline = await snapshot(page);
    assertDomain(evidence.baseline, evidence.savedA);
    expect(evidence.baseline.notebooks).toHaveLength(1);
    expect(evidence.baseline.pages).toHaveLength(1);
    expect(evidence.baseline.assets).toEqual([]);
    const baselinePage = evidence.baseline.pages[0].value;
    const a = unpack(baselinePage);
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe('stroke');
    await page.screenshot({ path: info.outputPath('saved-a-reloaded.png') });
    evidence.stage = 'intended-page-capture';
    await page.evaluate(({ pageId, notebookId, fault }) => {
      window.__acl.target = { pageId, notebookId };
      window.__acl.armed = fault;
      const dot = document.querySelector('.save-dot');
      const record = () => window.__acl.ui.push({ at: performance.now(), title: dot.title });
      record();
      new MutationObserver(record).observe(dot, { attributes: true, attributeFilter: ['title'] });
    }, { pageId: baselinePage.id, notebookId: baselinePage.notebookId, fault });
    await draw(page, 320);
    await expect.poll(async () => (await inkMask(page, 320)).length).toBeGreaterThan(40);
    evidence.maskB = await inkMask(page, 320);
    expect(await inkMask(page, 0)).toEqual(evidence.maskA);
    await expect.poll(() => page.evaluate(() => window.__acl.attempts.length)).toBeGreaterThan(0);
    evidence.firstAttempt = (await observeAttempts(page)).attempts[0];
    const intended = evidence.firstAttempt.payload;
    const ab = unpack(intended);
    expect(ab).toHaveLength(2);
    expect(ab[0]).toEqual(a[0]);
    expect(ab[1].type).toBe('stroke');
    expect(ab[1].id).not.toBe(a[0].id);
    expect(ab[1].pts.length).toBeGreaterThan(9);
    expect(ab[1].pts.every(Number.isFinite)).toBe(true);
    expect(Math.min(...ab[1].pts.filter((_, i) => i % 3 === 0))).toBeGreaterThan(Math.max(...a[0].pts.filter((_, i) => i % 3 === 0)));
    evidence.expected = expectedAfter(evidence.baseline, intended);
    if (fault) {
      evidence.stage = 'aborted-transaction';
      await expect.poll(() => page.evaluate(() => window.__acl.attempts[0]?.aborted)).toBe(true);
      await expect(page.locator('.save-dot')).toHaveAttribute('title', failedTitle);
      evidence.whileDenied = await snapshot(page);
      expect(evidence.whileDenied).toEqual(evidence.baseline);
      evidence.deniedObservation = await observeAttempts(page);
      expect(evidence.deniedObservation.attempts[0].requestSucceeded).toBe(true);
      expect(evidence.deniedObservation.attempts[0].completed).toBe(false);
      await page.screenshot({ path: info.outputPath('write-aborted-b-visible.png') });
      const firstAbortAt = evidence.deniedObservation.attempts[0].abortAt;
      expect(evidence.deniedObservation.ui.filter(row => row.at >= firstAbortAt && row.title === savedTitle)).toEqual([]);
      await page.evaluate(() => { window.__acl.armed = false; });
    }
    evidence.stage = 'successful-transaction-and-reload';
    await expect.poll(() => page.evaluate(() => window.__acl.attempts.some(a => !a.armed && a.completed)), { timeout: 12000 }).toBe(true);
    await expect(page.locator('.save-dot')).toHaveAttribute('title', savedTitle);
    evidence.recovered = await snapshot(page);
    assertDomain(evidence.recovered, evidence.expected);
    evidence.completedObservation = await observeAttempts(page);
    if (fault) {
      const firstAbortAt = evidence.completedObservation.attempts.find(row => row.aborted).abortAt;
      const completeAt = evidence.completedObservation.attempts.find(row => !row.armed && row.completed).completeAt;
      expect(evidence.completedObservation.ui.filter(row => row.at >= firstAbortAt && row.at < completeAt && row.title === savedTitle)).toEqual([]);
    }
    await page.reload({ waitUntil: 'networkidle' });
    await ready(page);
    evidence.afterReload = await snapshot(page);
    assertDomain(evidence.afterReload, evidence.expected);
    expect(unpack(evidence.afterReload.pages[0].value)).toEqual(ab);
    await expect.poll(() => inkMask(page, 0)).toEqual(evidence.maskA);
    await expect.poll(() => inkMask(page, 320)).toEqual(evidence.maskB);
    await page.screenshot({ path: info.outputPath('two-strokes-after-reload.png') });
    expect(errors, 'Unclassified runtime errors make this trial inconclusive').toEqual([]);
    evidence.verdict = 'PASS';
  } catch (error) {
    evidence.verdict = 'UNADJUDICATED_FAILURE';
    evidence.error = String(error);
    await page.screenshot({ path: info.outputPath('failure.png') }).catch(() => {});
    throw error;
  } finally {
    evidence.pageErrors = errors;
    await fs.writeFile(info.outputPath('evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    await info.attach('evidence', { path: info.outputPath('evidence.json'), contentType: 'application/json' });
  }
}

test('healthy autosave preserves both UI-drawn strokes after reload', async ({ page }, info) => runCase(page, info, false));
test('real IndexedDB abort preserves A, signals failure, retries B and reloads both', async ({ page }, info) => runCase(page, info, true));
