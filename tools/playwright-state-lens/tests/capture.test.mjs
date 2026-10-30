import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { parseArguments, readProbes, installedChromium, captureSession, manualPrompt } from '../capture.mjs';
import { startFixture } from '../demo/fixture.mjs';

const local = { name: 'draft', source: 'localStorage', key: 'demo-draft', json: true };
const reportData = html => JSON.parse(html.split('<script type="application/json" id="data">')[1].split('</script>')[0]);
async function sandbox(t) {
  const base = await mkdtemp(join(tmpdir(), 'state-lens-capture-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  return base;
}
function testBrowser() {
  let browser;
  return {
    chromium: { launch: async options => {
      assert.equal(options.headless, false); // The real entry requests a visible browser.
      browser = await chromium.launch({ ...options, headless: true }); // Controlled test only.
      return browser;
    } },
    disconnected: () => !browser.isConnected(),
  };
}

test('CLI validates explicit URL and probe file, rejecting unknown/duplicate flags and embedded credentials', () => {
  assert.deepEqual(parseArguments(['--help']), { help: true });
  assert.equal(parseArguments(['--url', 'http://127.0.0.1:5173', '--probe-file', 'probe.json']).url, 'http://127.0.0.1:5173/');
  for (const argv of [[], ['--url', 'file:///tmp/a', '--probe-file', 'p'],
    ['--url', 'https://user:pw@example.test', '--probe-file', 'p'],
    ['--url', 'http://a.test', '--url', 'http://b.test', '--probe-file', 'p'],
    ['--profile', 'personal'], ['--url', 'not-a-url', '--probe-file', 'p']]) {
    assert.throws(() => parseArguments(argv));
  }
});

test('probe file accepts the common object/array shapes and refuses invalid or oversized JSON', async t => {
  const base = await sandbox(t), file = join(base, 'probe.json');
  await writeFile(file, JSON.stringify(local)); assert.deepEqual(await readProbes(file), [local]);
  await writeFile(file, JSON.stringify([local, { name: 'session', source: 'sessionStorage', key: 'a' }]));
  assert.equal((await readProbes(file)).length, 2);
  for (const value of ['{bad', 'null', '[]', '[1]', JSON.stringify(Array(17).fill(local)), ' '.repeat(65537)]) {
    await writeFile(file, value); await assert.rejects(readProbes(file));
  }
});

test('help needs no project/browser and missing project Playwright never installs anything', async t => {
  const base = await sandbox(t);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../capture.mjs', import.meta.url)), '--help'], { cwd: base, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.match(result.stdout, /observes state/);
  assert.throws(() => installedChromium(base), /not found/);
  assert.deepEqual(await readdir(base), []);
});

test('real terminal adapter settles pending EOF and interrupt questions, removing listeners', async () => {
  for (const event of ['eof', 'SIGINT', 'close']) {
    const input = new PassThrough(), output = new PassThrough(), interrupts = new EventEmitter();
    const prompt = manualPrompt(input, output, interrupts);
    const pending = prompt.nextLabel({ signal: new AbortController().signal });
    if (event === 'eof') input.end(); else if (event === 'close') prompt.close(); else interrupts.emit('SIGINT');
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(prompt.signal.aborted, true);
    prompt.close(); assert.equal(interrupts.listenerCount('SIGINT'), 0);
    input.destroy(); output.destroy();
  }
});

test('manual user checkpoints observe local/IDB/session save and reload using the common library', async t => {
  const base = await sandbox(t), server = await startFixture(), adapter = testBrowser();
  t.after(() => server.close());
  const result = await captureSession({ url: server.url + '/?mode=good', chromium: adapter.chromium,
    probes: [local, { name: 'idb', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' },
      { name: 'tab', source: 'sessionStorage', key: 'manual-tab' }], outputBase: base,
    nextLabel: async ({ page, count }) => {
      if (count === 0) { await page.waitForFunction(() => window.fixture?.ready); return 'Before'; }
      if (count === 1) {
        await page.locator('#draft').fill('Synthetic manual entry'); await page.locator('#save').click();
        await page.getByText('Saved', { exact: true }).waitFor();
        await page.evaluate(() => sessionStorage.setItem('manual-tab', 'chosen tab value')); return 'Saved';
      }
      if (count === 2) { await page.reload(); await page.waitForFunction(() => window.fixture?.ready); return 'Reloaded'; }
      return '';
    } });
  assert.equal(result.checkpoints, 3); assert.equal(result.stoppedBy, 'finished'); assert.equal(adapter.disconnected(), true);
  const data = reportData(await readFile(result.reportPath, 'utf8'));
  assert.equal(data.schema, 4);
  assert.equal(data.checkpoints[1].values.draft.value.body, 'Synthetic manual entry');
  assert.equal(data.checkpoints[2].values.idb.value.body, 'Synthetic manual entry');
  assert.equal(data.checkpoints[2].values.tab.value, 'chosen tab value');
  assert.equal(data.checkpoints[2].changes.length, 0);
  assert.ok(data.checkpoints.every(c => c.screenshot && c.action.status === 'CHECKPOINT'));
  if (process.platform !== 'win32') assert.equal((await stat(result.reportPath)).mode & 0o777, 0o600);
});

test('blank first answer writes no empty report and closes its fresh browser', async t => {
  const base = await sandbox(t), server = await startFixture(), adapter = testBrowser();
  t.after(() => server.close());
  const result = await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: base, nextLabel: async () => '' });
  assert.equal(result.checkpoints, 0); assert.equal(result.reportPath, null);
  assert.equal(adapter.disconnected(), true); assert.deepEqual(await readdir(base), []);
});

test('two invocations retain different private report paths, and EOF preserves the first checkpoint', async t => {
  const base = await sandbox(t), server = await startFixture(); t.after(() => server.close());
  const paths = [];
  for (let i = 0; i < 2; i++) {
    const adapter = testBrowser();
    const result = await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: base,
      nextLabel: async ({ page, count }) => { await page.waitForFunction(() => window.fixture?.ready); return count ? null : 'Before'; } });
    paths.push(result.reportPath); assert.equal(result.stoppedBy, 'input-closed'); assert.equal(adapter.disconnected(), true);
  }
  assert.notEqual(paths[0], paths[1]); for (const p of paths) assert.equal(reportData(await readFile(p, 'utf8')).checkpoints.length, 1);
});

test('a later prompt failure still writes the earlier observation and closes resources', async t => {
  const base = await sandbox(t), server = await startFixture(), adapter = testBrowser(); t.after(() => server.close());
  let error;
  try {
    await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: base,
      nextLabel: async ({ page, count }) => { await page.waitForFunction(() => window.fixture?.ready); if (count) throw new Error('Synthetic prompt failure'); return 'Before'; } });
  } catch (e) { error = e; }
  assert.match(error.message, /Synthetic prompt failure/); assert.ok(error.reportPath);
  assert.equal(reportData(await readFile(error.reportPath, 'utf8')).checkpoints.length, 1); assert.equal(adapter.disconnected(), true);
});

test('closing the page aborts a pending question and saves already-captured state', async t => {
  const base = await sandbox(t), server = await startFixture(), adapter = testBrowser(); t.after(() => server.close());
  const result = await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: base,
    nextLabel: async ({ page, signal, count }) => {
      if (!count) { await page.waitForFunction(() => window.fixture?.ready); return 'Before'; }
      const pending = new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted question')), { once: true }));
      return Promise.all([pending, page.close()]).then(() => null);
    } });
  assert.equal(result.checkpoints, 1); assert.match(result.stoppedBy, /page-closed|browser-closed/);
  assert.ok(result.reportPath); assert.equal(adapter.disconnected(), true);
});

test('invalid common probe fails before visiting the app and still closes the browser', async t => {
  const base = await sandbox(t), adapter = testBrowser();
  await assert.rejects(captureSession({ url: 'http://127.0.0.1:1/never-visit', probes: [{ name: 'all', source: 'allStorage' }],
    chromium: adapter.chromium, outputBase: base, nextLabel: async () => 'Never' }));
  assert.equal(adapter.disconnected(), true); assert.deepEqual(await readdir(base), []);
});

test('output failure is an error, still closing the browser instead of reporting a saved path', async t => {
  const base = await sandbox(t), blocker = join(base, 'not-a-directory'); await writeFile(blocker, 'preserve');
  const server = await startFixture(), adapter = testBrowser(); t.after(() => server.close());
  let error;
  try {
    await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: blocker,
      nextLabel: async ({ page, count }) => { await page.waitForFunction(() => window.fixture?.ready); return count ? '' : 'Before'; } });
  } catch (e) { error = e; }
  assert.ok(error); assert.equal(error.reportPath, null); assert.equal(await readFile(blocker, 'utf8'), 'preserve');
  assert.equal(adapter.disconnected(), true);
});

test('an already-cancelled session opens no browser and writes no report', async () => {
  const controller = new AbortController(); controller.abort('interrupted');
  const result = await captureSession({ url: 'http://127.0.0.1:1/', probes: [local], signal: controller.signal,
    chromium: { launch() { throw new Error('Must not open'); } }, nextLabel: async () => 'Never' });
  assert.deepEqual(result, { reportPath: null, checkpoints: 0, stoppedBy: 'interrupted' });
});

test('the manual path stops at50 checkpoints and records an observation limit, not success', async t => {
  const base = await sandbox(t), server = await startFixture(), adapter = testBrowser(); t.after(() => server.close());
  const result = await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: base,
    nextLabel: async ({ page, count }) => { if (!count) await page.waitForFunction(() => window.fixture?.ready); return `Point ${count}`; } });
  assert.equal(result.checkpoints, 50); assert.equal(result.stoppedBy, 'checkpoint-limit');
  assert.equal(reportData(await readFile(result.reportPath, 'utf8')).checkpoints.length, 50); assert.equal(adapter.disconnected(), true);
});

test('an invalid later name keeps the earlier report and closes the browser', async t => {
  const base = await sandbox(t), server = await startFixture(); t.after(() => server.close());
  for (const bad of ['x'.repeat(161), 'name\u001bcontrol']) {
    const adapter = testBrowser(); let error;
    try {
      await captureSession({ url: server.url, probes: [local], chromium: adapter.chromium, outputBase: base,
        nextLabel: async ({ page, count }) => { await page.waitForFunction(() => window.fixture?.ready); return count ? bad : 'Before'; } });
    } catch (e) { error = e; }
    assert.match(error.message, /short single-line/); assert.equal(reportData(await readFile(error.reportPath, 'utf8')).checkpoints.length, 1);
    assert.equal(adapter.disconnected(), true);
  }
});

test('moving to another origin after the first checkpoint exports no selected value or screenshot there', async t => {
  const base = await sandbox(t), first = await startFixture(), other = await startFixture(), adapter = testBrowser();
  t.after(() => first.close()); t.after(() => other.close());
  const result = await captureSession({ url: first.url, probes: [local], chromium: adapter.chromium, outputBase: base,
    nextLabel: async ({ page, count }) => {
      if (!count) { await page.waitForFunction(() => window.fixture?.ready); return 'Selected app'; }
      if (count === 1) { await page.goto(other.url); await page.waitForFunction(() => window.fixture?.ready); return 'Other origin'; }
      return '';
    } });
  const data = reportData(await readFile(result.reportPath, 'utf8'));
  assert.equal(data.checkpoints[1].scopeStatus, 'OUTSIDE_ORIGIN');
  assert.equal(data.checkpoints[1].values.draft.status, 'INCONCLUSIVE');
  assert.equal(data.checkpoints[1].screenshot, null); assert.equal(adapter.disconnected(), true);
});
