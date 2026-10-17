import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { options, limitedGet, loadSource, serve, checkReport, invoke, CASES } from '../examples/lifepilot-continuity/ci-trial.mjs';

const owner = { id: 132777552, login: 'gregmoulton', type: 'User' };
const repo = { id: 1413696006, private: false, owner };
const json = data => new Response(JSON.stringify(data));

test('CI source fetch needs explicit opt-in, a full SHA and a new output path', () => {
  assert.throws(() => options([]), /Explicit --fetch-source/);
  assert.throws(() => options(['--fetch-source', '--out', 'trial', '--app-ref', 'main; curl anything']), /40-character/);
  assert.throws(() => options(['--fetch-source']), /new output directory/);
  assert.equal(options(['--fetch-source', '--out', 'trial']).commit, '4710a5ec56dccd9436fec48369d513144306d7de');
});

test('organization or transferred owner stops before repository or app-body reads', async () => {
  const calls = [];
  await assert.rejects(loadSource('2'.repeat(40), async url => { calls.push(url); return json({ ...owner, type: 'Organization' }); }), /personal owner/);
  assert.deepEqual(calls, ['https://api.github.com/users/gregmoulton']);
});

test('private/transferred repository stops before either static source file', async () => {
  const calls = [];
  await assert.rejects(loadSource('2'.repeat(40), async url => {
    calls.push(url); return json(calls.length === 1 ? owner : { ...repo, private: true });
  }), /public personal repository/);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(url => url.includes('raw.githubusercontent.com')), false);
});

test('a selected later commit is kept; the helper does not silently load the old pin', async () => {
  const calls = [];
  const commit = '2'.repeat(40);
  const loaded = await loadSource(commit, async (url, request) => {
    calls.push(url); assert.equal(request.redirect, 'error');
    assert.equal(Object.hasOwn(request.headers, 'Authorization'), false);
    return calls.length === 1 ? json(owner) : calls.length === 2 ? json(repo) : new Response('original synthetic test bytes');
  });
  assert.equal(loaded.source.commit, commit);
  assert.equal(calls.length, 4);
  assert.ok(calls.slice(2).every(url => url.includes(`/${commit}/`)));
  assert.deepEqual([...loaded.files.keys()], ['/index.html', '/execution.js']);
  assert.ok(loaded.source.files.every(file => file.matches_original_reference === false));
});

test('the original pinned commit must retain its recorded source hash', async () => {
  let calls = 0;
  await assert.rejects(loadSource('4710a5ec56dccd9436fec48369d513144306d7de', async () => {
    calls += 1; return calls === 1 ? json(owner) : calls === 2 ? json(repo) : new Response('wrong content');
  }), /pinned source hash/);
  assert.equal(calls, 3);
});

test('oversized declared or streaming responses cannot enter the served app', async () => {
  await assert.rejects(limitedGet('https://example.invalid', 4, async () => new Response('12345', { headers: { 'content-length': '5' } })), /byte limit/);
  await assert.rejects(limitedGet('https://example.invalid', 4, async () => new Response('12345')), /byte limit/);
});

test('HTTP redirects are rejected before their destination is requested', async () => {
  let requests = 0;
  const server = createServer((req, res) => { requests += 1; res.writeHead(302, { Location: '/second' }); res.end(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await assert.rejects(limitedGet(`http://127.0.0.1:${server.address().port}/first`, 50)); assert.equal(requests, 1); }
  finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
});

test('the loopback app exposes only its two in-memory files, no filesystem/proxy writes', async () => {
  const app = await serve(new Map([['/index.html', Buffer.from('synthetic HTML')], ['/execution.js', Buffer.from('/* own synthetic JS */')]]));
  try {
    assert.equal(await (await fetch(app.origin)).text(), 'synthetic HTML');
    assert.equal((await fetch(`${app.origin}/execution.js`)).status, 200);
    assert.equal((await fetch(`${app.origin}/.git/config`)).status, 404);
    assert.equal((await fetch(`${app.origin}/SOURCE.json`)).status, 404);
    assert.equal((await fetch(`${app.origin}/`, { method: 'POST' })).status, 405);
    const denied = await new Promise((done, reject) => {
      const call = request(app.origin, { headers: { Host: 'unrelated.invalid' } }, response => {
        response.resume(); response.on('end', () => done(response.statusCode));
      });
      call.on('error', reject); call.end();
    });
    assert.equal(denied, 403);
  } finally { await app.close(); }
});

test('exit 1/2 from infrastructure is not a successful negative control', () => {
  assert.throws(() => checkReport(CASES[2], 1, { results: [{ check: 'reload', status: 'fail', phase: 'compare', differences: [] }] }), /goal status change/);
  assert.throws(() => checkReport(CASES[3], 2, { results: [{ check: 'reload', status: 'inconclusive', phase: 'setup' }] }), /result or phase/);
  assert.throws(() => checkReport(CASES[3], 2, { results: [] }), /missing or extra/);
  assert.throws(() => checkReport(CASES[0], 0, { results: [{ check: 'reload', status: 'pass', phase: 'compare', differences: [] }] }), /missing or extra/);
});

test('a stalled owned CLI process is terminated at the explicit deadline', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acl-owned-ci-timeout-'));
  try {
    const file = join(dir, 'stalled.mjs'); await writeFile(file, 'setInterval(() => {}, 1000);\n');
    const start = Date.now(); await assert.rejects(invoke([file], 100), /deadline/);
    assert.ok(Date.now() - start < 5000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

async function ownedFixture(dir) {
  const record = join(dir, 'pids.json');
  const script = join(dir, 'stalled-tree.mjs');
  await writeFile(script, `import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const browser = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
browser.unref();
writeFileSync(${JSON.stringify(record)}, JSON.stringify({ cli: process.pid, browser: browser.pid }));
setInterval(() => {}, 1000);\n`);
  return { record, script };
}

async function pidsWhenReady(record) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(record, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    await delay(20);
  }
  throw new Error('Owned child fixture did not start');
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    // Linux may retain an orphan's zombie until init reaps it; it cannot execute.
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      if (stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z ')) return false;
    }
    return true;
  } catch (error) { if (['ESRCH', 'ENOENT'].includes(error.code)) return false; throw error; }
}

async function stopped(pids) {
  for (let i = 0; i < 100 && Object.values(pids).some(alive); i += 1) await delay(20);
  for (const [name, pid] of Object.entries(pids)) assert.equal(alive(pid), false, `${name} still executing after cleanup`);
}

function cleanup(pids) {
  for (const pid of Object.values(pids ?? {})) if (alive(pid)) {
    try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

test('deadline stops a separate-group browser descendant and preserves an unrelated process', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acl-owned-ci-tree-'));
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  let pids;
  try {
    const fixture = await ownedFixture(dir);
    const pending = invoke([fixture.script], 1000);
    const rejected = assert.rejects(pending, /deadline/);
    pids = await pidsWhenReady(fixture.record);
    await rejected;
    await stopped(pids);
    assert.equal(alive(sentinel.pid), true, 'Unrelated process must remain running');
  } finally { cleanup(pids); sentinel.kill('SIGKILL'); await rm(dir, { recursive: true, force: true }); }
});

for (const signal of ['SIGINT', 'SIGTERM']) test(`${signal} on the helper stops its owned CLI and separate-group browser`, { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'acl-owned-ci-interrupt-'));
  let wrapper; let pids;
  try {
    const fixture = await ownedFixture(dir);
    const wrapperFile = join(dir, 'helper.mjs');
    const helper = new URL('../examples/lifepilot-continuity/ci-trial.mjs', import.meta.url).href;
    await writeFile(wrapperFile, `import { invoke } from ${JSON.stringify(helper)};
invoke([${JSON.stringify(fixture.script)}], 60000).then(() => { process.exitCode = 0; }, () => { process.exitCode = 2; });\n`);
    wrapper = spawn(process.execPath, [wrapperFile], { detached: true, stdio: 'ignore' });
    const exited = once(wrapper, 'exit');
    pids = await pidsWhenReady(fixture.record);
    wrapper.kill(signal);
    const outcome = await Promise.race([exited, delay(5000).then(() => { throw new Error('Interrupted helper did not exit'); })]);
    assert.deepEqual(outcome, [2, null]);
    await stopped(pids);
  } finally { cleanup(pids); if (wrapper?.exitCode === null) wrapper.kill('SIGKILL'); await rm(dir, { recursive: true, force: true }); }
});
