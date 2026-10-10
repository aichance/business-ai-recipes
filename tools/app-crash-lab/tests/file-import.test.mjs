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
const document = { title: 'Synthetic melody — 合成曲', notes: [60, 64], bpm: 145 };
const contract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Import preserves saved document',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 600, stabilityMs: 100,
  setup: [{ action: 'setFile', target: { css: '#file' }, save: true, file: { name: '合成.json', mimeType: 'application/json', text: JSON.stringify(document) } }],
  observe: {
    saved: { source: 'localStorage', keyFrom: 'current', keyPrefix: 'doc.', parse: 'json' },
    savedTitle: { source: 'localStorage', keyFrom: 'current', keyPrefix: 'doc.', parse: 'json', jsonPath: ['title'] },
    pointer: { source: 'localStorage', key: 'current' },
  },
  expected: { savedTitle: document.title },
  rejectedUpdate: {
    steps: [{ action: 'setFile', target: { css: '#file' }, file: { name: 'broken.json', mimeType: 'application/json', text: '{' } }],
    observe: { status: { source: 'text', target: { css: '#status' } } }, expected: { status: 'Rejected JSON' },
  },
};

async function startFixture() {
  // Independent deliberately faulty document importer, not a modified third-party app.
  const html = `<!doctype html><meta charset="utf-8"><input id="file" type="file"><p id="status">Ready</p><script>
    const mode = new URLSearchParams(location.search).get('mode');
    const current = () => localStorage.getItem('current');
    if (mode === 'broken-reload' && current()) {
      const doc = JSON.parse(localStorage.getItem('doc.' + current()));
      doc.notes = []; localStorage.setItem('doc.' + current(), JSON.stringify(doc));
    }
    document.querySelector('#file').onchange = async event => {
      try {
        const doc = JSON.parse(await event.target.files[0].text());
        if (mode === 'never-save') return;
        const save = () => {
          const id = Math.random().toString(36).slice(2);
          localStorage.setItem('doc.' + id, JSON.stringify(doc)); localStorage.setItem('current', id);
          document.querySelector('#status').textContent = 'Saved';
        };
        if (mode === 'gated-save') window.commitImport = save;
        else setTimeout(save, 120);
      } catch {
        if (mode === 'broken-reject') {
          const doc = JSON.parse(localStorage.getItem('doc.' + current()));
          doc.notes = []; localStorage.setItem('doc.' + current(), JSON.stringify(doc));
        }
        if (mode === 'redirect-pointer') {
          localStorage.setItem('doc.other', localStorage.getItem('doc.' + current()));
          localStorage.setItem('current', 'other');
        }
        if (mode === 'missing-pointer') localStorage.removeItem('current');
        document.querySelector('#status').textContent = 'Rejected JSON';
      }
    };
  </script>`;
  const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('file imports, dynamic storage keys and portable failure evidence', { timeout: 180000 }, async t => {
  const app = await startFixture();
  const temp = await mkdtemp(join(root, '.crash-lab-file-import-'));
  t.after(async () => { await app.close(); await rm(temp, { recursive: true, force: true }); });
  const run = (name, changes = {}) => runContract({ ...contract, baseURL: app.baseURL, ...changes }, { out: join(temp, name) });
  let fixed, broken;
  await t.test('a save completing between browser reads cannot create a mixed storage baseline', async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await confineContext(context, app.baseURL);
      const page = await context.newPage();
      const evaluate = page.evaluate.bind(page);
      let firstRead = true;
      // Complete the queued save only after the first observation has returned.
      // This makes the CI timing boundary deterministic without changing verdicts.
      page.evaluate = async (...args) => {
        const value = await evaluate(...args);
        if (firstRead) {
          firstRead = false;
          await page.waitForFunction(() => typeof window.commitImport === 'function');
          await evaluate(() => window.commitImport());
        }
        return value;
      };
      const result = await executeCheck(page, validateContract({ ...contract, baseURL: app.baseURL, path: '/?mode=gated-save', timeoutMs: 3000 }), 'reload');
      assert.equal(result.status, 'pass', JSON.stringify(result));
      assert.deepEqual(result.before.saved, document);
      assert.deepEqual(result.after.saved, document);
    } finally { await context.close(); await browser.close(); }
  });
  await t.test('waits for delayed persistence, then both patterns preserve the full JSON', async () => {
    fixed = await run('fixed');
    assert.deepEqual(fixed.results.map(r => r.status), ['pass', 'pass']);
    for (const r of fixed.results) { assert.deepEqual(r.before.saved, document); assert.deepEqual(r.after.saved, document); }
  });
  await t.test('different seeded failures break the intended checks and preserve changed values', async () => {
    broken = await run('broken-reload', { path: '/?mode=broken-reload' });
    const rejected = await run('broken-reject', { path: '/?mode=broken-reject' });
    assert.deepEqual(broken.results.map(r => r.status), ['fail', 'pass']);
    assert.deepEqual(rejected.results.map(r => r.status), ['pass', 'fail']);
    assert.ok(rejected.results[1].differences.some(d => d.path.includes('notes')));
    assert.deepEqual(rejected.results[1].after.saved.notes, []);
  });
  await t.test('observed pointer identity catches a redirected key even with identical content', async () => {
    const r = await run('redirect', { path: '/?mode=redirect-pointer' });
    assert.equal(r.results[1].status, 'fail');
    assert.deepEqual(r.results[1].after.saved, r.results[1].before.saved);
    assert.ok(r.results[1].differences.some(d => d.path.includes('pointer') && d.after === 'other'));
  });
  await t.test('missing pointer is null and cannot reuse a stale resolved key', async () => {
    const c = structuredClone(contract); delete c.observe.savedTitle; c.expected = { saved: document };
    const r = await run('missing', { ...c, baseURL: app.baseURL, path: '/?mode=missing-pointer' });
    assert.equal(r.results[1].status, 'fail');
    assert.equal(r.results[1].after.saved, null);
  });
  await t.test('unavailable expected JSON path times out inconclusive, never passes', async () => {
    const r = await run('never-save', { path: '/?mode=never-save', checks: ['reload'], timeoutMs: 200 });
    assert.equal(r.results[0].status, 'inconclusive');
    assert.equal(r.results[0].phase, 'baseline');
    assert.match(r.results[0].error, /JSON path.*missing/);
    assert.equal(r.exitCode, 2);
  });
  await t.test('generated specs independently replay literal uploads and pointer reads', async () => {
    for (const [r, expectedCode] of [[fixed, 0], [broken, 1]]) {
      assert.ok(!(await readFile(join(r.out, 'repro.spec.mjs'), 'utf8')).includes("from './lib"));
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(r.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
        child.on('error', reject); child.on('close', code => resolve({ code, output }));
      });
      assert.equal(result.code, expectedCode, result.output);
    }
  });
});
