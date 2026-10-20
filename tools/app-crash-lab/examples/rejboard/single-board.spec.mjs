// Standalone Playwright regression; no App Crash Lab runtime import.
import { test, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL(process.env.REJBOARD_URL || 'http://127.0.0.1:59819');
assert.ok(base.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(base.hostname));
assert.ok(!base.username && !base.password && base.pathname === '/' && !base.search && !base.hash);
const sourceHash = process.env.REJBOARD_SOURCE_SHA256 || 'af289841ee78c711bf08122fad9e34f38abefe33c4586d8129ff6dc8c8037039';
assert.match(sourceHash, /^[0-9a-f]{64}$/);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const runStartedAt = Date.now();
const fields = ['title', 'items', 'bg', 'pat', 'gs', 'gd', 'layers', 'tags', 'pg'];
const project = row => Object.fromEntries(fields.map(key => [key, row[key]]));
// The app's txt() recomputes non-sticky text layout width/height when the seed is opened.
// This projection is ONLY for seed preparation; file -> restored state stays fully strict.
const seedContent = row => {
  const content = structuredClone(project(row));
  content.items = content.items.map(item => {
    if (item.t !== 't' || item.sticky) return item;
    const { w, h, ...rest } = item; return rest;
  });
  return content;
};
const fixture = JSON.parse(await readFile(new URL('./media-backup.json', import.meta.url), 'utf8'));
const expectedBoard = fixture.filter(row => !row.rec);
const expectedRecording = fixture.filter(row => row.rec);
assert.equal(expectedBoard.length, 1); assert.equal(expectedRecording.length, 1);
const expectedAudio = Buffer.from(expectedRecording[0].data.split(',')[1], 'base64');
assert.equal(expectedAudio.length, 3567);

async function snapshot(page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('wb');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(['n', 'rec'], 'readonly');
      const [boards, recordings] = await Promise.all(['n', 'rec'].map(name => new Promise((resolve, reject) => {
        const q = transaction.objectStore(name).getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
      })));
      const recs = await Promise.all(recordings.map(async ({ blob, ...metadata }) => {
        if (!(blob instanceof Blob)) throw Error('Missing native recording Blob');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        return { ...metadata, blobType: blob.type, bytesBase64: btoa(binary) };
      }));
      return { boards, recordings: recs };
    } finally { db.close(); }
  });
}

function assertRestored(state, payload) {
  assert.equal(state.boards.length, 1, 'Exactly one imported board');
  assert.equal(state.recordings.length, 1, 'Exactly one imported recording');
  const [board] = state.boards, [recording] = state.recordings;
  assert.deepEqual(project(board), project(payload), 'Every exported board field');
  assert.notEqual(board.id, payload.src, 'Open creates a new board ID');
  for (const key of ['t', 'ct', 'mt']) assert.ok(Number.isFinite(board[key]) && board[key] >= runStartedAt && board[key] <= Date.now(), 'New board timestamp '+key);
  assert.equal(board.parent, '', 'Fresh context imports into its root');
  assert.equal(recording.board, board.id, 'Recording belongs to newly imported board');
  assert.notEqual(recording.id, expectedRecording[0].id, 'Recording gets a new ID');
  for (const key of ['name', 't', 'dur']) assert.deepEqual(recording[key], payload.recs[0][key], 'Recording '+key);
  const expectedBytes = Buffer.from(payload.recs[0].data.split(',')[1], 'base64');
  assert.equal(recording.size, expectedBytes.length);
  assert.deepEqual(Buffer.from(recording.bytesBase64, 'base64'), expectedBytes, 'Every audio byte');
  assert.equal(recording.blobType, 'audio/webm');
  assert.equal(recording.mime, 'audio/webm');
}

test('real .rjwb Save/Open preserves board and recording; text/audio controls are detected', async ({ browser }, info) => {
  test.setTimeout(60000);
  const response = await fetch(base.origin, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const source = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length; assert.ok(length <= 2500000, 'Bounded inspected source'); source.push(chunk);
  }
  assert.equal(sha256(Buffer.concat(source)), sourceHash, 'Inspect a changed source before explicitly selecting its hash');
  const contexts = [], blockedRequests = [];
  const fresh = async () => {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin === base.origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
      blockedRequests.push({ method: request.method(), origin: new URL(request.url()).origin });
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.goto(base.origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#hbk').waitFor({ state: 'visible' });
    assert.deepEqual(await snapshot(page), { boards: [], recordings: [] }, 'Isolated context must really be empty');
    return page;
  };
  const results = { sourceSHA256: sourceHash, fixtureKind: 'disclosed synthetic PDF raster/text/ink/tags/fake-device recording', cases: [] };
  try {
    const page = await fresh();
    await page.locator('#hrs').click();
    await page.locator('#rf').setInputFiles({ name: 'synthetic-media.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.locator('#ts_').filter({ hasText: /^Restored 2 items$/ }).waitFor({ state: 'visible' });
    const initial = await snapshot(page);
    assert.deepEqual(project(initial.boards[0]), project(expectedBoard[0]));
    assert.deepEqual(Buffer.from(initial.recordings[0].bytesBase64, 'base64'), expectedAudio);
    // The pre-existing JSON Restore normalizes Blob.type. Do not claim original MIME parameters survived.
    assert.equal(initial.recordings[0].blobType, 'audio/webm');
    results.initialJSONRestore = { audioBytes: expectedAudio.length, originalBlobType: 'audio/webm;codecs=opus', restoredBlobType: 'audio/webm', originalTypePreserved: false };
    // Restore writes IndexedDB but does not refresh the newer home grid. Reload before opening it.
    await page.reload(); await page.locator('#hbk').waitFor({ state: 'visible' });
    await page.locator('.board-card').filter({ hasText: expectedBoard[0].title }).click();
    await page.locator('#exb').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#exb').click();
    const nextDownload = page.waitForEvent('download');
    await page.locator('#exm [data-x="copy"]').click();
    const download = await nextDownload; assert.equal(await download.failure(), null);
    const chunks = []; let bytes = 0;
    for await (const chunk of await download.createReadStream()) { bytes += chunk.length; assert.ok(bytes <= 1048576); chunks.push(chunk); }
    const saved = Buffer.concat(chunks);
    assert.match(download.suggestedFilename(), /\.rjwb$/);
    assert.ok(saved.subarray(0, 6).equals(Buffer.from('RJWB1:')));
    const payload = JSON.parse(Buffer.from(saved.subarray(6).toString(), 'base64').toString('utf8'));
    const savedSource = await snapshot(page);
    assert.deepEqual(seedContent(payload), seedContent(savedSource.boards[0]), 'Saved content unchanged except computed text layout');
    assert.deepEqual(seedContent(payload), seedContent(expectedBoard[0]), 'Seed content unchanged except computed text layout');
    results.seedTextLayout = payload.items.flatMap((item, index) => item.t === 't' && !item.sticky ? [{ index, fixtureWidth: expectedBoard[0].items[index].w, savedWidth: item.w, fixtureHeight: expectedBoard[0].items[index].h, savedHeight: item.h, storedWidth: savedSource.boards[0].items[index].w, storedHeight: savedSource.boards[0].items[index].h }] : []);
    assert.equal(payload.src, expectedBoard[0].id);
    assert.equal(payload.linked, undefined); assert.equal(payload.recs.length, 1);
    for (const key of ['name', 't', 'dur', 'mime']) assert.deepEqual(payload.recs[0][key], initial.recordings[0][key], 'Actual export recording '+key);
    results.fileRecordingMime = { exportedMetadata: payload.recs[0].mime, importedMetadata: 'audio/webm', parametersPreserved: payload.recs[0].mime === 'audio/webm' };
    assert.deepEqual(Buffer.from(payload.recs[0].data.split(',')[1], 'base64'), expectedAudio);
    await info.attach('actual-board-file', { body: saved, contentType: 'application/octet-stream' });
    const textChanged = structuredClone(payload);
    const textItem = textChanged.items.find(item => typeof item.text === 'string' && item.text.length);
    assert.ok(textItem, 'Synthetic fixture contains actual text'); textItem.text += ' altered';
    const audioChanged = structuredClone(payload);
    const audio = Buffer.from(audioChanged.recs[0].data.split(',')[1], 'base64'); audio[audio.length - 1] ^= 1;
    audioChanged.recs[0].data = audioChanged.recs[0].data.split(',')[0] + ',' + audio.toString('base64');
    for (const [name, data, control] of [['original', payload, false], ['same-count-changed-text', textChanged, true], ['same-length-changed-audio', audioChanged, true]]) {
      const target = await fresh();
      // The real Open file input, not direct storage injection or a replacement importer.
      await target.locator('#of').setInputFiles({ name: name+'.rjwb', mimeType: 'application/octet-stream', buffer: control ? Buffer.from('RJWB1:'+Buffer.from(JSON.stringify(data)).toString('base64')) : saved });
      await target.locator('#ts_').filter({ hasText: /^Board opened and 1 voice recording$/ }).waitFor({ state: 'visible' });
      await expect.poll(async () => (await snapshot(target)).boards.length).toBe(1);
      const imported = await snapshot(target); assertRestored(imported, data);
      if (control) assert.throws(() => assertRestored(imported, payload), assert.AssertionError);
      else assertRestored(imported, payload);
      await target.reload(); await target.locator('#hbk').waitFor({ state: 'visible' });
      const reloaded = await snapshot(target); assertRestored(reloaded, data);
      if (control) assert.throws(() => assertRestored(reloaded, payload), assert.AssertionError);
      if (!control) await target.screenshot({ path: info.outputPath('original-restored.png') });
      results.cases.push({ name, importAndReload: 'PASS', originalOracle: control ? 'INTENTIONAL_MISMATCH_DETECTED' : 'PASS', audioBytes: Buffer.from(reloaded.recordings[0].bytesBase64, 'base64').length });
      await info.attach(name+'-state', { body: Buffer.from(JSON.stringify(reloaded, null, 2)), contentType: 'application/json' });
    }
    results.actualExportBytes = saved.length; results.actualExportSHA256 = sha256(saved);
    results.audioSHA256 = sha256(expectedAudio); results.blockedRequests = blockedRequests;
    console.log(JSON.stringify(results));
  } finally {
    await info.attach('measured-summary', { body: Buffer.from(JSON.stringify(results, null, 2)), contentType: 'application/json' });
    await Promise.allSettled(contexts.map(context => context.close()));
  }
});
