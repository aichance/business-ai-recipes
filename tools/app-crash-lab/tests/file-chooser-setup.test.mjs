import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateContract } from '../lib/contract.mjs';
import { runContract } from '../lib/runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const record = { title: 'Literal 合成 fixture', body: 'Keep every field', metadata: { tags: ['a', 'b'], revision: 7 } };
const contract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Native chooser fixture setup', baseURL: 'http://127.0.0.1:1', path: '/',
  timeoutMs: 800, stabilityMs: 100, reset: [], checks: ['reload'],
  setup: [{ action: 'setFile', target: { role: 'button', name: 'Import fixture' }, fileChooser: true, save: true,
    file: { name: '合成.json', mimeType: 'application/json', text: JSON.stringify(record) } }],
  observe: { saved: { source: 'localStorage', key: 'record', parse: 'json' }, title: { source: 'text', target: { css: '#title' } } },
  expected: { saved: record, title: record.title },
};

test('native chooser setup is explicit and cannot change other action/dialog scopes', () => {
  assert.equal(validateContract(contract).setup[0].fileChooser, true);
  for (const flag of [false, 'true', 1, null]) {
    const c = structuredClone(contract); c.setup[0].fileChooser = flag;
    assert.throws(() => validateContract(c), /fileChooser/);
  }
  for (const where of ['reset', 'rejectedUpdate']) {
    const c = structuredClone(contract);
    if (where === 'reset') c.reset = [structuredClone(c.setup[0])];
    else c.rejectedUpdate = { steps: [structuredClone(c.setup[0])], observe: { title: c.observe.title }, expected: { title: 'Rejected' } };
    assert.throws(() => validateContract(c), /fileChooser/);
  }
  const click = structuredClone(contract); click.setup.unshift({ action: 'click', target: { css: '#x' }, fileChooser: true });
  assert.throws(() => validateContract(click), /fileChooser/);
});

test('detached input fixture setup preserves data, catches a silent field loss and replays standalone', async t => {
  const uploads = new Map();
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/uploaded') { const mode = url.searchParams.get('mode'); uploads.set(mode, (uploads.get(mode) ?? 0) + 1); response.writeHead(204); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><button id="import">Import fixture</button><p id="title"></p><p id="status"></p><button id="reject">Reject</button><button id="export">Export</button><input id="restore" type="file"><script>
      const mode = new URLSearchParams(location.search).get('mode');
      let saved = JSON.parse(localStorage.getItem('record') || 'null');
      if (saved && mode === 'broken') { saved.metadata.tags.pop(); localStorage.setItem('record', JSON.stringify(saved)); }
      document.querySelector('#title').textContent = saved?.title || '';
      function use(data) { localStorage.setItem('record', JSON.stringify(data)); document.querySelector('#title').textContent = data.title; document.querySelector('#status').textContent = 'Restored'; }
      document.querySelector('#reject').onclick = () => alert('Invalid file');
      document.querySelector('#restore').onchange = async event => use(JSON.parse(await event.target.files[0].text()).saved);
      document.querySelector('#export').onclick = () => { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([JSON.stringify({ saved: JSON.parse(localStorage.getItem('record')) })], { type: 'application/json' })); link.download = 'backup.json'; link.click(); };
      document.querySelector('#import').onclick = () => {
        if (mode === 'missing') return;
        if (mode === 'confirm' && !confirm('Unexpected before chooser')) return;
        if (mode === 'ignored-confirm') confirm('Unexpected before chooser');
        if (mode === 'alert') alert('Unexpected before chooser');
        const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
        input.onchange = async () => { await fetch('/uploaded?mode=' + mode); use(JSON.parse(await input.files[0].text())); if (mode === 'baseline-alert') { document.querySelector('#title').textContent = ''; setTimeout(() => alert('Unexpected during baseline'), 25); setTimeout(() => document.querySelector('#title').textContent = saved = ${JSON.stringify(record.title)}, 150); } };
        input.click();
      };
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const temporary = await mkdtemp(join(root, '.test-chooser-'));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true, force: true }); });
  async function run(name, path) { return runContract({ ...structuredClone(contract), baseURL, path }, { out: join(temporary, name) }); }
  const fixed = await run('fixed', '/');
  assert.equal(fixed.results[0].status, 'pass');
  assert.deepEqual(fixed.results[0].after.saved, record);
  const broken = await run('broken', '/?mode=broken');
  assert.equal(broken.results[0].status, 'fail');
  assert.equal(broken.results[0].after.title, record.title);
  assert.ok(broken.results[0].differences.some(x => x.path.includes('tags')));
  let unexpected;
  for (const mode of ['missing', 'confirm', 'ignored-confirm', 'alert']) {
    const result = await run(mode, `/?mode=${mode}`);
    assert.equal(result.results[0].status, 'inconclusive');
    assert.equal(result.results[0].phase, 'baseline');
    assert.equal(result.results[0].events.at(-1).status, 'started');
    assert.equal(uploads.get(mode) ?? 0, 0, 'unexpected dialog must stop before fixture upload');
    if (mode === 'ignored-confirm' || mode === 'alert') {
      assert.match(result.results[0].error, /Unexpected native dialog/);
      unexpected = result;
    }
  }
  const rejected = await runContract({ ...structuredClone(contract), baseURL, path: '/?mode=baseline-alert', checks: ['rejected-update'], rejectedUpdate: { steps: [{ action: 'click', target: { css: '#reject' } }], dialog: { type: 'alert', message: 'Invalid file' } } }, { out: join(temporary, 'baseline-alert') });
  assert.equal(rejected.results[0].status, 'inconclusive');
  assert.match(rejected.results[0].error, /Unexpected native dialog/);
  assert.equal(rejected.results[0].events.some(event => event.phase === 'invalid-update'), false);
  const backup = { ...structuredClone(contract), baseURL, checks: ['backup-roundtrip'], backupRoundtrip: {
    isolation: 'browser-local',
    export: { steps: [{ action: 'click', target: { css: '#export' } }], maxBytes: 65536, statePaths: { saved: ['saved'] } },
    restore: { path: '/', ready: [{ action: 'expectVisible', target: { css: '#restore' } }], empty: { saved: null, title: '' }, target: { css: '#restore' }, mimeType: 'application/json', success: { observe: { status: { source: 'text', target: { css: '#status' } } }, expected: { status: 'Restored' } } },
  } };
  const restored = await runContract(backup, { out: join(temporary, 'backup') });
  assert.equal(restored.results[0].status, 'pass', restored.results[0].error);
  for (const mode of ['ignored-confirm', 'alert']) {
    const failed = await runContract({ ...backup, path: '/?mode=' + mode }, { out: join(temporary, 'backup-' + mode) });
    assert.equal(failed.results[0].status, 'inconclusive');
    assert.equal(failed.results[0].error, 'UNEXPECTED_NATIVE_DIALOG');
    assert.equal(uploads.get(mode) ?? 0, 0);
  }
  for (const [result, code] of [[fixed, 0], [broken, 1], [unexpected, 1], [restored, 0]]) {
    const file = join(result.out, 'repro.spec.mjs');
    const before = await readFile(file);
    const replay = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(result.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', value => output += value); child.stderr.on('data', value => output += value);
      const timer = setTimeout(() => child.kill('SIGTERM'), 25000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', value => { clearTimeout(timer); resolve({ code: value, output }); });
    });
    assert.equal(replay.code, code, replay.output);
    assert.deepEqual(await readFile(file), before);
  }
});
