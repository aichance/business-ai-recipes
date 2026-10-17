import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { validateContract } from '../lib/contract.mjs';
import { executeBackupRoundtrip } from '../lib/protocol.mjs';
import { runContract } from '../lib/runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sentinel = 'CAPTURED_ALERT_PRIVATE_8d27fc';
const message = 'Progressi ripristinati. 合成';
const records = [{ id: 'synthetic-42', due: 1792232200000, last: 1792232100000, totalMs: 1234.5, hidden: { text: sentinel }, flags: [true, false] }];
const bytes = Buffer.from('{\n "saved" : ' + JSON.stringify(records) + ', "format": 1\n}\n');
const base = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Backup with exact completion alert',
  baseURL: 'http://127.0.0.1:1', path: '/', timeoutMs: 650, stabilityMs: 100, reset: [],
  checks: ['backup-roundtrip'], setup: [{ action: 'click', target: { css: '#save' }, save: true }],
  observe: { records: { source: 'localStorage', key: 'saved', parse: 'json' }, count: { source: 'count', target: { css: '.item' } } },
  expected: { count: 1 },
  backupRoundtrip: {
    isolation: 'browser-local',
    export: { steps: [{ action: 'click', target: { css: '#export' } }], maxBytes: 65536, statePaths: { records: ['saved'] } },
    restore: {
      path: '/', ready: [{ action: 'expectVisible', target: { css: '#file' } }],
      empty: { records: null, count: 0 }, target: { css: '#file' }, mimeType: 'application/json',
      success: { dialog: { type: 'alert', message } },
    },
  },
};

test('backup completion alert is exact, opt-in and limited to direct imports', () => {
  assert.deepEqual(validateContract(base).backupRoundtrip.restore.success.dialog, { type: 'alert', message });
  const invalid = change => { const c = structuredClone(base); change(c); assert.throws(() => validateContract(c), /Invalid contract/); };
  for (const dialog of [null, {}, { type: 'confirm', message }, { type: 'prompt', message }, { type: 'alert', message: '' }, { type: 'alert', message: ' \t' }, { type: 'alert', message: 1 }, { type: 'alert', message, accept: true }, { type: 'alert', message, match: 'substring' }]) invalid(c => c.backupRoundtrip.restore.success.dialog = dialog);
  invalid(c => c.backupRoundtrip.restore.success.observe = { status: { source: 'text', target: { css: '#status' } } });
  invalid(c => c.backupRoundtrip.restore.success.expected = { status: 'Restored' });
  invalid(c => c.backupRoundtrip.restore.confirm = { message: 'Replace?', accept: true });
  invalid(c => c.backupRoundtrip.restore.commit = { frame: { css: '.preview' }, target: { css: 'button' }, ready: [{ action: 'expectText', target: { css: 'h2' }, value: 'Review' }] });
});

async function fixture() {
  const uploads = new Map(), visits = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('case');
    if (url.pathname === '/received') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const rows = uploads.get(id) ?? []; rows.push(Buffer.concat(chunks)); uploads.set(id, rows);
      res.writeHead(204); res.end(); return;
    }
    if (url.pathname === '/uploaded-count') { res.end(String((uploads.get(id) ?? []).length)); return; }
    visits.push(req.url);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><button id="save">Save</button><button id="export">Export</button><button id="prepare">Prepare</button><button id="choose">Import</button><input id="file" type="file"><p id="status">Ready</p><section id="items"></section><script>
      const mode = new URLSearchParams(location.search).get('mode');
      const caseId = new URLSearchParams(location.search).get('case');
      const initial = ${JSON.stringify(records)}, message = ${JSON.stringify(message)}, privateText = ${JSON.stringify(sentinel)};
      const draw = () => document.querySelector('#items').innerHTML = JSON.parse(localStorage.getItem('saved') || '[]').map(() => '<p class="item">Record</p>').join('');
      if (localStorage.getItem('saved') && mode === 'reload-loss') { const a=JSON.parse(localStorage.getItem('saved')); delete a[0].last; localStorage.setItem('saved',JSON.stringify(a)); }
      if (location.pathname === '/repair') localStorage.setItem('saved',JSON.stringify(initial));
      draw();
      document.querySelector('#save').onclick = () => { localStorage.setItem('saved',JSON.stringify(initial)); draw(); if(mode==='source-setup')alert(message); };
      document.querySelector('#prepare').onclick = () => alert(message);
      document.querySelector('#export').onclick = () => {
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([${JSON.stringify(bytes.toString('utf8'))}],{type:'application/json'})); a.download='private-${sentinel}.json'; a.click();
        if(mode==='source-export')alert(message);
        if(mode==='source-during-target') { const timer=setInterval(async()=>{ if(Number(await(await fetch('/uploaded-count?case='+caseId)).text())){ clearInterval(timer); alert(message); } },20); }
      };
      const importFile = async event => {
        const raw=await event.target.files[0].arrayBuffer();
        await fetch('/received?case='+caseId,{method:'POST',body:raw});
        if (['async','chooser','source-during-target'].includes(mode)) await new Promise(resolve=>setTimeout(resolve,100));
        const payload=JSON.parse(new TextDecoder().decode(raw)).saved;
        if (['field-loss','loss-before-navigation'].includes(mode)) delete payload[0].hidden;
        if (mode==='id-change') payload[0].id='changed-id';
        if (mode==='timestamp-change') payload[0].due++;
        if (mode!=='alert-only') { localStorage.setItem('saved',JSON.stringify(payload)); draw(); }
        document.querySelector('#status').textContent='Restored';
        if (mode==='missing') return;
        if (mode==='wrong') { alert(privateText); return; }
        if (mode==='case-change') { alert(message.toUpperCase()); return; }
        if (mode==='space-change') { alert(message+' '); return; }
        if (mode==='confirm') { confirm(privateText); return; }
        if (mode==='prompt') { prompt(privateText); return; }
        alert(message);
        if (mode==='double') alert(message);
        if (mode==='late-double') setTimeout(()=>alert(message),130);
        if (mode==='after-dismiss-loss') { delete payload[0].totalMs; localStorage.setItem('saved',JSON.stringify(payload)); }
      };
      document.querySelector('#file').onchange=importFile;
      document.querySelector('#choose').onclick=()=>{
        if(mode==='chooser-before-alert')alert(message);
        const input=document.createElement('input');input.type='file';input.onchange=importFile;input.click();
      };
      if (mode==='target-load') alert(message);
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, uploads, visits, close: () => new Promise(resolve => server.close(resolve)) };
}

async function replay(out) {
  const file = join(out, 'repro.spec.mjs'), before = await readFile(file);
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(out, 'playwright.config.mjs'), '--reporter=json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
    const timer = setTimeout(() => child.kill('SIGTERM'), 25000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
  assert.deepEqual(await readFile(file), before);
  const report = JSON.parse(result.stdout);
  const value = report.suites.flatMap(s => s.specs ?? []).flatMap(s => s.tests ?? []).flatMap(s => s.results ?? []).flatMap(r => r.attachments ?? []).find(a => a.name === 'state-diff');
  assert.ok(value?.body, result.stdout + result.stderr);
  return { ...result, result: JSON.parse(Buffer.from(value.body, 'base64').toString('utf8')) };
}

test('completion observation window ends before target reload can cancel delayed alerts', { timeout: 15000 }, async t => {
  const app = await fixture();
  t.after(() => app.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  let contexts = 0, deliveredAt, reloadedAt;
  const wrapped = { newContext: async options => {
    const context = await browser.newContext(options);
    const targetContext = ++contexts === 2;
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      if (targetContext) {
        const locator = page.locator.bind(page), reload = page.reload.bind(page);
        page.locator = (selector, ...args) => {
          const target = locator(selector, ...args);
          if (selector === '#file') {
            const deliver = target.setInputFiles.bind(target);
            target.setInputFiles = async (...files) => { deliveredAt = performance.now(); return deliver(...files); };
          }
          return target;
        };
        page.reload = async (...args) => { reloadedAt = performance.now(); return reload(...args); };
      }
      return page;
    };
    return context;
  } };
  const c = structuredClone(base);
  c.baseURL = app.baseURL;
  c.path = '/?mode=source&case=observation-window';
  c.backupRoundtrip.restore.path = '/?mode=sync&case=observation-window';
  c.stabilityMs = 0;
  const r = await executeBackupRoundtrip(wrapped, validateContract(c));
  assert.equal(r.status, 'pass', JSON.stringify(r));
  assert.equal(contexts, 2);
  assert.ok(Number.isFinite(deliveredAt) && Number.isFinite(reloadedAt));
  const elapsed = reloadedAt - deliveredAt;
  assert.ok(elapsed >= c.timeoutMs - 50, `target reloaded after ${elapsed}ms, before the ${c.timeoutMs}ms completion observation window`);
  assert.ok(r.comparisons.restoration.matched && r.comparisons.reload.matched);
});

test('exact completion alerts retain complete data, phase boundaries and portable metadata-only verdicts', { timeout: 180000 }, async t => {
  const app = await fixture(), temp = await mkdtemp(join(root, '.test-backup-alert-'));
  t.after(async () => { await app.close(); await rm(temp, { recursive: true, force: true }); });
  let serial = 0;
  const results = new Map();
  function contract(mode, change = () => {}) {
    const c = structuredClone(base), id = String(++serial);
    c.baseURL = app.baseURL;
    c.path = `/?mode=${mode.startsWith('source-') ? mode : 'source'}&case=${id}`;
    c.backupRoundtrip.restore.path = `/?mode=${mode}&case=${id}`;
    if (mode.startsWith('chooser')) { delete c.backupRoundtrip.restore.target; c.backupRoundtrip.restore.fileChooser = { css: '#choose' }; }
    if (mode === 'target-prepare') c.backupRoundtrip.restore.prepare = [{ action: 'click', target: { css: '#prepare' } }];
    if (mode === 'loss-before-navigation') c.backupRoundtrip.restore.after = [{ action: 'goto', path: `/repair?case=${id}` }];
    change(c);
    return { c: validateContract(c), id };
  }
  async function run(mode, change) {
    const { c, id } = contract(mode, change);
    const report = await runContract(c, { out: join(temp, `${serial}-${mode}`) });
    const r = report.results[0]; results.set(mode, { report, r, id, c });
    assert.equal(r.before, null); assert.equal(r.after, null); assert.deepEqual(r.differences, []);
    assert.equal(r.capture, 'metadata-only');
    for (const file of await readdir(report.out)) {
      assert.ok(!/\.(png|zip|webm)$/.test(file));
      assert.equal((await readFile(join(report.out, file), 'utf8')).includes(sentinel), false, file);
    }
    for (const name of ['report.json', 'index.html']) assert.equal((await readFile(join(report.out, name), 'utf8')).includes(message), false, name);
    return r;
  }
  await t.test('sync, async and native chooser import upload original bytes and dismiss exactly one alert', async () => {
    for (const mode of ['sync', 'async', 'chooser']) {
      const r = await run(mode);
      assert.equal(r.status, 'pass', JSON.stringify(r));
      assert.deepEqual(r.importCompletion, { required: true, observed: true, matchedCount: 1, dismissedCount: 1 });
      assert.equal(r.importConfirmation, undefined);
      assert.ok(r.comparisons.export.matched && r.comparisons.sourceAfterExport.matched && r.comparisons.restoration.matched && r.comparisons.reload.matched);
      assert.equal(r.uploadedOriginalBytes, true);
      assert.deepEqual(app.uploads.get(results.get(mode).id), [bytes]);
    }
  });
  await t.test('an alert is not proof of full restoration or reload preservation', async () => {
    for (const mode of ['alert-only', 'field-loss', 'id-change', 'timestamp-change', 'after-dismiss-loss', 'reload-loss', 'loss-before-navigation']) {
      const r = await run(mode);
      assert.equal(r.status, 'fail', JSON.stringify(r));
      assert.equal(r.importCompletion.observed, true);
      if (mode === 'reload-loss') assert.equal(r.error, 'STATE_CHANGED_AFTER_RELOAD');
      if (mode === 'loss-before-navigation') {
        assert.equal(r.error, 'RESTORED_STATE_DIFFERS_BEFORE_NAVIGATION');
        assert.equal(app.visits.some(p => p === `/repair?case=${results.get(mode).id}`), false);
      }
    }
  });
  await t.test('wrong, missing, repeated, early, source and undeclared dialogs never pass', async () => {
    for (const mode of ['wrong', 'case-change', 'space-change', 'confirm', 'prompt', 'double', 'late-double', 'target-load', 'target-prepare', 'chooser-before-alert', 'source-setup', 'source-export', 'source-during-target']) {
      const r = await run(mode);
      assert.equal(r.status, 'inconclusive', `${mode}: ${JSON.stringify(r)}`);
      assert.equal(r.error, 'UNEXPECTED_NATIVE_DIALOG');
      if (['target-load', 'target-prepare', 'chooser-before-alert', 'source-setup', 'source-export'].includes(mode)) assert.equal((app.uploads.get(results.get(mode).id) ?? []).length, 0, mode);
    }
    const missing = await run('missing');
    assert.equal(missing.status, 'fail'); assert.equal(missing.error, 'IMPORT_SUCCESS_NOT_OBSERVED');
    assert.deepEqual(missing.importCompletion, { required: true, observed: false, matchedCount: 0, dismissedCount: 0 });
    const legacy = await run('legacy', c => c.backupRoundtrip.restore.success = { observe: { status: { source: 'text', target: { css: '#status' } } }, expected: { status: 'Restored' } });
    assert.equal(legacy.status, 'inconclusive'); assert.equal(legacy.error, 'UNEXPECTED_NATIVE_DIALOG');
  });
  await t.test('failed dismissal is sanitized and cannot turn the alert receipt into a pass', async () => {
    const browser = await chromium.launch();
    let closed = 0;
    const wrapped = { newContext: async options => {
      const context = await browser.newContext(options), newPage = context.newPage.bind(context), close = context.close.bind(context);
      context.close = async () => { try { await close(); } finally { closed++; } };
      context.newPage = async () => {
        const page = await newPage(), on = page.on.bind(page), off = page.off.bind(page), listeners = new Map();
        page.on = (event, listener) => {
          if (event !== 'dialog') return on(event, listener);
          const wrappedListener = dialog => listener({ type: () => dialog.type(), message: () => dialog.message(), accept: () => dialog.accept(), dismiss: async () => { await dialog.dismiss(); throw new Error(sentinel); } });
          listeners.set(listener, wrappedListener); return on(event, wrappedListener);
        };
        page.off = (event, listener) => off(event, listeners.get(listener) ?? listener);
        return page;
      };
      return context;
    } };
    try {
      const { c } = contract('sync');
      const r = await executeBackupRoundtrip(wrapped, c);
      assert.equal(r.status, 'inconclusive'); assert.equal(r.error, 'UNEXPECTED_NATIVE_DIALOG');
      assert.equal(r.importCompletion.observed, true); assert.equal(r.importCompletion.dismissedCount, 0);
      assert.equal(JSON.stringify(r).includes(sentinel), false); assert.equal(closed, 2);
    } finally { await browser.close(); }
  });
  await t.test('standalone tests reproduce pass/fail/inconclusive without captured text or changed specs', async () => {
    for (const mode of ['async', 'chooser', 'field-loss', 'reload-loss', 'wrong', 'double', 'late-double', 'missing']) {
      const { report, r } = results.get(mode), value = await replay(report.out);
      assert.equal(value.code, r.status === 'pass' ? 0 : 1, value.stdout + value.stderr);
      for (const key of ['status', 'phase', 'error', 'importCompletion', 'comparisons']) assert.deepEqual(value.result[key], r[key], `${mode}/${key}`);
      assert.equal((value.stdout + value.stderr).includes(sentinel), false);
      assert.equal(JSON.stringify(value.result).includes(message), false);
    }
  });
});
