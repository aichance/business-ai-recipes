import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { runContract } from '../lib/runner.mjs';
import { validateContract } from '../lib/contract.mjs';
import { executeCheck, confineContext } from '../lib/protocol.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const contract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Native alert rejection',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 5000, stabilityMs: 200,
  setup: [{ action: 'fill', target: { label: 'Note' }, value: 'Synthetic note' }, { action: 'click', target: { role: 'button', name: 'Save' }, save: true }],
  observe: { saved: { source: 'localStorage', key: 'note' } },
  expected: { saved: 'Synthetic note' },
  rejectedUpdate: {
    steps: [{ action: 'fill', target: { label: 'Note' }, value: '' }, { action: 'click', target: { role: 'button', name: 'Save' } }],
    dialog: { type: 'alert', message: 'Note required — 入力してください' },
  },
};

test('native alert contract rejects ambiguous and unsupported signals', () => {
  assert.deepEqual(validateContract(contract).rejectedUpdate.dialog, contract.rejectedUpdate.dialog);
  for (const edit of [
    c => c.rejectedUpdate.dialog.type = 'confirm',
    c => c.rejectedUpdate.dialog.message = '',
    c => c.rejectedUpdate.dialog.message = 1,
    c => c.rejectedUpdate.dialog.match = 'substring',
    c => c.rejectedUpdate.expected = { message: 'error' },
    c => c.rejectedUpdate.observe = { message: { source: 'count', target: { css: '.error' } } },
    c => c.rejectedUpdate.steps.push({ action: 'request', method: 'PUT', path: '/note', expectStatus: 422 }),
  ]) {
    const invalid = structuredClone(contract); edit(invalid);
    assert.throws(() => validateContract(invalid));
  }
});

test('native rejection dialogs preserve saved data and export reproducible verdicts', { timeout: 120000 }, async t => {
  // Synthetic independent fixture. These modes are deliberately introduced defects.
  const html = `<!doctype html><meta charset="utf-8"><label>Note<input id="note"></label><button>Save</button><button id="later">Later alert</button><script>
    const mode = new URLSearchParams(location.search).get('mode');
    const message = 'Note required — 入力してください';
    document.querySelector('#later').onclick = () => alert(message);
    document.querySelector('button').onclick = () => {
      const value = document.querySelector('#note').value;
      if (value) {
        localStorage.setItem('note', value);
        if (mode === 'prior') alert(message);
        return;
      }
      if (mode === 'missing') return;
      if (mode === 'confirm') { confirm(message); return; }
      if (mode === 'wrong') { alert('Different problem'); return; }
      const reject = () => {
        alert(message);
        if (mode === 'corrupt') localStorage.setItem('note', '');
        if (mode === 'twice') setTimeout(() => alert(message), 80);
      };
      if (mode === 'delayed') setTimeout(reject, 80); else reject();
    };
  </script>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const temp = await mkdtemp(join(root, '.crash-lab-dialog-'));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const run = (name, changes = {}) => runContract({ ...contract, baseURL, path: `/?mode=${name}`, ...changes }, { out: join(temp, name) });
  let fixed, corrupt;
  await t.test('captures and dismisses the exact alert before comparing saved values', async () => {
    fixed = await run('fixed');
    assert.deepEqual(fixed.results.map(r => r.status), ['pass', 'pass']);
    assert.deepEqual(fixed.results[1].rejection.actual, [contract.rejectedUpdate.dialog]);
    const delayed = await run('delayed');
    assert.equal(delayed.results[1].status, 'pass');
  });
  await t.test('a confirmed rejection still fails when the post-dismissal write corrupts storage', async () => {
    corrupt = await run('corrupt');
    assert.deepEqual(corrupt.results.map(r => r.status), ['pass', 'fail']);
    assert.equal(corrupt.results[1].rejection.confirmed, true);
    assert.deepEqual(corrupt.results[1].differences, [{ path: '$["saved"]', before: 'Synthetic note', after: '', change: 'changed' }]);
  });
  await t.test('missing, wrong and repeated dialogs are not rejection passes', async () => {
    for (const mode of ['missing', 'wrong', 'twice']) {
      const result = await run(mode, mode === 'missing' ? { timeoutMs: 1000 } : {});
      assert.equal(result.results[1].status, 'fail', JSON.stringify(result));
      assert.equal(result.results[1].rejection.confirmed, false);
    }
  });
  await t.test('an earlier matching alert, unsupported dialog or failing action is inconclusive', async () => {
    for (const mode of ['prior', 'confirm']) {
      const result = await run(mode);
      assert.equal(result.results[1].status, 'inconclusive', JSON.stringify(result));
    }
    const invalid = structuredClone(contract.rejectedUpdate);
    invalid.steps.push({ action: 'click', target: { role: 'button', name: 'Missing control' } });
    const result = await run('action-failure', { rejectedUpdate: invalid, timeoutMs: 1000 });
    assert.equal(result.results[1].status, 'inconclusive');
  });
  await t.test('zero stability has a bounded observation window and removes its listener', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    try {
      await confineContext(context, baseURL);
      const page = await context.newPage();
      const result = await executeCheck(page, validateContract({ ...contract, baseURL, stabilityMs: 0 }), 'rejected-update');
      assert.equal(result.status, 'pass');
      assert.equal(result.dialogs.length, 1);
      assert.equal(page.listenerCount('dialog'), 0);
      // Trigger only after the check has returned: this event is outside its window.
      // Playwright's default dismissal must work after our listener is removed.
      await page.getByRole('button', { name: 'Later alert', exact: true }).click();
      assert.equal(result.dialogs.length, 1);
    } finally { await context.close(); await browser.close(); }
  });
  await t.test('generated standalone tests reproduce both the pass and corruption failure', async () => {
    for (const [report, expectedCode] of [[fixed, 0], [corrupt, 1]]) {
      assert.ok(!(await readFile(join(report.out, 'repro.spec.mjs'), 'utf8')).includes("from './lib"));
      const result = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(report.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
        child.on('error', reject); child.on('close', code => done({ code, output }));
      });
      assert.equal(result.code, expectedCode, result.output);
      assert.match(result.output, expectedCode === 0 ? /2 passed/ : /1 failed/);
    }
  });
});
