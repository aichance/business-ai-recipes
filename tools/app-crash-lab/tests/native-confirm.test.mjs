import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runContract } from '../lib/runner.mjs';
import { validateContract } from '../lib/contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const confirmation = { message: 'Replace this synthetic note?', accept: true };
const contract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Confirm before invalid import',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 1000, stabilityMs: 150,
  checks: ['rejected-update'],
  setup: [{ action: 'fill', target: { label: 'Note' }, value: 'Synthetic note' }, { action: 'click', target: { role: 'button', name: 'Save' }, save: true }],
  observe: { saved: { source: 'localStorage', key: 'note' } },
  expected: { saved: 'Synthetic note' },
  rejectedUpdate: {
    steps: [{ action: 'setFile', target: { css: '#import' }, file: { name: 'invalid.json', mimeType: 'application/json', text: '{' }, confirm: confirmation }],
    observe: { error: { source: 'text', target: { css: '#error' } } },
    expected: { error: 'Invalid note' },
  },
};

test('confirmation is explicit, exact and restricted to one invalid file import', () => {
  assert.deepEqual(validateContract(contract).rejectedUpdate.steps[0].confirm, confirmation);
  for (const edit of [
    c => c.setup[1].confirm = confirmation,
    c => c.rejectedUpdate.steps[0].confirm.accept = false,
    c => delete c.rejectedUpdate.steps[0].confirm.accept,
    c => c.rejectedUpdate.steps[0].confirm.message = '',
    c => c.rejectedUpdate.steps[0].confirm.match = 'substring',
    c => c.rejectedUpdate.steps[0] = { action: 'request', method: 'PUT', path: '/', expectStatus: 422, confirm: confirmation },
    c => c.rejectedUpdate.steps[0] = { action: 'click', target: { css: '#save' }, confirm: confirmation },
    c => c.rejectedUpdate.steps.unshift({ action: 'click', target: { css: '#earlier' } }),
    c => { delete c.rejectedUpdate.observe; delete c.rejectedUpdate.expected; },
  ]) {
    const invalid = structuredClone(contract); edit(invalid);
    assert.throws(() => validateContract(invalid));
  }
});

test('confirmation does not replace rejection or saved-state checks', { timeout: 90000 }, async t => {
  // Synthetic controls: modes deliberately remove a gate, lie about rejection or lose data.
  const html = `<!doctype html><meta charset="utf-8"><label>Note<input id="note"></label><button>Save</button><input type="file" id="import"><output id="error"></output><script>
    const mode = new URLSearchParams(location.search).get('mode');
    const message = 'Replace this synthetic note?';
    document.querySelector('button').onclick = () => {
      const value = document.querySelector('#note').value;
      if (value) {
        if (mode === 'prior') confirm(message);
        localStorage.setItem('note', value);
        return;
      }
    };
    document.querySelector('#import').onchange = () => {
      const reader = new FileReader();
      reader.onload = () => {
      const update = () => {
        if (mode !== 'missing' && !confirm(mode === 'wrong' ? 'A different operation?' : message)) return;
        if (mode === 'twice' && !confirm(message)) return;
        if (mode === 'no-rejection') return;
        if (mode === 'alert') alert('Invalid note');
        else document.querySelector('#error').textContent = 'Invalid note';
        if (mode === 'corrupt') localStorage.setItem('note', '');
        if (mode === 'late') setTimeout(() => confirm(message), 50);
      };
      if (mode === 'delayed') setTimeout(update, 50); else update();
      };
      reader.readAsText(document.querySelector('#import').files[0]);
    };
  </script>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const temp = await mkdtemp(join(root, '.crash-lab-confirm-'));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); });
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const run = (mode, changes = {}) => runContract({ ...contract, baseURL, path: '/?mode=' + mode, ...changes }, { out: join(temp, mode) });
  let fixed, corrupt;
  await t.test('one exact confirm allows a real DOM rejection; a delayed confirm also works', async () => {
    fixed = await run('fixed');
    assert.equal(fixed.results[0].status, 'pass');
    assert.equal(fixed.results[0].rejection.confirmed, true);
    assert.deepEqual(fixed.results[0].confirmations, [{ type: 'confirm', message: confirmation.message }]);
    assert.equal((await run('delayed')).results[0].status, 'pass');
  });
  await t.test('a correct confirmation and rejection still fail if saved data is lost', async () => {
    corrupt = await run('corrupt');
    assert.equal(corrupt.results[0].status, 'fail');
    assert.equal(corrupt.results[0].rejection.confirmed, true);
    assert.deepEqual(corrupt.results[0].differences, [{ path: '$["saved"]', before: 'Synthetic note', after: '', change: 'changed' }]);
  });
  await t.test('missing confirmation or missing rejection cannot pass', async () => {
    for (const mode of ['missing', 'no-rejection']) assert.equal((await run(mode)).results[0].status, 'fail');
    const rejectedUpdate = structuredClone(contract.rejectedUpdate);
    delete rejectedUpdate.steps[0].confirm;
    assert.equal((await run('undeclared', { rejectedUpdate })).results[0].status, 'fail');
  });
  await t.test('wrong, repeated, setup and late confirmations are dismissed and inconclusive', async () => {
    for (const mode of ['wrong', 'twice', 'prior', 'late']) {
      const result = (await run(mode)).results[0];
      assert.equal(result.status, 'inconclusive', JSON.stringify(result));
      assert.equal(result.confirmations?.length ?? 0, ['twice', 'late'].includes(mode) ? 1 : 0);
    }
  });
  await t.test('an expected alert remains a separate rejection signal after confirmation', async () => {
    const rejectedUpdate = structuredClone(contract.rejectedUpdate);
    delete rejectedUpdate.observe; delete rejectedUpdate.expected;
    rejectedUpdate.dialog = { type: 'alert', message: 'Invalid note' };
    const result = (await run('alert', { rejectedUpdate })).results[0];
    assert.equal(result.status, 'pass', JSON.stringify(result));
    assert.deepEqual(result.rejection.actual, [rejectedUpdate.dialog]);
    assert.deepEqual(result.dialogs.map(d => d.type), ['confirm', 'alert']);
  });
  await t.test('standalone exports reproduce the same pass and deliberate data-loss failure', async () => {
    for (const [report, expectedCode] of [[fixed, 0], [corrupt, 1]]) {
      const result = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(report.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
        child.on('error', reject); child.on('close', code => done({ code, output }));
      });
      assert.equal(result.code, expectedCode, result.output);
      assert.match(result.output, expectedCode === 0 ? /1 passed/ : /1 failed/);
    }
  });
});
