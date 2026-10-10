import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runContract } from '../lib/runner.mjs';
import { startDemo } from '../demo/server.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const notes = JSON.parse(await readFile(new URL('../examples/notes.json', import.meta.url)));
const inventory = JSON.parse(await readFile(new URL('../examples/inventory.json', import.meta.url)));
const states = r => r.results.map(c => c.status);

test('browser acceptance: real broken/fixed pairs, unusable paths, API app, portable reproductions', { timeout: 180000 }, async t => {
  const app = await startDemo();
  // Keep generated specs below this package so Node resolves the local Playwright dependency.
  const temp = await mkdtemp(join(root, '.crash-lab-acceptance-'));
  t.after(async () => { await app.close(); await rm(temp, { recursive: true, force: true }); });
  const run = (name, c) => runContract({ ...c, baseURL: app.baseURL, timeoutMs: 300 }, { out: join(temp, name) });
  let fixed, broken;
  await t.test('same workflow: fixed passes both, separate seeded defects fail the relevant check', async () => {
    fixed = await run('fixed', notes);
    broken = await run('broken-reload', { ...notes, path: '/?mode=broken-reload' });
    const corrupt = await run('broken-reject', { ...notes, path: '/?mode=broken-reject' });
    assert.deepEqual(states(fixed), ['pass', 'pass']);
    assert.deepEqual(states(broken), ['fail', 'pass']);
    assert.deepEqual(states(corrupt), ['pass', 'fail']);
    assert.equal(broken.results[0].differences[0].before, 'Buy coffee');
    assert.equal(broken.results[0].differences[0].after, '');
    assert.equal(corrupt.results[1].rejection.confirmed, true);
    for (const result of [fixed, broken, corrupt]) for (const c of result.results) assert.ok((await stat(join(result.out, `${c.check}.trace.zip`))).size > 0);
  });
  await t.test('unusable selector and wrong known-good baseline are inconclusive, not passes or app bugs', async () => {
    const wrong = structuredClone(notes); wrong.setup[0].target = { label: 'Does not exist' };
    assert.deepEqual(states(await run('wrong-selector', wrong)), ['inconclusive', 'inconclusive']);
    assert.deepEqual(states(await run('wrong-baseline', { ...notes, expected: { savedNote: 'Different baseline' } })), ['inconclusive', 'inconclusive']);
  });
  await t.test('failure to reject is not a preservation pass', async () => {
    const result = await run('not-rejected', { ...notes, path: '/?mode=accept-invalid' });
    assert.equal(result.results[1].status, 'fail');
    assert.equal(result.results[1].rejection.confirmed, false);
  });
  await t.test('brief stability observation catches a delayed rejected write', async () => {
    const result = await run('delayed-rejection', { ...notes, path: '/?mode=delayed-reject' });
    assert.deepEqual(states(result), ['pass', 'fail']);
  });
  await t.test('a second app uses the same runner with HTTP state and explicit server reset', async () => {
    const result = await run('inventory-fixed', inventory);
    assert.deepEqual(states(result), ['pass', 'pass']);
    const c = structuredClone(inventory); c.rejectedUpdate.steps[0].path += '?mode=broken-reject';
    const bad = await run('inventory-broken', c);
    assert.deepEqual(states(bad), ['pass', 'fail']);
    assert.ok(bad.results[1].differences.some(d => d.path.includes('quantity') && d.after === -1));
    c.rejectedUpdate.steps[0].path = '/api/stock?mode=server-error';
    const error = await run('inventory-server-error', c);
    assert.equal(error.results[1].status, 'inconclusive');
  });
  await t.test('existing output is not overwritten', async () => {
    await assert.rejects(runContract({ ...notes, baseURL: app.baseURL }, { out: fixed.out }), /EEXIST/);
    const existing = join(temp, 'existing');
    await mkdir(existing);
    await writeFile(join(existing, 'report.json'), 'keep me');
    await assert.rejects(runContract({ ...notes, baseURL: app.baseURL }, { out: existing }), /EEXIST/);
    assert.equal(await readFile(join(existing, 'report.json'), 'utf8'), 'keep me');
  });
  await t.test('an HTTP 200 validation error needs an explicit new semantic rejection signal', async () => {
    const c = structuredClone(inventory);
    c.rejectedUpdate.steps[0].path = '/api/stock?mode=logical-reject';
    c.rejectedUpdate.steps[0].expectStatus = 200;
    c.rejectedUpdate.observe = { rejected: { source: 'response', url: '/api/validation', field: 'json', jsonPath: ['rejected'] } };
    c.rejectedUpdate.expected = { rejected: true };
    const result = await run('inventory-semantic-rejection', c);
    assert.deepEqual(states(result), ['pass', 'pass']);
    assert.equal(result.results[1].rejection.confirmed, true);
    delete c.rejectedUpdate.observe; delete c.rejectedUpdate.expected;
    await assert.rejects(run('inventory-200-alone', c), /rejection|4xx/i);
  });
  await t.test('demo CLI refuses an existing root before replacing its index or manifest', async () => {
    const out = join(temp, 'existing-demo-root');
    await mkdir(out);
    await writeFile(join(out, 'index.html'), 'keep index');
    await writeFile(join(out, 'demo.json'), 'keep manifest');
    const result = await new Promise((done, reject) => {
      const child = spawn(process.execPath, [join(root, 'cli.mjs'), 'demo', '--out', out], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
      child.on('error', reject); child.on('close', code => done({ code, output }));
    });
    assert.equal(result.code, 2, result.output);
    assert.match(result.output, /EEXIST/);
    assert.equal(await readFile(join(out, 'index.html'), 'utf8'), 'keep index');
    assert.equal(await readFile(join(out, 'demo.json'), 'utf8'), 'keep manifest');
    await assert.rejects(stat(join(out, 'fixed')), /ENOENT/);
  });
  await t.test('standalone generated specs reproduce both verdicts without importing the runner', async () => {
    for (const [report, expectedCode] of [[fixed, 0], [broken, 1]]) {
      const source = await readFile(join(report.out, 'repro.spec.mjs'), 'utf8');
      assert.ok(!source.includes("from './lib"));
      const code = await new Promise((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(report.out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
        child.on('error', reject); child.on('close', code2 => done({ code: code2, output }));
      });
      assert.equal(code.code, expectedCode, code.output);
      assert.ok(code.output.includes('2 passed') || code.output.includes('1 failed'), code.output);
    }
  });
});
