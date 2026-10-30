import assert from 'node:assert/strict';
import { writeFile, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { performance } from 'node:perf_hooks';
import { createStateLens } from '../../../docs/state-lens-v0.4.0-experimental.1.mjs';
import { startFixture } from '../demo/fixture.mjs';

const server = await startFixture();
let browser;
const cases = [];
try {
  browser = await chromium.launch();
  for (const mode of ['unobserved-release', 'checkpoint-after-release', 'step-before-release-100', 'step-before-release-default750']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      await page.goto(server.url);
      await page.waitForFunction(() => window.fixture?.ready);
      await page.evaluate(() => window.fixture.seed({ body: 'committed baseline', revision: 1 }));
      await page.evaluate(() => {
        const gate = window.heldWriter = { held: true, readyAt: null, releasedAt: null, committed: false, aborted: false };
        const tx = window.fixture.db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        tx.oncomplete = () => { gate.committed = true; };
        tx.onabort = () => { gate.aborted = true; };
        store.put({ body: 'writer committed after gate release', revision: 2 }, 'current');
        function hold() {
          const request = store.get('gate-keepalive');
          request.onsuccess = () => {
            gate.readyAt ??= performance.now();
            if (gate.held) hold();
          };
        }
        hold();
      });
      await page.waitForFunction(() => window.heldWriter.readyAt !== null);
      const options = { probes: [{ name: 'record', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' }], screenshots: false };
      if (mode.endsWith('-100')) options.timeoutMs = 100;
      const lens = createStateLens(page, options);
      const started = performance.now();
      let actionDelayMs;
      const release = async () => {
        actionDelayMs = performance.now() - started;
        await page.evaluate(() => {
          window.heldWriter.releasedAt = performance.now();
          window.heldWriter.held = false;
        });
        await page.waitForFunction(() => window.heldWriter.committed || window.heldWriter.aborted);
      };
      if (mode.startsWith('step-before-release')) await lens.step('Release held writer', release);
      else {
        await release();
        if (mode === 'checkpoint-after-release') await lens.checkpoint('Writer committed');
      }
      const gate = await page.evaluate(() => ({ ...window.heldWriter }));
      const actual = await page.evaluate(() => window.fixture.read());
      const report = lens.report();
      assert.equal(gate.committed, true);
      assert.equal(gate.aborted, false);
      assert.deepEqual(actual, { body: 'writer committed after gate release', revision: 2 });
      if (mode.startsWith('step-before-release')) {
        assert.equal(report.checkpoints[0].values.record.status, 'INCONCLUSIVE');
        assert.match(report.checkpoints[0].values.record.reason, /timed out/);
        assert.equal(report.checkpoints[1].values.record.status, 'OBSERVED');
        assert.equal(report.checkpoints[1].values.record.value.revision, 2);
        const timeout = options.timeoutMs ?? 750;
        assert.ok(actionDelayMs >= timeout * 0.85);
        assert.ok(actionDelayMs < 5000);
      } else if (mode === 'checkpoint-after-release') {
        assert.equal(report.checkpoints[0].values.record.status, 'OBSERVED');
        assert.equal(report.checkpoints[0].values.record.value.revision, 2);
      } else assert.equal(report.checkpoints.length, 0);
      cases.push({ mode, timeoutMs: options.timeoutMs ?? 750, actionDelayMs, gateHeldMs: gate.releasedAt - gate.readyAt, writerCommitted: gate.committed, writerAborted: gate.aborted, actual, report });
    } finally { await context.close(); }
  }
  const result = { observedAt: new Date().toISOString(), node: process.version, chromium: browser.version(), commonVersion: cases[1].report.libraryVersion, schema: cases[1].report.schema, moduleSha256: createHash('sha256').update(await readFile(new URL('../../../docs/state-lens-v0.4.0-experimental.1.mjs', import.meta.url))).digest('hex'), exampleSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'), fixture: 'owned DraftDesk; synthetic data; four fresh contexts; no model or upstream app execution', cases };
  assert.equal(result.moduleSha256, '9714c7c2bc11a591a4a90e3b20bb9e51d61fa65e325473da0e118644d760d604');
  const outputParent = fileURLToPath(new URL('../.state-lens-output/', import.meta.url));
  await mkdir(outputParent, { recursive: true });
  const outputDir = await mkdtemp(join(outputParent, 'held-write-'));
  const output = join(outputDir, 'results.json');
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ result: 'PASS', output, node: result.node, chromium: result.chromium, cases: cases.map(({ mode, actionDelayMs, gateHeldMs, writerCommitted, writerAborted, report }) => ({ mode, actionDelayMs, gateHeldMs, writerCommitted, writerAborted, observations: report.checkpoints.map(c => ({ status: c.values.record.status, reason: c.values.record.reason ?? null })) })) }));
} finally { if (browser) await browser.close(); await server.close(); }
