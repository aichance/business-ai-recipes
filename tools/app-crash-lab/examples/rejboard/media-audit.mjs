// Complementary Playwright audit. App Crash Lab's JSON reader does not read Blob bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from '@playwright/test';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = rows => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), 'en'));
function expectedFromBackup(rows) {
  const boards = sorted(rows.filter(row => !row.rec));
  const recordings = sorted(rows.filter(row => row.rec).map(row => {
    const { data, rec, ...metadata } = row;
    const match = /^data:([^,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(data);
    assert.ok(match, 'Synthetic recording needs a base64 data URL');
    const bytes = Buffer.from(match[2], 'base64');
    return { ...metadata, blobType: match[1], blobSize: bytes.length, bytesBase64: bytes.toString('base64') };
  }));
  return { boards, recordings };
}
async function snapshot(page) {
  const state = await page.evaluate(async () => {
    const request = indexedDB.open('wb');
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      // The app is idle at these checkpoints. All selected stores share one read transaction.
      const transaction = db.transaction(['n', 'rec'], 'readonly');
      const rows = await Promise.all(['n', 'rec'].map(name => new Promise((resolve, reject) => {
        const q = transaction.objectStore(name).getAll();
        q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
      })));
      const recordings = [];
      for (const record of rows[1]) {
        if (!(record.blob instanceof Blob)) throw Error('Recording has no native Blob');
        const { blob, ...metadata } = record;
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
        });
        recordings.push({ ...metadata, blobType: blob.type, blobSize: blob.size, bytesBase64: data.slice(data.indexOf(',') + 1) });
      }
      return { boards: rows[0], recordings };
    } finally { db.close(); }
  });
  return { boards: sorted(state.boards), recordings: sorted(state.recordings) };
}
function compare(expected, actual) {
  const projected = state => state.recordings.map(({ blobType, ...rest }) => rest);
  return {
    completeBoardsPreserved: isDeepStrictEqual(expected.boards, actual.boards),
    recordingMetadataAndBytesPreserved: isDeepStrictEqual(projected(expected), projected(actual)),
    recordingBlobTypesPreserved: isDeepStrictEqual(expected.recordings.map(x => x.blobType), actual.recordings.map(x => x.blobType)),
    expectedBlobTypes: expected.recordings.map(x => x.blobType),
    actualBlobTypes: actual.recordings.map(x => x.blobType),
    expectedAudioSHA256: expected.recordings.map(x => sha256(Buffer.from(x.bytesBase64, 'base64'))),
    actualAudioSHA256: actual.recordings.map(x => sha256(Buffer.from(x.bytesBase64, 'base64'))),
  };
}
export async function auditMedia(baseURL, fixture, saveJSON) {
  const expected = expectedFromBackup(fixture);
  assert.equal(expected.boards.length, 1); assert.equal(expected.recordings.length, 1);
  const browser = await chromium.launch({ headless: true });
  const deadline = setTimeout(() => { void browser.close().catch(() => {}); }, 60000);
  deadline.unref();
  const contexts = [];
  const fresh = async () => {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
    contexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort('blockedbyclient'));
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.locator('#hbk').waitFor({ state: 'visible' });
    assert.deepEqual(await snapshot(page), { boards: [], recordings: [] }, 'Fresh context must really be empty');
    return page;
  };
  const restore = async (page, data) => {
    await page.locator('#hrs').click();
    await page.locator('#rf').setInputFiles({ name: 'synthetic-media.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await page.locator('#ts_').filter({ hasText: /^Restored 2 items$/ }).waitFor({ state: 'visible' });
  };
  try {
    const source = await fresh(); await restore(source, fixture);
    const imported = await snapshot(source);
    const firstImport = compare(expected, imported);
    await saveJSON('media-first-import.json', { comparison: firstImport, expected, actual: imported });
    // Keep the MIME difference visible. Matching bytes does not mean matching Blob.type.
    assert.equal(firstImport.completeBoardsPreserved, true);
    assert.equal(firstImport.recordingMetadataAndBytesPreserved, true);
    assert.deepEqual(firstImport.expectedBlobTypes, ['audio/webm;codecs=opus']);
    assert.deepEqual(firstImport.actualBlobTypes, ['audio/webm']);
    assert.equal(firstImport.recordingBlobTypesPreserved, false);

    const nextDownload = source.waitForEvent('download');
    await source.locator('#hbk').click(); const download = await nextDownload;
    assert.equal(await download.failure(), null);
    const chunks = []; let length = 0;
    for await (const chunk of await download.createReadStream()) {
      length += chunk.length; assert.ok(length <= 1048576, 'Bounded synthetic backup'); chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks), actualExport = JSON.parse(bytes);
    const exportComparison = compare(imported, expectedFromBackup(actualExport));
    assert.equal(exportComparison.completeBoardsPreserved, true);
    assert.equal(exportComparison.recordingMetadataAndBytesPreserved, true);
    assert.equal(exportComparison.recordingBlobTypesPreserved, true);

    const target = await fresh(); await restore(target, actualExport);
    const restored = await snapshot(target);
    assert.deepEqual(restored, imported, 'Real app export -> empty-context restore, all fields and bytes');
    await target.reload(); await target.locator('#hbk').waitFor({ state: 'visible' });
    const reloaded = await snapshot(target);
    assert.deepEqual(reloaded, imported, 'Complete restored state after reload');
    await saveJSON('media-real-roundtrip.json', { exportSHA256: sha256(bytes), exportBytes: bytes.length, exportComparison, restored: compare(imported, restored), reloaded: compare(imported, reloaded) });

    // Intentional oracle control: alter one real exported audio byte, retain length and every metadata field.
    const changed = structuredClone(actualExport);
    const recording = changed.find(row => row.rec); const comma = recording.data.indexOf(',');
    const audio = Buffer.from(recording.data.slice(comma + 1), 'base64'); audio[audio.length - 1] ^= 1;
    recording.data = recording.data.slice(0, comma + 1) + audio.toString('base64');
    const control = await fresh(); await restore(control, changed);
    const changedState = await snapshot(control); const controlComparison = compare(imported, changedState);
    assert.equal(controlComparison.completeBoardsPreserved, true);
    assert.equal(controlComparison.recordingMetadataAndBytesPreserved, false);
    assert.equal(controlComparison.recordingBlobTypesPreserved, true);
    assert.equal(changedState.recordings[0].blobSize, imported.recordings[0].blobSize);
    const { bytesBase64: beforeBytes, ...beforeMetadata } = imported.recordings[0];
    const { bytesBase64: afterBytes, ...afterMetadata } = changedState.recordings[0];
    assert.deepEqual(afterMetadata, beforeMetadata); assert.notEqual(afterBytes, beforeBytes);
    await saveJSON('media-one-byte-control.json', { intentionalControl: true, comparison: controlComparison, byteLength: audio.length, sameMetadata: true });
    return { firstImport, realExportRestoreReload: 'PASS', oneByteControlDetected: true, fullOriginalBlobTypePreservation: false, scope: 'Complementary Playwright audit; current App Crash Lab JSON observer does not support Blob' };
  } finally { clearTimeout(deadline); await Promise.allSettled(contexts.map(c => c.close())); await browser.close(); }
}
