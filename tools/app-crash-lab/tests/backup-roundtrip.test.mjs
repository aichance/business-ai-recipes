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
const confirmationMessage = 'Replace the disposable test records?';
const records = [{ title: 'Synthetic café — 合成', nested: { color: 'blue', hidden: sentinel }, flags: [true, false] }];
const exported = Buffer.from('{\n  "saved" : ' + JSON.stringify(records) + ',\n  "format": 1\n}\n');
const baseContract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Actual backup roundtrip',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 3000, stabilityMs: 100,
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
const sourceReady = {
  observe: { color: { observation: 'records', jsonPath: [0, 'nested', 'color'] } },
  expected: { color: 'blue' },
};

test('source-ready contracts project only selected saved observations, with bounded paths and complete expectations', () => {
  const c = structuredClone(baseContract); c.backupRoundtrip.sourceReady = sourceReady;
  assert.deepEqual(validateContract(c).backupRoundtrip.sourceReady, sourceReady);
  const invalid = change => { const copy = structuredClone(c); change(copy); assert.throws(() => validateContract(copy), /Invalid contract/); };
  invalid(c => c.backupRoundtrip.sourceReady = {});
  invalid(c => c.backupRoundtrip.sourceReady.observe = {});
  invalid(c => c.backupRoundtrip.sourceReady.observe.color.observation = 'count');
  invalid(c => c.backupRoundtrip.sourceReady.observe.color.observation = 'notSelected');
  invalid(c => c.backupRoundtrip.sourceReady.observe.color.jsonPath = Array(65).fill('nested'));
  invalid(c => c.backupRoundtrip.sourceReady.observe.color.jsonPath = [-1]);
  invalid(c => c.backupRoundtrip.sourceReady.expected = {});
  invalid(c => c.backupRoundtrip.sourceReady.steps = [{ action: 'click', target: { css: '#save' } }]);
  invalid(c => c.backupRoundtrip.sourceReady.observe.color.source = 'localStorage');
  invalid(c => { c.checks = ['reload']; });
  invalid(c => {
    c.backupRoundtrip.sourceReady.observe = Object.fromEntries(Array.from({ length: 101 }, (_, i) => ['value' + i, { observation: 'records', jsonPath: [] }]));
  });
});

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
  invalid(c => c.backupRoundtrip.restore.ready = [{ action: 'goto', path: '/repair' }]);
  invalid(c => c.backupRoundtrip.restore.after = [{ action: 'goto', path: '/lose' }, { action: 'goto', path: '/repair' }]);
  invalid(c => c.afterReload = [{ action: 'goto', path: '/repair' }]);
  invalid(c => c.afterReload = [{ action: 'setFile', target: { css: '#file' }, file: { name: 'repair.json', mimeType: 'application/json', text: '{}' } }]);
  invalid(c => { delete c.observe.records; delete c.backupRoundtrip.restore.empty.records; });
  invalid(c => c.backupRoundtrip.restore.ready = []);
  for (const confirm of [null, {}, { message: '', accept: true }, { message: confirmationMessage, accept: false }, { message: confirmationMessage, accept: true, match: 'partial' }, { message: 42, accept: true }]) {
    invalid(c => c.backupRoundtrip.restore.confirm = confirm);
  }
  const confirmed = structuredClone(baseContract);
  confirmed.backupRoundtrip.restore.confirm = { message: confirmationMessage, accept: true };
  assert.deepEqual(validateContract(confirmed).backupRoundtrip.restore.confirm, confirmed.backupRoundtrip.restore.confirm);
  invalid(c => c.backupRoundtrip.restore.success.expected = {});
  invalid(c => c.backupRoundtrip.export.steps = [{ action: 'request', method: 'DELETE', path: '/data', expectStatus: 200 }]);
});

test('shipped real-app backup contracts remain valid with post-import view navigation', async () => {
  for (const name of ['devtasks/roundtrip-feature.json', 'devtasks/roundtrip-docs.json', 'price-table/roundtrip.json', 'paisa/roundtrip.json']) {
    const c = JSON.parse(await readFile(join(root, 'examples', name), 'utf8'));
    assert.doesNotThrow(() => validateContract(c), name);
  }
});

async function fixture() {
  const uploads = [];
  const html = `<!doctype html><meta charset="utf-8"><button id="save">Save</button><button id="export">Export</button><button id="choose">Import</button><input id="file" type="file"><p id="status">Ready</p><section id="items"></section><script>
  const mode = new URLSearchParams(location.search).get('mode');
  const saved = ${JSON.stringify(records)};
  if (mode === 'repair-on-navigation' && localStorage.getItem('saved')) localStorage.setItem('saved', JSON.stringify(saved));
  const draw = () => document.querySelector('#items').innerHTML = JSON.parse(localStorage.getItem('saved') || '[]').map(item => '<p class="item">' + item.nested.hidden + '</p>').join('');
  if (mode === 'nonempty-target') localStorage.setItem('saved', JSON.stringify(saved));
  if (mode === 'stale-success') document.querySelector('#status').textContent = 'Restored';
  if (mode === 'confirm-ready') confirm(${JSON.stringify(confirmationMessage)});
  if (['reload-loss', 'confirm-reload-loss'].includes(mode) && localStorage.getItem('saved')) {
    const existing = JSON.parse(localStorage.getItem('saved')); existing[0].flags[1] = true;
    localStorage.setItem('saved', JSON.stringify(existing));
  }
  draw();
  document.querySelector('#save').onclick = () => {
    if (mode === 'confirm-source') confirm(${JSON.stringify(confirmationMessage)});
    if (mode === 'empty-source') { document.querySelector('#items').innerHTML = '<p class="item">Only a success-looking UI</p>'; return; }
    if (mode === 'source-unavailable') {
      localStorage.setItem('saved', ${JSON.stringify(sentinel)});
      document.querySelector('#items').innerHTML = '<p class="item">Visible before durable save</p>'; return;
    }
    if (['source-delayed', 'source-missing-delayed', 'source-null-delayed', 'source-never', 'source-missing', 'source-null'].includes(mode)) {
      const old = structuredClone(saved); old[0].nested.color = 'red';
      if (mode.includes('missing')) delete old[0].nested.color;
      if (mode.includes('null')) old[0].nested.color = null;
      localStorage.setItem('saved', JSON.stringify(old)); draw();
      if (mode.endsWith('delayed')) setTimeout(() => { localStorage.setItem('saved', JSON.stringify(saved)); draw(); }, 150);
      return;
    }
    localStorage.setItem('saved', JSON.stringify(saved)); draw();
    if (['source-revert', 'source-other-change'].includes(mode)) {
      // An adversarial fixture changes storage immediately after its first full
      // record sample. No timer race can accidentally skip the transient ready
      // state; a separately read predicate must not bless a later old baseline.
      const original = Storage.prototype.getItem; let sampled = false;
      Storage.prototype.getItem = function(key) {
        const raw = original.call(this, key);
        if (this === localStorage && key === 'saved' && !sampled) {
          sampled = true;
          queueMicrotask(() => {
            const changed = JSON.parse(raw);
            if (mode === 'source-revert') changed[0].nested.color = 'red';
            else changed[0].flags[1] = true;
            localStorage.setItem('saved', JSON.stringify(changed));
          });
        }
        return raw;
      };
    }
  };
  document.querySelector('#export').onclick = () => {
    if (mode === 'no-download') return;
    if (mode === 'dialog') { confirm(${JSON.stringify(sentinel)}); return; }
    const raw = mode === 'source-null' ? JSON.stringify({ saved: JSON.parse(localStorage.getItem('saved')), format: 1 }) : mode === 'bad-json' ? '{' : mode === 'wrong-export' ? '{"saved":[]}' : mode === 'oversize' ? JSON.stringify({ value: 'x'.repeat(65536) }) : ${JSON.stringify(exported.toString('utf8'))};
    const blob = new Blob(mode === 'bad-utf8' ? [new Uint8Array([123, 255, 125])] : [raw], { type: 'application/json' });
    const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'private-' + ${JSON.stringify(sentinel)} + '.json'; a.click(); };
    download(); if (mode === 'multiple') setTimeout(download, 75);
    if (mode === 'late-multiple') setTimeout(download, 900);
    if (mode === 'destructive-export') { localStorage.removeItem('saved'); draw(); }
  };
  const importFile = async event => {
    const file = event.target.files[0]; const bytes = await file.arrayBuffer();
    await fetch('/received', { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name), 'x-file-type': file.type }, body: bytes });
    if (mode === 'confirm-wrong') { confirm(${JSON.stringify(sentinel)}); return; }
    if (mode === 'confirm-alert') { alert(${JSON.stringify(sentinel)}); return; }
    if (['confirm', 'confirm-chooser', 'confirm-duplicate', 'confirm-late', 'confirm-field-loss', 'confirm-reload-loss'].includes(mode)) {
      if (!confirm(${JSON.stringify(confirmationMessage)})) return;
      if (mode === 'confirm-duplicate' && !confirm(${JSON.stringify(confirmationMessage)})) return;
      if (mode === 'confirm-late') setTimeout(() => confirm(${JSON.stringify(confirmationMessage)}), 30);
    }
    const data = mode === 'wrong-export' ? saved : JSON.parse(new TextDecoder().decode(bytes)).saved;
    if (['field-loss', 'loss-before-navigation', 'confirm-field-loss'].includes(mode)) delete data[0].nested.hidden;
    if (mode !== 'toast-only') localStorage.setItem('saved', JSON.stringify(data));
    draw(); document.querySelector('#status').textContent = mode === 'no-success' ? 'Ready' : 'Restored';
    if (mode === 'chooser-reload') location.reload();
  };
  document.querySelector('#file').onchange = importFile;
  document.querySelector('#choose').onclick = () => {
    if (mode === 'confirm-trigger') confirm(${JSON.stringify(confirmationMessage)});
    if (mode === 'no-chooser') return;
    const input = document.createElement('input'); input.type = 'file';
    input.onchange = importFile; input.click();
  };
  if (['chooser', 'chooser-reload', 'no-chooser', 'chooser-wrong-button', 'confirm-chooser', 'confirm-trigger'].includes(mode)) document.querySelector('#file').remove();
  </script>`;
  const names = [], types = [], visits = [];
  const server = http.createServer(async (req, res) => {
    visits.push(req.url);
    if (req.url === '/received') {
      const chunks = []; for await (const c of req) chunks.push(c); uploads.push(Buffer.concat(chunks));
      names.push(decodeURIComponent(req.headers['x-file-name'])); types.push(req.headers['x-file-type']);
      res.writeHead(204); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, uploads, names, types, visits, close: () => new Promise(resolve => server.close(resolve)) };
}

async function filesBelow(path) {
  const paths = [];
  for (const e of await readdir(path, { withFileTypes: true })) {
    const p = join(path, e.name); paths.push(...(e.isDirectory() ? await filesBelow(p) : [p]));
  }
  return paths;
}

test('source-ready waits for durable values without weakening full-state, fresh-target or privacy checks', { timeout: 120000 }, async t => {
  const app = await fixture();
  const temp = await mkdtemp(join(root, '.crash-lab-source-ready-'));
  t.after(async () => { await app.close(); await rm(temp, { recursive: true, force: true }); });
  const reports = {};
  const run = async (mode, change = () => {}) => {
    const c = structuredClone(baseContract);
    c.baseURL = app.baseURL; c.path = c.backupRoundtrip.restore.path = '/?mode=' + mode;
    c.timeoutMs = 600; c.backupRoundtrip.sourceReady = structuredClone(sourceReady); change(c);
    const r = await runContract(c, { out: join(temp, mode) }); reports[mode] = r; return r.results[0];
  };
  await t.test('durable field may appear after UI counts, while the fresh target lacks that nested field', async () => {
    const r = await run('source-delayed');
    assert.equal(r.status, 'pass', JSON.stringify(r));
    assert.equal(r.comparisons.export.matched, true); assert.equal(r.comparisons.reload.matched, true);
    assert.deepEqual(app.uploads.at(-1), exported);
  });
  await t.test('missing paths can become ready; an absent property is different from an explicit saved null', async () => {
    for (const mode of ['source-missing-delayed', 'source-null-delayed']) assert.equal((await run(mode)).status, 'pass');
    const expectNull = c => { c.backupRoundtrip.sourceReady.expected.color = null; };
    const absent = await run('source-missing', expectNull);
    assert.equal(absent.status, 'inconclusive'); assert.equal(absent.error, 'SOURCE_READY_NOT_CONFIRMED');
    assert.equal(absent.downloadCount, 0);
    assert.equal((await run('source-null', expectNull)).status, 'pass');
    assert.equal(JSON.parse(app.uploads.at(-1)).saved[0].nested.color, null);
  });
  await t.test('never-ready or unavailable source stops before any export/import and remains inconclusive', async () => {
    const count = app.uploads.length;
    for (const [mode, error] of [['source-never', 'SOURCE_READY_NOT_CONFIRMED'], ['source-unavailable', 'SOURCE_READY_UNAVAILABLE']]) {
      const r = await run(mode);
      assert.equal(r.status, 'inconclusive'); assert.equal(r.error, error); assert.equal(r.phase, 'source-ready');
      assert.equal(r.downloadCount, 0); assert.ok(!r.events.some(e => e.phase === 'export'));
    }
    assert.equal(app.uploads.length, count);
  });
  await t.test('transient readiness and changes outside the predicate cannot replace the complete baseline', async () => {
    const count = app.uploads.length;
    for (const mode of ['source-revert', 'source-other-change']) {
      const r = await run(mode);
      assert.equal(r.status, 'inconclusive'); assert.equal(r.error, 'SOURCE_BASELINE_NOT_STABLE');
      assert.equal(r.downloadCount, 0); assert.ok(!r.events.some(e => e.phase === 'export'));
    }
    assert.equal(app.uploads.length, count);
  });
  await t.test('hidden-field and second-reload losses still fail the whole-record comparison', async () => {
    assert.equal((await run('field-loss')).status, 'fail');
    const r = await run('reload-loss'); assert.equal(r.status, 'fail');
    assert.equal(r.comparisons.restoration.matched, true); assert.equal(r.comparisons.reload.matched, false);
  });
  await t.test('unchanged generated specs preserve pass/inconclusive verdicts and private artifacts', async () => {
    for (const [mode, exit] of [['source-delayed', 0], ['source-never', 1], ['source-revert', 1]]) {
      const report = reports[mode];
      const replay = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(report.out, 'playwright.config.mjs'), '--reporter=json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '', stderr = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => stderr += c);
        child.on('error', reject); child.on('close', code => done({ code, output, stderr }));
      });
      assert.equal(replay.code, exit, replay.output); assert.ok(!replay.output.includes(sentinel)); assert.ok(!replay.stderr.includes(sentinel));
      const attachments = [];
      const collect = suite => {
        for (const spec of suite.specs ?? []) for (const test of spec.tests) for (const result of test.results) attachments.push(...result.attachments);
        for (const child of suite.suites ?? []) collect(child);
      };
      for (const suite of JSON.parse(replay.output).suites) collect(suite);
      const attached = attachments.filter(a => a.name === 'state-diff'); assert.equal(attached.length, 1);
      const actual = JSON.parse(Buffer.from(attached[0].body, 'base64').toString('utf8'));
      for (const key of ['status', 'phase', 'error']) assert.deepEqual(actual[key], report.results[0][key], mode + ': ' + key);
    }
    const paths = await filesBelow(temp);
    assert.ok(!paths.some(p => /\.(png|webm|zip)$/.test(p)));
    for (const p of paths) assert.ok(!(await readFile(p)).includes(Buffer.from(sentinel)), p);
    for (const report of Object.values(reports)) {
      assert.equal(report.results[0].before, null); assert.equal(report.results[0].after, null);
    }
  });
});

test('real bytes, fresh contexts, full records, reload and private failure artifacts', { timeout: 600000 }, async t => {
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
  await t.test('view navigation preserves a good import but cannot repair lost fields before comparison', async () => {
    const good = await run('navigate', c => c.backupRoundtrip.restore.after = [{ action: 'goto', path: '/?mode=fixed' }]);
    assert.equal(good.status, 'pass', JSON.stringify(good));
    assert.deepEqual(good.comparisons.beforeNavigation, { matched: true, changedObservations: [] });
    const before = app.visits.filter(url => url.includes('repair-on-navigation')).length;
    const bad = await run('loss-before-navigation', c => c.backupRoundtrip.restore.after = [{ action: 'goto', path: '/?mode=repair-on-navigation' }]);
    assert.equal(bad.status, 'fail', JSON.stringify(bad)); assert.equal(bad.phase, 'compare-before-navigation');
    assert.equal(bad.error, 'RESTORED_STATE_DIFFERS_BEFORE_NAVIGATION');
    assert.deepEqual(bad.comparisons.beforeNavigation.changedObservations, ['records']);
    assert.equal(app.visits.filter(url => url.includes('repair-on-navigation')).length, before);
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
  const confirmed = c => c.backupRoundtrip.restore.confirm = { message: confirmationMessage, accept: true };
  const chooserConfirmed = c => {
    confirmed(c); delete c.backupRoundtrip.restore.target;
    c.backupRoundtrip.restore.fileChooser = { css: '#choose' };
    c.backupRoundtrip.restore.ready = [{ action: 'expectVisible', target: { css: '#choose' } }];
  };
  await t.test('one declared exact confirmation works for direct input and native file chooser', async () => {
    for (const [mode, change, transport] of [['confirm', confirmed, 'input'], ['confirm-chooser', chooserConfirmed, 'file-chooser']]) {
      const before = app.uploads.length;
      const r = await run(mode, change);
      assert.equal(r.status, 'pass', JSON.stringify(r));
      assert.deepEqual(r.importConfirmation, { required: true, observed: true, acceptedCount: 1 });
      assert.equal(r.uploadTransport, transport); assert.deepEqual(app.uploads[before], exported);
      assert.equal(r.comparisons.restoration.matched, true); assert.equal(r.comparisons.reload.matched, true);
    }
  });
  await t.test('undeclared, wrong, duplicate and post-upload dialogs cannot create a pass', async () => {
    const undeclared = await run('confirm-undeclared', c => c.path = c.backupRoundtrip.restore.path = '/?mode=confirm');
    assert.equal(undeclared.status, 'inconclusive'); assert.equal(undeclared.error, 'UNEXPECTED_NATIVE_DIALOG');
    for (const mode of ['confirm-wrong', 'confirm-alert', 'confirm-duplicate', 'confirm-late']) {
      const r = await run(mode, confirmed);
      assert.equal(r.status, 'inconclusive', JSON.stringify(r)); assert.equal(r.error, 'UNEXPECTED_NATIVE_DIALOG', JSON.stringify({ mode, result: r }));
      assert.ok(r.importConfirmation.acceptedCount <= 1);
    }
    const missing = await run('confirm-missing', confirmed);
    assert.equal(missing.status, 'inconclusive'); assert.equal(missing.error, 'IMPORT_CONFIRMATION_NOT_OBSERVED');
    assert.deepEqual(missing.importConfirmation, { required: true, observed: false, acceptedCount: 0 });
    assert.equal(missing.uploadedOriginalBytes, true);
  });
  await t.test('source, ready and chooser-trigger confirmations are outside the upload permission', async () => {
    for (const [mode, change] of [['confirm-source', confirmed], ['confirm-ready', c => { confirmed(c); c.path = '/?mode=fixed'; }], ['confirm-trigger', chooserConfirmed]]) {
      const r = await run(mode, change);
      assert.equal(r.status, 'inconclusive', JSON.stringify(r)); assert.equal(r.error, 'UNEXPECTED_NATIVE_DIALOG');
      assert.equal(r.importConfirmation, undefined);
    }
    const stale = await run('confirm-stale', c => { confirmed(c); c.path = c.backupRoundtrip.restore.path = '/?mode=stale-success'; });
    assert.equal(stale.error, 'IMPORT_SUCCESS_ALREADY_TRUE'); assert.equal(stale.importConfirmation, undefined);
  });
  await t.test('an accepted confirmation cannot hide nested field loss or loss after reload', async () => {
    for (const [mode, phase] of [['confirm-field-loss', 'compare-restoration'], ['confirm-reload-loss', 'compare-reload']]) {
      const r = await run(mode, confirmed);
      assert.equal(r.status, 'fail', JSON.stringify(r)); assert.equal(r.phase, phase);
      assert.deepEqual(r.importConfirmation, { required: true, observed: true, acceptedCount: 1 });
    }
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
    for (const [mode, exit] of [['fixed', 0], ['field-loss', 1], ['no-download', 1], ['chooser', 0], ['chooser-reload', 0], ['navigate', 0], ['loss-before-navigation', 1], ['confirm', 0], ['confirm-chooser', 0], ['confirm-field-loss', 1], ['confirm-missing', 1], ['confirm-wrong', 1], ['confirm-alert', 1], ['confirm-duplicate', 1], ['confirm-late', 1], ['confirm-source', 1], ['confirm-ready', 1], ['confirm-trigger', 1]]) {
      const r = reports[mode];
      const source = await readFile(join(r.out, 'repro.spec.mjs'), 'utf8');
      assert.ok(!source.includes("from './lib")); assert.ok(!source.includes(sentinel));
      const replay = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(r.out, 'playwright.config.mjs'), '--reporter=json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '', stderr = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => stderr += c);
        child.on('error', reject); child.on('close', code => done({ code, output, stderr }));
      });
      assert.equal(replay.code, exit, replay.output); assert.ok(!replay.output.includes(sentinel));
      assert.ok(!replay.output.includes(confirmationMessage));
      assert.ok(!replay.stderr.includes(sentinel)); assert.ok(!replay.stderr.includes(confirmationMessage));
      const attachments = [];
      const collect = suite => {
        for (const spec of suite.specs ?? []) for (const test of spec.tests) for (const result of test.results) attachments.push(...result.attachments);
        for (const child of suite.suites ?? []) collect(child);
      };
      const replayReport = JSON.parse(replay.output); for (const suite of replayReport.suites) collect(suite);
      const attached = attachments.filter(a => a.name === 'state-diff');
      assert.equal(attached.length, 1, replay.output);
      const attachedText = Buffer.from(attached[0].body, 'base64').toString('utf8');
      assert.ok(!attachedText.includes(sentinel)); assert.ok(!attachedText.includes(confirmationMessage));
      const actual = JSON.parse(attachedText), expected = r.results[0];
      for (const field of ['status', 'error', 'phase']) assert.deepEqual(actual[field], expected[field], `${mode}: ${field}`);
      if (mode === 'no-download') { assert.equal(r.exitCode, 2); assert.match(replay.output, /inconclusive/); assert.match(replay.output, /NO_EXPORT_DOWNLOAD/); }
    }
  });
  await t.test('all saved CLI and failing standalone artifacts omit captured values and suggested filenames', async () => {
    const files = await filesBelow(temp);
    assert.ok(!files.some(p => /\.(png|webm|zip)$/.test(p)), JSON.stringify(files));
    for (const p of files) assert.ok(!(await readFile(p)).includes(Buffer.from(sentinel)), p);
    for (const r of Object.values(reports)) { assert.equal(r.results[0].before, null); assert.equal(r.results[0].after, null); }
    for (const mode of ['confirm', 'confirm-chooser', 'confirm-field-loss', 'confirm-missing', 'confirm-wrong', 'confirm-alert', 'confirm-duplicate', 'confirm-late']) {
      for (const name of ['report.json', 'index.html']) assert.ok(!(await readFile(join(reports[mode].out, name), 'utf8')).includes(confirmationMessage));
    }
    const html = await readFile(join(reports.fixed.out, 'index.html'), 'utf8');
    assert.ok(html.includes('Export → fresh restore → reload')); assert.ok(!html.includes('backup-roundtrip.trace.zip'));
  });
});
