import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runContract } from '../lib/runner.mjs';
import { validateContract } from '../lib/contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
// Generated in the app, absent from the contract. It must not reach reports,
// failure output, attachment JSON, screenshots or a standalone reproduction.
const sentinel = 'CAPTURED_PRIVATE_SENTINEL_7d209f';
const records = [{ title: 'Synthetic café — 合成', nested: { color: 'blue', hidden: sentinel }, flags: [true, false] }];
const exported = Buffer.from('{\n  "saved" : ' + JSON.stringify(records) + ',\n  "format": 1\n}\n');
const baseContract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Actual backup roundtrip',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 700, stabilityMs: 100,
  checks: ['backup-roundtrip'],
  setup: [{ action: 'click', target: { css: '#save' }, save: true }],
  observe: { records: { source: 'localStorage', key: 'saved', parse: 'json' }, count: { source: 'count', target: { css: '.item' } } },
  expected: { count: 1 },
  backupRoundtrip: {
    isolation: 'browser-local',
    export: { steps: [{ action: 'click', target: { css: '#export' } }], maxBytes: 65536, statePaths: { records: ['saved'] } },
    restore: {
      path: '/', ready: [{ action: 'expectVisible', target: { css: '#file' } }],
      empty: { records: null, count: 0 }, target: { css: '#file' }, mimeType: 'application/json',
      success: { observe: { status: { source: 'text', target: { css: '#status' } } }, expected: { status: 'Restored' } },
    },
  },
};

test('backup contracts retain old defaults and require actual storage, fresh target and explicit export limits', () => {
  assert.deepEqual(validateContract(baseContract).checks, ['backup-roundtrip']);
  const invalid = change => { const c = structuredClone(baseContract); change(c); assert.throws(() => validateContract(c), /Invalid contract/); };
  invalid(c => delete c.backupRoundtrip);
  invalid(c => c.backupRoundtrip.isolation = 'shared-server');
  invalid(c => c.backupRoundtrip.export.maxBytes = 1048577);
  invalid(c => delete c.backupRoundtrip.restore.empty.records);
  invalid(c => delete c.backupRoundtrip.export.statePaths.records);
  invalid(c => c.checks = ['reload']);
  invalid(c => c.backupRoundtrip.restore.fileName = '../private.json');
  invalid(c => c.backupRoundtrip.restore.mimeType = 'invalid');
  invalid(c => c.backupRoundtrip.restore.fileChooser = { css: '#choose' });
  invalid(c => delete c.backupRoundtrip.restore.target);
  invalid(c => c.backupRoundtrip.restore.after = [{ action: 'click', target: { css: '#repair' } }]);
  for (const hook of ['ready', 'after']) invalid(c => c.backupRoundtrip.restore[hook] = [{ action: 'goto', path: '/repair' }]);
  invalid(c => c.afterReload = [{ action: 'goto', path: '/repair' }]);
  invalid(c => c.afterReload = [{ action: 'setFile', target: { css: '#file' }, file: { name: 'repair.json', mimeType: 'application/json', text: '{}' } }]);
  invalid(c => { delete c.observe.records; delete c.backupRoundtrip.restore.empty.records; });
  invalid(c => c.backupRoundtrip.restore.ready = []);
  invalid(c => c.backupRoundtrip.restore.success.expected = {});
  invalid(c => c.backupRoundtrip.export.steps = [{ action: 'request', method: 'DELETE', path: '/data', expectStatus: 200 }]);
});

async function fixture() {
  const uploads = [];
  const html = `<!doctype html><meta charset="utf-8"><button id="save">Save</button><button id="export">Export</button><button id="choose">Import</button><input id="file" type="file"><p id="status">Ready</p><section id="items"></section><script>
  const mode = new URLSearchParams(location.search).get('mode');
  const saved = ${JSON.stringify(records)};
  const draw = () => document.querySelector('#items').innerHTML = JSON.parse(localStorage.getItem('saved') || '[]').map(item => '<p class="item">' + item.nested.hidden + '</p>').join('');
  if (mode === 'nonempty-target') localStorage.setItem('saved', JSON.stringify(saved));
  if (mode === 'stale-success') document.querySelector('#status').textContent = 'Restored';
  if (mode === 'reload-loss' && localStorage.getItem('saved')) {
    const existing = JSON.parse(localStorage.getItem('saved')); existing[0].flags[1] = true;
    localStorage.setItem('saved', JSON.stringify(existing));
  }
  draw();
  document.querySelector('#save').onclick = () => {
    if (mode === 'empty-source') { document.querySelector('#items').innerHTML = '<p class="item">Only a success-looking UI</p>'; return; }
    localStorage.setItem('saved', JSON.stringify(saved)); draw();
  };
  document.querySelector('#export').onclick = () => {
    if (mode === 'no-download') return;
    if (mode === 'dialog') { confirm(${JSON.stringify(sentinel)}); return; }
    const raw = mode === 'bad-json' ? '{' : mode === 'wrong-export' ? '{"saved":[]}' : mode === 'oversize' ? JSON.stringify({ value: 'x'.repeat(65536) }) : ${JSON.stringify(exported.toString('utf8'))};
    const blob = new Blob(mode === 'bad-utf8' ? [new Uint8Array([123, 255, 125])] : [raw], { type: 'application/json' });
    const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'private-' + ${JSON.stringify(sentinel)} + '.json'; a.click(); };
    download(); if (mode === 'multiple') setTimeout(download, 75);
    if (mode === 'late-multiple') setTimeout(download, 900);
    if (mode === 'destructive-export') { localStorage.removeItem('saved'); draw(); }
  };
  const importFile = async event => {
    const file = event.target.files[0]; const bytes = await file.arrayBuffer();
    await fetch('/received', { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name), 'x-file-type': file.type }, body: bytes });
    const data = mode === 'wrong-export' ? saved : JSON.parse(new TextDecoder().decode(bytes)).saved;
    if (mode === 'field-loss') delete data[0].nested.hidden;
    if (mode !== 'toast-only') localStorage.setItem('saved', JSON.stringify(data));
    draw(); document.querySelector('#status').textContent = mode === 'no-success' ? 'Ready' : 'Restored';
    if (mode === 'chooser-reload') location.reload();
  };
  document.querySelector('#file').onchange = importFile;
  document.querySelector('#choose').onclick = () => {
    if (mode === 'no-chooser') return;
    const input = document.createElement('input'); input.type = 'file';
    input.onchange = importFile; input.click();
  };
  if (['chooser', 'chooser-reload', 'no-chooser', 'chooser-wrong-button'].includes(mode)) document.querySelector('#file').remove();
  </script>`;
  const names = [], types = [];
  const server = http.createServer(async (req, res) => {
    if (req.url === '/received') {
      const chunks = []; for await (const c of req) chunks.push(c); uploads.push(Buffer.concat(chunks));
      names.push(decodeURIComponent(req.headers['x-file-name'])); types.push(req.headers['x-file-type']);
      res.writeHead(204); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, uploads, names, types, close: () => new Promise(resolve => server.close(resolve)) };
}

async function filesBelow(path) {
  const paths = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name); paths.push(...(e.isDirectory() ? await filesBelow(p) : [p]));
  }
  return paths;
}

test('real bytes, fresh contexts, full records, reload and private failure artifacts', { timeout: 180000 }, async t => {
  const app = await fixture();
  const temp = await mkdtemp(join(root, '.crash-lab-backup-'));
  t.after(async () => { await app.close(); await rm(temp, { recursive: true, force: true }); });
  const reports = {};
  const run = async (mode, change = () => {}) => {
    const c = structuredClone(baseContract);
    c.baseURL = app.baseURL; c.path = c.backupRoundtrip.restore.path = '/?mode=' + mode; change(c);
    const r = await runContract(c, { out: join(temp, mode) }); reports[mode] = r; return r.results[0];
  };
  await t.test('actual whitespace, Unicode and property bytes are uploaded without reserialization', async () => {
    const r = await run('fixed');
    assert.equal(r.status, 'pass', JSON.stringify(r));
    assert.equal(r.downloadCount, 1); assert.equal(r.uploadedOriginalBytes, true);
    assert.deepEqual(r.comparisons, { export: { matched: true }, sourceAfterExport: { matched: true }, restoration: { matched: true, changedObservations: [] }, reload: { matched: true, changedObservations: [] } });
    assert.deepEqual(app.uploads[0], exported);
    assert.equal(app.names[0], 'private-' + sentinel + '.json'); assert.equal(app.types[0], 'application/json');
    assert.equal(r.backup.sha256, createHash('sha256').update(app.uploads[0]).digest('hex'));
    assert.equal(r.backup.sizeBytes, exported.length);
  });
  await t.test('a success toast and unchanged count cannot hide loss of an unasserted nested field', async () => {
    const r = await run('field-loss'); assert.equal(r.status, 'fail', JSON.stringify(r));
    assert.equal(r.phase, 'compare-restoration'); assert.deepEqual(r.comparisons.restoration.changedObservations, ['records']);
    assert.equal(reports['field-loss'].exitCode, 1);
    assert.equal((await run('toast-only')).status, 'fail');
  });
  await t.test('restored state must survive the second reload, including hidden fields', async () => {
    const r = await run('reload-loss'); assert.equal(r.status, 'fail', JSON.stringify(r));
    assert.equal(r.comparisons.restoration.matched, true); assert.equal(r.comparisons.reload.matched, false);
  });
  await t.test('no download, multiple downloads and oversize are inconclusive before any import', async () => {
    for (const [mode, error] of [['no-download', 'NO_EXPORT_DOWNLOAD'], ['multiple', 'MULTIPLE_EXPORT_DOWNLOADS'], ['oversize', 'DOWNLOAD_SIZE_LIMIT']]) {
      const count = app.uploads.length; const r = await run(mode);
      assert.equal(r.status, 'inconclusive', JSON.stringify(r)); assert.equal(r.error, error); assert.equal(app.uploads.length, count);
      assert.equal(reports[mode].exitCode, 2);
    }
  });
  await t.test('non-JSON and invalid UTF-8 exports fail without becoming fabricated import files', async () => {
    for (const mode of ['bad-json', 'bad-utf8']) {
      const count = app.uploads.length; const r = await run(mode);
      assert.equal(r.status, 'fail', JSON.stringify(r)); assert.equal(r.error, 'EXPORT_IS_NOT_UTF8_JSON_OBJECT_OR_ARRAY'); assert.equal(app.uploads.length, count);
    }
  });
  await t.test('export must contain source records and must not destroy the source while exporting', async () => {
    const count = app.uploads.length;
    assert.equal((await run('wrong-export')).error, 'EXPORT_STATE_DIFFERS');
    assert.equal((await run('destructive-export')).error, 'SOURCE_CHANGED_DURING_EXPORT');
    assert.equal(app.uploads.length, count);
  });
  await t.test('a delayed second download inside the explicit observation window is inconclusive', async () => {
    const r = await run('late-multiple', c => c.timeoutMs = 1300);
    assert.equal(r.status, 'inconclusive'); assert.equal(r.error, 'MULTIPLE_EXPORT_DOWNLOADS');
  });
  await t.test('an on-demand unattached file input receives the real download through its native chooser', async () => {
    const c = source => {
      delete source.backupRoundtrip.restore.target; source.backupRoundtrip.restore.fileChooser = { css: '#choose' };
      source.backupRoundtrip.restore.ready = [{ action: 'expectVisible', target: { css: '#choose' } }];
    };
    const before = app.uploads.length; const r = await run('chooser', c);
    assert.equal(r.status, 'pass', JSON.stringify(r)); assert.equal(r.uploadTransport, 'file-chooser');
    assert.deepEqual(app.uploads[before], exported);
    const missing = await run('no-chooser', c); assert.equal(missing.status, 'inconclusive'); assert.equal(missing.error, 'IMPORT_FILE_CHOOSER_NOT_OBSERVED');
    const count = app.uploads.length;
    const wrong = await run('chooser-wrong-button', source => { c(source); source.backupRoundtrip.restore.fileChooser = { css: '#missing' }; });
    assert.equal(wrong.status, 'inconclusive'); assert.equal(wrong.error, 'IMPORT_FILE_CHOOSER_TRIGGER_FAILED'); assert.equal(app.uploads.length, count);
  });
  await t.test('file chooser import may reload automatically without changing the saved record verdict', async () => {
    const r = await run('chooser-reload', c => {
      delete c.backupRoundtrip.restore.target; c.backupRoundtrip.restore.fileChooser = { css: '#choose' };
      c.backupRoundtrip.restore.ready = [{ action: 'expectVisible', target: { css: '#choose' } }];
      c.backupRoundtrip.restore.success = { observe: { count: { source: 'count', target: { css: '.item' } } }, expected: { count: 1 } };
    });
    assert.equal(r.status, 'pass', JSON.stringify(r)); assert.equal(r.comparisons.reload.matched, true);
  });
  await t.test('fresh context is insufficient when it opens with existing shared data or stale success', async () => {
    const count = app.uploads.length;
    assert.equal((await run('nonempty-target')).error, 'FRESH_TARGET_NOT_EMPTY');
    assert.equal((await run('stale-success')).error, 'IMPORT_SUCCESS_ALREADY_TRUE');
    assert.equal(app.uploads.length, count);
  });
  await t.test('wrong baseline is inconclusive; absent import completion fails; unexpected dialog stays private', async () => {
    const r = await run('wrong-baseline', c => c.expected.count = 2);
    assert.equal(r.status, 'inconclusive'); assert.equal(r.error, 'SOURCE_BASELINE_NOT_CONFIRMED');
    assert.equal((await run('empty-source')).error, 'SOURCE_HAS_NO_SELECTED_SAVED_DATA');
    assert.equal((await run('no-success')).error, 'IMPORT_SUCCESS_NOT_OBSERVED');
    assert.equal((await run('dialog')).error, 'UNEXPECTED_NATIVE_DIALOG');
  });
  await t.test('standalone tests replay the same pass and failure with no runner import or harvested data', async () => {
    for (const [mode, exit] of [['fixed', 0], ['field-loss', 1], ['no-download', 1], ['chooser', 0], ['chooser-reload', 0]]) {
      const r = reports[mode];
      const source = await readFile(join(r.out, 'repro.spec.mjs'), 'utf8');
      assert.ok(!source.includes("from './lib")); assert.ok(!source.includes(sentinel));
      const replay = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(r.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
        child.on('error', reject); child.on('close', code => done({ code, output }));
      });
      assert.equal(replay.code, exit, replay.output); assert.ok(!replay.output.includes(sentinel));
      if (mode === 'no-download') { assert.equal(r.exitCode, 2); assert.match(replay.output, /inconclusive/); assert.match(replay.output, /NO_EXPORT_DOWNLOAD/); }
    }
  });
  await t.test('all saved CLI and failing standalone artifacts omit captured values and suggested filenames', async () => {
    const files = await filesBelow(temp);
    assert.ok(!files.some(p => /\.(png|webm|zip)$/.test(p)), JSON.stringify(files));
    for (const p of files) assert.ok(!(await readFile(p)).includes(Buffer.from(sentinel)), p);
    for (const r of Object.values(reports)) { assert.equal(r.results[0].before, null); assert.equal(r.results[0].after, null); }
    const html = await readFile(join(reports.fixed.out, 'index.html'), 'utf8');
    assert.ok(html.includes('Export → fresh restore → reload')); assert.ok(!html.includes('backup-roundtrip.trace.zip'));
  });
});
