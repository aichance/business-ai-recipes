import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateContract } from '../lib/contract.mjs';
import { runContract } from '../lib/runner.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const storage = jsonPath => ({ source: 'localStorage', key: 'draft', parse: 'json', jsonPath });
const fill = value => ({ action: 'fill', target: { label: 'Title' }, value });
const save = () => ({ action: 'click', target: { role: 'button', name: 'Save title' }, save: true });
function contract(baseURL = 'http://127.0.0.1:9999', mode = 'fixed') {
  return {
    schemaVersion: 1, pack: 'state-preservation@1', name: `Shared tab ${mode}`, baseURL,
    path: `/?mode=${mode}`, timeoutMs: 1200, stabilityMs: 250,
    reset: [fill('Persisted initial sentinel'), save()],
    setup: [fill('Primary saved title'), save()],
    observe: { tree: storage(['tree']), persistedTitle: storage(['tree', 'title']) },
    expected: { persistedTitle: 'Primary saved title' },
    afterReload: [{ action: 'expectVisible', target: { label: 'Title' } }],
    checks: ['stale-tab'],
    staleTab: {
      isolation: 'shared-localStorage', initialExpected: { persistedTitle: 'Persisted initial sentinel' },
      peer: {
        path: `/?mode=${mode}`,
        ready: [{ action: 'expectValue', target: { label: 'Title' }, value: 'Persisted initial sentinel' }],
        steps: [{ action: 'click', target: { role: 'button', name: 'Minimize' }, save: true }],
        commit: { observe: { toolbar: storage(['toolbar']) }, before: { toolbar: false }, expected: { toolbar: true } },
      },
    },
  };
}

test('stale-tab rejects missing evidence, overlapping state, mutable readiness and expanded execution', () => {
  assert.deepEqual(validateContract(contract()).checks, ['stale-tab']);
  for (const edit of [
    c => delete c.staleTab,
    c => c.checks = ['reload'],
    c => c.staleTab.initialExpected = c.expected,
    c => c.staleTab.initialExpected = {},
    c => c.staleTab.initialExpected = { typo: 'sentinel' },
    c => c.reset = [],
    c => delete c.reset[1].save,
    c => c.stabilityMs = 0,
    c => c.staleTab.isolation = 'separate-contexts',
    c => c.staleTab.peer.path = '/another-app',
    c => c.staleTab.peer.ready = [{ action: 'expectVisible', target: { label: 'Title' } }],
    c => c.staleTab.peer.ready[0] = fill('Persisted initial sentinel'),
    c => c.staleTab.peer.ready[0].save = true,
    c => c.staleTab.peer.steps = [],
    c => delete c.staleTab.peer.steps[0].save,
    c => c.staleTab.peer.steps[0] = { action: 'request', path: '/save', method: 'POST', expectStatus: 200, save: true },
    c => c.staleTab.peer.steps[0].action = 'evaluate',
    c => c.afterReload = [fill('repair')],
    c => c.observe.tree.source = 'sessionStorage',
    c => { delete c.observe.tree.key; c.observe.tree.keyFrom = 'active'; },
    c => c.observe.tree.key = 'another-record',
    c => delete c.observe.tree.parse,
    c => c.observe.tree.jsonPath = [],
    c => c.staleTab.peer.commit.observe.toolbar.jsonPath = ['tree', 'nested'],
    c => c.staleTab.peer.commit.before = { toolbar: true },
    c => c.staleTab.peer.commit.expected = {},
    c => c.staleTab.peer.commit.before.extra = false,
    c => c.staleTab.unboundedWait = true,
  ]) {
    const c = contract(); edit(c); assert.throws(() => validateContract(c));
  }
  // Numeric and string indices address the same JSON property.
  const alias = contract();
  alias.observe.tree.jsonPath = ['items', 0];
  alias.staleTab.peer.commit.observe.toolbar.jsonPath = ['items', '0', 'flag'];
  assert.throws(() => validateContract(alias), /overlap/);
});

// Deliberately authored fault variants, not claims about an independent app.
const html = `<!doctype html><label>Title<input id="title" value="SSR default"></label><button id="save">Save title</button><button id="minimize">Minimize</button>
<script>
const mode = new URL(location).searchParams.get('mode');
const title = document.getElementById('title'), save = document.getElementById('save'), minimize = document.getElementById('minimize');
if (mode === 'raw-read-audit') {
  const original = Storage.prototype.getItem; let readInJob = false;
  Storage.prototype.getItem = function(key) {
    if (this === localStorage && key === 'draft') {
      if (readInJob) fetch('/duplicate-read');
      else { readInJob = true; queueMicrotask(() => { readInJob = false; }); }
    }
    return original.call(this, key);
  };
}
const stored = JSON.parse(localStorage.getItem('draft') || 'null');
const seen = sessionStorage.getItem('seen'); sessionStorage.setItem('seen', 'yes');
let state = stored || { tree: { title: 'SSR default', nodes: [{ id: 'n1', attrs: { text: 'Keep 日本語 🐾', align: 'left' }, children: ['a', 'b'] }] }, toolbar: mode === 'already-committed' };
if (!(mode === 'peer-no-hydrate' && stored && !seen)) title.value = state.tree.title;
const persist = () => localStorage.setItem('draft', JSON.stringify(state));
save.onclick = () => { state.tree.title = title.value; if (mode !== 'primary-no-save' || title.value !== 'Primary saved title') persist(); };
if (['fixed', 'raw-read-audit'].includes(mode)) addEventListener('storage', event => { if (event.key === 'draft') { state = JSON.parse(event.newValue); title.value = state.tree.title; } });
minimize.onclick = () => {
  if (mode === 'unexpected-dialog') alert('Unexpected peer prompt');
  if (mode === 'no-save') return;
  if (['fixed', 'nested-loss', 'extra-node', 'changed-id', 'reload-loses-commit', 'delayed-loss', 'repair-after-loss', 'commit-loss-then-readiness-error'].includes(mode)) state = JSON.parse(localStorage.getItem('draft'));
  state.toolbar = true;
  if (mode === 'nested-loss') delete state.tree.nodes[0].attrs.align;
  if (mode === 'extra-node') state.tree.nodes.push({ id: 'extra', attrs: {} });
  if (mode === 'changed-id') state.tree.nodes[0].id = 'changed';
  persist();
  if (mode === 'loss-then-dialog') setTimeout(() => alert('Unexpected late peer prompt'), 120);
  if (mode === 'commit-loss-then-readiness-error') setTimeout(() => { state.toolbar = false; persist(); }, 110);
  if (['delayed-loss', 'repair-after-loss'].includes(mode)) {
    const good = JSON.stringify(state);
    setTimeout(() => { const broken = JSON.parse(good); broken.tree.nodes[0].children.reverse(); localStorage.setItem('draft', JSON.stringify(broken)); }, 110);
    if (mode === 'repair-after-loss') setTimeout(() => localStorage.setItem('draft', good), 210);
  }
};
if (mode === 'reload-loses-commit' && stored?.toolbar) setTimeout(() => { state.toolbar = false; persist(); }, 80);
</script>`;

test('stale-tab browser sequence, full-record diffs, completion gates and unchanged portable parity', { timeout: 180000 }, async t => {
  let duplicateReads = 0;
  const server = createServer((request, response) => {
    if (request.url === '/duplicate-read') { duplicateReads++; response.end('recorded'); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const temp = await mkdtemp(join(root, '.crash-lab-stale-tab-'));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true }); });
  const reports = {};
  const cases = [
    ['fixed', 'pass'], ['broken', 'fail'], ['nested-loss', 'fail'], ['extra-node', 'fail'],
    ['changed-id', 'fail'], ['delayed-loss', 'fail'], ['repair-after-loss', 'fail'],
    ['reload-loses-commit', 'fail'], ['no-save', 'inconclusive'], ['already-committed', 'inconclusive'],
    ['primary-no-save', 'inconclusive'], ['peer-no-hydrate', 'inconclusive'], ['unexpected-dialog', 'inconclusive'],
    ['wrong-baseline', 'inconclusive'], ['raw-read-audit', 'pass'],
    ['loss-then-readiness-error', 'fail'], ['loss-then-dialog', 'inconclusive'], ['commit-loss-then-readiness-error', 'fail'],
  ];
  for (const [mode, expected] of cases) await t.test(mode, async () => {
    const c = contract(baseURL, mode);
    if (mode === 'wrong-baseline') c.expected.persistedTitle = 'Not the saved value';
    if (mode.endsWith('readiness-error')) c.afterReload = [{ action: 'expectValue', target: { label: 'Title' }, value: 'Impossible readiness value' }];
    const report = await runContract(c, { out: join(temp, mode) });
    reports[mode] = report;
    assert.equal(report.results[0]?.status, expected, JSON.stringify(report));
    assert.equal(report.exitCode, expected === 'pass' ? 0 : expected === 'fail' ? 1 : 2);
    const r = report.results[0];
    if (expected !== 'inconclusive') {
      assert.equal(r.peerCommit.confirmed, true);
      const phases = r.events.filter(e => e.step === undefined).map(e => e.phase);
      assert.deepEqual(phases, ['peer-hydrated-before-primary-save', 'primary-saved', 'peer-committed', ...(mode.endsWith('readiness-error') ? [] : ['primary-reloaded'])]);
    }
    if (['nested-loss', 'extra-node', 'changed-id', 'delayed-loss', 'repair-after-loss'].includes(mode)) {
      assert.equal(r.before.persistedTitle, 'Primary saved title');
      assert.ok(r.differences.some(d => d.path.includes('nodes')), JSON.stringify(r.differences));
    }
    if (mode === 'repair-after-loss') {
      assert.deepEqual(r.after, r.before);
      assert.ok(r.firstViolation.differences.length > 0, 'an observed loss must survive later repair');
    }
    if (mode === 'peer-no-hydrate') assert.ok(!r.events.some(e => e.phase === 'primary-saved'), 'never start primary P before peer hydration');
    if (mode === 'no-save') assert.equal(r.peerCommit.confirmed, false);
    if (mode === 'reload-loses-commit') assert.equal(r.peerCommit.preservedAfterReload, false);
    if (mode === 'raw-read-audit') assert.equal(duplicateReads, 0, 'each shared JSON envelope must be read once per sample');
    if (mode === 'loss-then-readiness-error') {
      assert.ok(r.firstViolation.differences.length > 0);
      assert.match(r.followthroughError, /Impossible readiness value/);
    }
    if (mode === 'loss-then-dialog') assert.match(r.error, /Unexpected native dialog/);
    if (mode === 'commit-loss-then-readiness-error') {
      assert.equal(r.firstViolation, undefined);
      assert.equal(r.peerCommit.preservedAfterReload, false);
      assert.match(r.followthroughError, /Impossible readiness value/);
    }
    assert.match(await readFile(join(report.out, 'index.html'), 'utf8'), /Earlier tab → unrelated save → preserve/);
  });
  await t.test('portable specs use the same sequence and status without modifying generated bytes', async () => {
    for (const mode of ['fixed', 'broken', 'no-save', 'wrong-baseline', 'raw-read-audit', 'loss-then-readiness-error', 'commit-loss-then-readiness-error']) {
      const report = reports[mode];
      const specPath = join(report.out, 'repro.spec.mjs');
      const before = createHash('sha256').update(await readFile(specPath)).digest('hex');
      const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(report.out, 'playwright.config.mjs'), '--reporter=json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
      const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
      await writeFile(join(report.out, 'portable-results.json'), stdout);
      assert.equal(exit, report.results[0].status === 'pass' ? 0 : 1, stderr + stdout.slice(-2000));
      const parsed = JSON.parse(stdout);
      const attachments = suite => [...(suite.specs ?? []).flatMap(spec => spec.tests).flatMap(test => test.results).flatMap(result => result.attachments), ...(suite.suites ?? []).flatMap(attachments)];
      const attachment = parsed.suites.flatMap(attachments).find(a => a.name === 'state-diff');
      const actual = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
      assert.equal(actual.status, report.results[0].status);
      assert.equal(actual.phase, report.results[0].phase);
      assert.equal(actual.peerCommit?.confirmed, report.results[0].peerCommit?.confirmed);
      assert.equal(createHash('sha256').update(await readFile(specPath)).digest('hex'), before);
    }
    assert.equal(duplicateReads, 0, 'portable snapshots also read each shared envelope once');
  });
});
