// Standalone lock-only acceptance for reviewed RejBoard a73ee29.
// Original backup cases remain in electron-sync.spec.mjs, pinned to4156c283.
// No App Crash Lab runtime dependency.
import { test, _electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, readdir, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const source = resolve(process.env.REJBOARD_SOURCE_DIR || '.');
const hashes = {
  'index.html': 'b550922a7b97eaa5d77737b46f8ce35d9d0049781a1244953b8e4071683a6d8c',
  'main.js': 'aded7669efb9c1928845aaaae5d06b3c40acfe3dd9797a0b5b9bab8da59f5fd2',
  'preload.js': '9ace9017addc1d17eed9a102148505326333dbbcd5ffbddcc00cf4291112dc0c',
  'lan.js': '4db71dac4e84af835ada7eb8e505d9c73606b3a15ded1f268f932ab579a38ae3',
  'ocr.js': '37fce3ebf6f1a2337515498492f0075dbed69c8ed468141a7d1e2e2aa6a0ee91',
  'update-policy.js': 'd3e4bdc1abdd457bd9237eca69fdab3247c3f3345e6de95ae1b1087724e11521',
  'package.json': '7ba7a721cc6457069017fc8587167e3295fe4ddde4bb8059641a8fa72845bc43',
};
const sha = data => createHash('sha256').update(data).digest('hex');
for (const [name, hash] of Object.entries(hashes)) assert.equal(sha(await readFile(join(source, name))), hash, 'Review changed upstream source before adapting this pinned test: ' + name);
const requireSource = createRequire(join(source, 'package.json'));
assert.equal(requireSource('electron/package.json').version, '44.5.1');
assert.equal(requireSource('electron-updater/package.json').version, '6.6.2');
assert.equal(requireSource('lodash.isequal/package.json').version, '4.5.0');
const executablePath = requireSource('electron');
const launcher = fileURLToPath(new URL('./electron-sync-bootstrap.cjs', import.meta.url));
const fixture = JSON.parse(await readFile(new URL('./media-backup.json', import.meta.url), 'utf8'));
const board = fixture.find(row => !row.rec);
const lockName = '.rejboard-lock.json';
async function selectIndexWindow(app) {
  return new Promise((resolvePage, rejectPage) => {
    const seen = new Set(); let settled = false;
    const cleanup = () => { clearTimeout(timer); app.off('window', watch); app.off('close', closed); };
    const finish = (error, page) => { if (settled) return; settled = true; cleanup(); if (error) rejectPage(error); else resolvePage(page); };
    const watch = page => {
      if (seen.has(page)) return; seen.add(page);
      page.waitForURL(url => url.protocol === 'file:' && fileURLToPath(url) === join(source, 'index.html'), { timeout: 30000 })
        .then(() => finish(null, page), () => {});
    };
    const closed = () => finish(new Error('RejBoard closed before index.html was available'));
    const timer = setTimeout(() => finish(new Error('No RejBoard index.html BrowserWindow within30s')), 30000);
    app.on('window', watch); app.once('close', closed);
    for (const page of app.windows()) watch(page);
  });
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const q = indexedDB.open('wb');
    const db = await new Promise((resolve, reject) => { q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
    try {
      const tx = db.transaction(['n', 'rec'], 'readonly');
      const [boards, recordings] = await Promise.all(['n', 'rec'].map(name => new Promise((resolve, reject) => {
        const r = tx.objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      })));
      return { boards, recordings: await Promise.all(recordings.map(async ({ blob, ...metadata }) => {
        if (!(blob instanceof Blob)) throw Error('Missing native recording Blob');
        const bytes = new Uint8Array(await blob.arrayBuffer()); let text = '';
        for (const byte of bytes) text += String.fromCharCode(byte);
        return { ...metadata, blobType: blob.type, bytesBase64: btoa(text) };
      })) };
    } finally { db.close(); }
  });
}

async function scenario(info, run) {
  test.setTimeout(120000);
  await mkdir(info.outputPath('sandbox'), { recursive: true });
  const root = await mkdtemp(info.outputPath('sandbox/rejboard-sync-'));
  await writeFile(join(root, 'TEST-ONLY'), 'App Crash Lab synthetic test\n');
  const folder = join(root, 'shared'); await mkdir(folder);
  const apps = [], evidence = { upstream: 'a73ee29468ff61f44fc3a4868503cc8438b34819', hashes, electron: '44.5.1', scope: 'one host, real Electron IPC, real directory, separate profiles; no cloud transport', cases: [] };
  const fresh = async label => {
    const profile = join(root, label); await mkdir(profile);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE'].includes(key)));
    Object.assign(env, { REJBOARD_SOURCE_DIR: source, REJBOARD_TEST_ROOT: root, REJBOARD_TEST_PROFILE: profile, REJBOARD_TEST_FOLDER: folder });
    const app = await _electron.launch({ executablePath, args: [launcher], cwd: source, env, timeout: 30000 });
    apps.push(app); const page = await selectIndexWindow(app); page.setDefaultTimeout(15000);
    await page.waitForURL(url => url.protocol === 'file:' && url.pathname.endsWith('/index.html'));
    await page.locator('#hbk').waitFor({ state: 'visible' });
    assert.deepEqual(await snapshot(page), { boards: [], recordings: [] }, 'Fresh profile must really be empty');
    const paths = await app.evaluate(({ app }) => Object.fromEntries(Object.keys(globalThis.__rejboardAcceptance.paths).map(name => [name, app.getPath(name)])));
    const canonicalProfile = await realpath(profile);
    for (const path of Object.values(paths)) {
      const subpath = relative(canonicalProfile, await realpath(path));
      assert.ok(subpath && subpath !== '..' && !subpath.startsWith('..' + sep) && !isAbsolute(subpath), 'Actual Electron path must be inside this profile');
    }
    return { app, page };
  };
  try { await run({ root, folder, fresh, evidence }); }
  finally {
    evidence.launches = await Promise.all(apps.map(async app => {
      try { const state = await app.evaluate(() => globalThis.__rejboardAcceptance); return { pid: app.process().pid, isolatedPaths: Object.keys(state.paths), blockedNetwork: state.blockedNetwork, blockedIPC: state.blockedIPC }; }
      catch { return { pid: app.process().pid, closed: true }; }
    }));
    const closeResults = await Promise.allSettled(apps.reverse().map(app => app.close()));
    evidence.closeErrors = closeResults.filter(result => result.status === 'rejected').map(result => String(result.reason));
    for (const [name, hash] of Object.entries(hashes)) assert.equal(sha(await readFile(join(source, name))), hash, 'Upstream remained unmodified');
    await info.attach('measured-results', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
    assert.equal(evidence.closeErrors.length, 0, 'Every test app must close; see measured-results for cleanup errors');
  }
}

async function seed(page, rows = fixture) {
  // Listen before click so Electron's native file picker is intercepted by Playwright.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#hrs').click()]);
  await chooser.setFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
  await page.locator('#ts_').filter({ hasText: new RegExp('^Restored ' + rows.length + ' items$') }).waitFor({ state: 'visible' });
  await page.reload(); await page.locator('#hbk').waitFor({ state: 'visible' });
}
async function choose(page) {
  await page.locator('#hsf').click();
  await page.getByRole('button', { name: 'Choose folder…', exact: true }).click();
}
async function savedFiles(folder) {
  return Promise.all((await readdir(folder)).filter(name => name.endsWith('.rjwb')).sort().map(async name => ({ name, text: await readFile(join(folder, name), 'utf8') })));
}

test('fresh lock blocks writing; takeover lock survives the previous owner leaving', async ({}, info) => scenario(info, async ({ folder, fresh, evidence }) => {
  const a = await fresh('A'), b = await fresh('B');
  await seed(a.page); await seed(b.page); await choose(a.page); await a.page.getByRole('button', { name: 'Close', exact: true }).click();
  await choose(b.page); await b.page.getByRole('button', { name: 'Close', exact: true }).click();
  const aID = await a.page.evaluate(() => sfMid()), bID = await b.page.evaluate(() => sfMid()); assert.notEqual(aID, bID);
  await writeFile(join(folder, lockName), JSON.stringify({ id: 'synthetic-stale-owner', host: 'Synthetic old profile', t: Date.now() - 6 * 60 * 1000, app: 'RejBoard' }));
  assert.equal(await b.page.evaluate(() => sfAcquire()), true);
  assert.equal(JSON.parse(await readFile(join(folder, lockName), 'utf8')).id, bID);
  await b.page.evaluate(() => sfRelease());
  assert.equal(await a.page.evaluate(() => sfAcquire()), true);
  const acquiredAt = Date.now();
  const initialLock = await readFile(join(folder, lockName), 'utf8'); assert.equal(JSON.parse(initialLock).id, aID);
  const denied = b.page.evaluate(id => sfBackup([id]), board.id);
  await b.page.getByRole('button', { name: 'Cancel', exact: true }).click(); await denied;
  assert.equal(await readFile(join(folder, lockName), 'utf8'), initialLock); assert.equal((await savedFiles(folder)).length, 0);
  const takeover = b.page.evaluate(() => sfAcquire());
  await b.page.getByRole('button', { name: 'Take over anyway', exact: true }).click(); assert.equal(await takeover, true);
  assert.equal(JSON.parse(await readFile(join(folder, lockName), 'utf8')).id, bID);
  evidence.cases.push({ differentProfileIDs: 'PASS', staleLockAcquire: 'PASS', freshLockCancelNoWrite: 'PASS', explicitTakeover: 'PASS' });
  // Real page lifecycle in A, before its next60s heartbeat. A must not remove B's lock.
  const precondition = await a.page.evaluate(() => ({ held: SF.held, id: sfMid() }));
  assert.equal(precondition.held, true); assert.equal(precondition.id, aID);
  assert.ok(Date.now() - acquiredAt < 55000, 'Test must exercise pagehide before the first ownership heartbeat');
  assert.equal(JSON.parse(await readFile(join(folder, lockName), 'utf8')).id, bID);
  evidence.lockPrecondition = { aStillHeld: true, bOwnsDiskLock: true, elapsedMs: Date.now() - acquiredAt };
  await a.page.reload(); await a.page.locator('#hbk').waitFor({ state: 'visible' });
  const after = await readFile(join(folder, lockName), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  evidence.cases.push({ previousOwnerReload: true, takeoverLockPresent: after !== null, lockOwnerIsB: after ? JSON.parse(after).id === bID : false });
  assert.ok(after, 'Previous owner pagehide must not remove the new owner lock');
  assert.equal(JSON.parse(after).id, bID);
  for (let i = 0; i < 10; i++) {
    await delay(100);
    assert.equal(JSON.parse(await readFile(join(folder, lockName), 'utf8')).id, bID, 'New lock remains stable for1s after reload');
  }
}));
