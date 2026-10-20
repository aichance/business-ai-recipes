// Standalone Playwright/Electron acceptance. No App Crash Lab runtime dependency.
import { test, expect, _electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, mkdtemp, readdir, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const source = resolve(process.env.REJBOARD_SOURCE_DIR || '.');
const hashes = {
  'index.html': '129faf4dd0c279249239eaa191c2fab41f75a6209de2f4c0661614b56ae80796',
  'main.js': '7230fc84c0c4385b32751bb61aa008c23075ce9b91a4c6e4c923e9140d2982a5',
  'preload.js': '505ed76bff88ec74e116b84326d0c1770ca65c15f66c2bb3f21940442be1723a',
  'lan.js': '4db71dac4e84af835ada7eb8e505d9c73606b3a15ded1f268f932ab579a38ae3',
  'ocr.js': '37fce3ebf6f1a2337515498492f0075dbed69c8ed468141a7d1e2e2aa6a0ee91',
  'update-policy.js': 'd3e4bdc1abdd457bd9237eca69fdab3247c3f3345e6de95ae1b1087724e11521',
  'package.json': 'a6e5a306ea0b2a20a5c2c10537eda97e9839ee24f08e741759f98203c3d3b1e7',
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
const board = fixture.find(row => !row.rec), recording = fixture.find(row => row.rec);
const lockName = '.rejboard-lock.json';
const decode = bytes => {
  const text = String(bytes); assert.ok(text.startsWith('RJWB1:'));
  return JSON.parse(Buffer.from(text.slice(6), 'base64').toString('utf8'));
};
const same = (actual, expected, label) => assert.ok(isDeepStrictEqual(actual, expected), label);
const boardFromFile = payload => {
  const row = structuredClone(payload);
  for (const key of ['recs', 'src', 'linked', 'app']) delete row[key];
  return row;
};

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

function assertImported(state, files) {
  assert.equal(state.boards.length, files.length);
  const audio = [];
  for (const payload of files) {
    const expected = structuredClone(payload);
    for (const key of ['recs', 'src', 'linked', 'app']) delete expected[key];
    expected.parent = ''; expected.del = 0;
    same(state.boards.find(row => row.id === payload.id), expected, 'Complete saved board, including all item/image bytes');
    for (const rec of payload.recs || []) audio.push({ board: payload.id, ...rec });
  }
  assert.equal(state.recordings.length, audio.length);
  for (const expected of audio) {
    const actual = state.recordings.find(row => row.board === expected.board && row.name === expected.name);
    assert.ok(actual); assert.ok(actual.id);
    for (const key of ['name', 't', 'dur', 'board']) assert.deepEqual(actual[key], expected[key]);
    const bytes = Buffer.from(expected.data.split(',')[1], 'base64');
    assert.equal(actual.size, bytes.length); assert.deepEqual(Buffer.from(actual.bytesBase64, 'base64'), bytes, 'Every recording byte');
    // Existing, separately disclosed normalization; never report original MIME retention.
    assert.equal(actual.mime, 'audio/webm'); assert.equal(actual.blobType, 'audio/webm');
  }
}

async function scenario(info, run) {
  test.setTimeout(120000);
  await mkdir(info.outputPath('sandbox'), { recursive: true });
  const root = await mkdtemp(info.outputPath('sandbox/rejboard-sync-'));
  await writeFile(join(root, 'TEST-ONLY'), 'App Crash Lab synthetic test\n');
  const folder = join(root, 'shared'); await mkdir(folder);
  const apps = [], evidence = { upstream: '4156c283719b40ce4eecf469b308cb95535d7868', hashes, electron: '44.5.1', scope: 'one host, real Electron IPC, real directory, separate profiles; no cloud transport', cases: [] };
  const fresh = async label => {
    const profile = join(root, label); await mkdir(profile);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['NODE_OPTIONS', 'NODE_PATH', 'ELECTRON_RUN_AS_NODE'].includes(key)));
    Object.assign(env, { REJBOARD_SOURCE_DIR: source, REJBOARD_TEST_ROOT: root, REJBOARD_TEST_PROFILE: profile, REJBOARD_TEST_FOLDER: folder });
    const app = await _electron.launch({ executablePath, args: [launcher], cwd: source, env, timeout: 30000 });
    apps.push(app); const page = await app.firstWindow(); page.setDefaultTimeout(15000);
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
      try { const state = await app.evaluate(() => globalThis.__rejboardAcceptance); return { isolatedPaths: Object.keys(state.paths), blockedNetwork: state.blockedNetwork, blockedIPC: state.blockedIPC }; }
      catch { return { closed: true }; }
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
async function importSelected(page) {
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Import selected', exact: true }).click();
}
async function imported(page, summary) {
  await expect(page.locator('#ts_')).toHaveText('☁ Import: ' + summary);
}
async function savedFiles(folder) {
  return Promise.all((await readdir(folder)).filter(name => name.endsWith('.rjwb')).sort().map(async name => ({ name, text: await readFile(join(folder, name), 'utf8') })));
}

test('real folder roundtrip preserves full linked boards/audio; rename removes the old file', async ({}, info) => scenario(info, async ({ folder, fresh, evidence }) => {
  const a = await fresh('A');
  const rows = structuredClone(fixture), first = rows.find(row => !row.rec);
  first.title = '../同期: board?*';
  first.items.find(item => item.t === 't').html = '<span data-board="sync-linked">Linked board</span>';
  const linked = structuredClone(first); linked.id = 'sync-linked'; linked.title = 'Linked board';
  linked.items.find(item => item.t === 't').html = '<span data-board="' + first.id + '">Back to first</span>';
  rows.push(linked); await seed(a.page, rows);
  await choose(a.page);
  await a.page.getByRole('button', { name: 'Close', exact: true }).click();
  // Invoke the real selected-board export: linked-board discovery and native fs are unchanged.
  await a.page.evaluate(id => sfBackup([id]), first.id);
  const files = await savedFiles(folder); assert.equal(files.length, 2);
  assert.ok(files.every(file => !/[\\/:*?"<>|]/.test(file.name)));
  const payloads = files.map(file => decode(file.text));
  const before = await snapshot(a.page);
  for (const row of before.boards) same(boardFromFile(payloads.find(payload => payload.id === row.id)), row, 'Every source board field must appear unchanged in the actual file');
  const exportedRecording = payloads.find(payload => payload.id === first.id).recs[0];
  for (const key of ['name', 't', 'dur', 'mime']) assert.deepEqual(exportedRecording[key], before.recordings[0][key]);
  assert.deepEqual(Buffer.from(payloads.find(payload => payload.id === first.id).recs[0].data.split(',')[1], 'base64'), Buffer.from(recording.data.split(',')[1], 'base64'));
  const b = await fresh('B'); await choose(b.page); await importSelected(b.page);
  await imported(b.page, '2 added');
  await expect.poll(async () => (await snapshot(b.page)).boards.length).toBe(2);
  assertImported(await snapshot(b.page), payloads);
  await b.page.reload(); await b.page.locator('#hbk').waitFor({ state: 'visible' });
  const restored = await snapshot(b.page); assertImported(restored, payloads);
  const changed = structuredClone(payloads); changed[0].items[0].x += 1;
  assert.throws(() => assertImported(restored, changed), assert.AssertionError, 'Same count and valid file, changed saved value must fail the oracle');
  await b.page.locator('#hsf').click(); await importSelected(b.page);
  await b.page.getByRole('checkbox', { name: 'Do this for all remaining conflicts', exact: true }).check();
  await b.page.getByRole('button', { name: 'Keep both (import as a copy)', exact: true }).click();
  await imported(b.page, '2 kept as copy');
  const copied = await snapshot(b.page); assert.equal(copied.boards.length, 4); assert.equal(copied.recordings.length, 2);
  // sfImport calls saveNow even for an unchanged open board: legacy access stamp t advances.
  // Assert that change separately; ct/mt/content and every other saved field remain strict.
  const accessedPayloads = structuredClone(payloads);
  for (const payload of accessedPayloads) {
    const current = copied.boards.find(row => row.id === payload.id);
    assert.ok(current.t >= payload.t && current.t <= Date.now()); payload.t = current.t;
  }
  assertImported({ boards: copied.boards.filter(row => payloads.some(p => p.id === row.id)), recordings: copied.recordings.filter(row => row.board === first.id) }, accessedPayloads);
  const firstCopy = copied.boards.find(row => row.title === first.title + ' (copy)');
  const linkedCopy = copied.boards.find(row => row.title === linked.title + ' (copy)');
  assert.ok(firstCopy && linkedCopy);
  assert.ok(firstCopy.items.some(item => item.html?.includes('data-board="' + linkedCopy.id + '"')));
  assert.ok(linkedCopy.items.some(item => item.html?.includes('data-board="' + firstCopy.id + '"')));
  assert.ok(copied.recordings.some(row => row.board === firstCopy.id && row.bytesBase64 === restored.recordings[0].bytesBase64));
  const mapping = { [first.id]: firstCopy.id, [linked.id]: linkedCopy.id };
  const copies = payloads.map(payload => {
    const expected = structuredClone(payload), actual = copied.boards.find(row => row.id === mapping[payload.id]);
    assert.ok(actual.t >= payload.t && actual.t <= Date.now()); assert.equal(actual.ct, actual.t); assert.equal(actual.mt, actual.t);
    expected.id = actual.id; expected.title += ' (copy)'; expected.t = expected.ct = expected.mt = actual.t; expected.fav = false;
    expected.items = expected.items.map(item => typeof item.html === 'string' ? { ...item, html: item.html.replace(/data-board="([^"]+)"/g, (match, id) => mapping[id] ? 'data-board="' + mapping[id] + '"' : match) } : item);
    return expected;
  });
  assertImported(copied, [...accessedPayloads, ...copies]);
  // Rename through the real editor so saveNow() sees the same title as the database.
  await a.page.locator('.board-card').filter({ hasText: first.title }).click();
  await a.page.locator('#ti').fill('Renamed ✓');
  await expect.poll(async () => (await snapshot(a.page)).boards.find(row => row.id === first.id)?.title).toBe('Renamed ✓');
  await a.page.evaluate(id => sfBackup([id]), first.id);
  const renamed = await savedFiles(folder); assert.equal(renamed.length, 2);
  assert.equal(renamed.filter(file => decode(file.text).id === first.id).length, 1);
  assert.ok(renamed.some(file => file.name === 'Renamed ✓ [' + first.id + '].rjwb'));
  assert.ok(!renamed.some(file => file.name === files.find(file => decode(file.text).id === first.id).name));
  await b.page.screenshot({ path: info.outputPath('restored-linked-boards.png') });
  evidence.cases.push({ roundtrip: 'PASS', boards: payloads.length, recordings: before.recordings.length, audioBytes: Buffer.from(before.recordings[0].bytesBase64, 'base64').length, MIMEParametersPreserved: false, keepBothLinkRemap: 'PASS', rename: 'PASS', sameCountChangedValue: 'DETECTED', fileSHA256: files.map(file => ({ name: file.name, sha256: sha(file.text) })) });
}));

test('older real file warns; Skip, Keep both and Replace retain the correct records', async ({}, info) => scenario(info, async ({ folder, fresh, evidence }) => {
  const a = await fresh('A'); await seed(a.page); await choose(a.page);
  await a.page.getByRole('button', { name: 'Back up all boards', exact: true }).click();
  await expect.poll(async () => (await savedFiles(folder)).length).toBe(1);
  const files = await savedFiles(folder), payload = decode(files[0].text);
  const b = await fresh('B'); await choose(b.page); await importSelected(b.page);
  await imported(b.page, '1 added');
  await expect.poll(async () => (await snapshot(b.page)).boards.length).toBe(1);
  assertImported(await snapshot(b.page), [payload]);
  await b.page.evaluate(async id => { const r = await tx('readonly', s => s.get(id)); r.title = 'Newer local edit'; r.mt = Date.now(); await tx('readwrite', s => s.put(r)); }, payload.id);
  const newer = await snapshot(b.page);
  const conflict = async button => {
    await b.page.locator('#hsf').click(); await importSelected(b.page);
    await expect(b.page.locator('.mdl')).toContainText('The file is OLDER');
    await b.page.getByRole('button', { name: button, exact: true }).click();
    await imported(b.page, { Skip: '1 skipped', 'Keep both (import as a copy)': '1 kept as copy', 'Replace the board in the app': '1 replaced' }[button]);
  };
  await conflict('Skip'); assert.deepEqual(await snapshot(b.page), newer);
  await conflict('Keep both (import as a copy)');
  const both = await snapshot(b.page); assert.equal(both.boards.length, 2); assert.equal(both.recordings.length, 2);
  assert.deepEqual(both.boards.find(row => row.id === payload.id), newer.boards[0]);
  const copy = both.boards.find(row => row.id !== payload.id);
  assert.equal(copy.title, payload.title + ' (copy)'); assert.deepEqual(copy.items, payload.items);
  assert.ok(both.recordings.some(row => row.board === copy.id && row.bytesBase64 === newer.recordings[0].bytesBase64));
  await conflict('Replace the board in the app');
  const replaced = await snapshot(b.page);
  assertImported({ boards: replaced.boards.filter(row => row.id === payload.id), recordings: replaced.recordings.filter(row => row.board === payload.id) }, [payload]);
  assert.equal(replaced.boards.length, 2); assert.equal(replaced.recordings.length, 2);
  await b.page.reload(); await b.page.locator('#hbk').waitFor({ state: 'visible' });
  assert.deepEqual(await snapshot(b.page), replaced);
  evidence.cases.push({ olderFileWarning: 'PASS', skipUnchanged: 'PASS', keepBothRecordingAssociation: 'PASS', replaceAndReload: 'PASS' });
}));

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
