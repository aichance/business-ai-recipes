// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';

const base = new URL(process.env.READINESS_URL ?? 'http://127.0.0.1:57960/');
assert(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a disposable loopback copy');
assert(!base.username && !base.password, 'Do not pass credentials');
const key = 'ai-dev-diagnosis:v1:draft';
const output = process.env.READINESS_REPORT_DIR ? resolve(process.env.READINESS_REPORT_DIR) : null;
if (output) await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
const protectedFields = (draft) => Object.fromEntries(Object.entries(draft).filter(([name]) => name !== 'currentIndex' && name !== 'updatedAt'));
const readDraft = (page) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key);
const indexOnScreen = async (page) => {
  const counter = await page.locator('main header p').nth(1).innerText();
  const match = counter.match(/(\d+)\s*\/\s*(\d+)/);
  assert(match, `PRECONDITION: missing question counter: ${counter}`);
  return Number(match[1]) - 1;
};
const waitIndex = async (page, index) => {
  await page.waitForFunction(({ storageKey, expected }) => {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value?.currentIndex === expected;
  }, { storageKey: key, expected: index }, { timeout: 8000 });
  assert.equal(await indexOnScreen(page), index, 'PRECONDITION: rendered question did not advance');
};
const chooseFirst = async (page) => {
  const index = await indexOnScreen(page);
  const label = page.locator('main label').first();
  const id = await label.getAttribute('for');
  assert(id?.includes('-'), 'PRECONDITION: missing normal answer control');
  const separator = id.indexOf('-');
  const question = id.slice(0, separator);
  const answer = id.slice(separator + 1);
  await label.click();
  await page.waitForFunction(({ storageKey, question, answer, index }) => {
    const value = JSON.parse(localStorage.getItem(storageKey));
    return value?.answers?.[question] === answer && value.currentIndex === index + 1;
  }, { storageKey: key, question, answer, index }, { timeout: 8000 });
  assert.equal(await indexOnScreen(page), index + 1, 'PRECONDITION: visible auto-advance incomplete');
  return { question, answer };
};

try {
  for (const mode of ['same-tab', 'fresh-peer', 'earlier-peer']) {
    const context = await browser.newContext({ locale: 'ja-JP', viewport: { width: 1080, height: 800 } });
    const diagnostic = { pageErrors: [], blockedExternalRequests: [] };
    context.on('page', (page) => page.on('pageerror', (error) => diagnostic.pageErrors.push(String(error))));
    await context.route('**/*', (route) => {
      if (new URL(route.request().url()).origin === base.origin) return route.continue();
      diagnostic.blockedExternalRequests.push(route.request().url());
      return route.abort();
    });
    if (output) await context.tracing.start({ screenshots: true, snapshots: true });
    const entry = new URL('#/assessment/quick', base).href;
    const result = { mode, diagnostic };
    try {
      const primary = await context.newPage();
      await primary.goto(entry);
      await primary.locator('main label').first().waitFor();
      await waitIndex(primary, 0);
      await chooseFirst(primary); // P1: synthetic profile, UI only.
      await chooseFirst(primary); // P2: now Q1 is displayed.
      result.baseline = await readDraft(primary);
      assert.equal(result.baseline.currentIndex, 2, 'PRECONDITION: baseline is not hydrated');
      let peer = primary;
      if (mode === 'earlier-peer') {
        peer = await context.newPage();
        await peer.goto(entry);
        await peer.locator('main label').first().waitFor();
        assert.equal(await indexOnScreen(peer), 2, 'PRECONDITION: earlier peer did not load baseline');
        assert.equal(await peer.locator('main label').first().getAttribute('for'), await primary.locator('main label').first().getAttribute('for'), 'PRECONDITION: different baseline questions');
        assert.deepEqual(protectedFields(await readDraft(peer)), protectedFields(result.baseline), 'PRECONDITION: earlier-peer initial write changed baseline');
      }
      result.newAnswer = await chooseFirst(primary); // A answers Q1; autosaves and shows Q2.
      result.saved = await readDraft(primary);
      assert.equal(result.saved.answers[result.newAnswer.question], result.newAnswer.answer, 'PRECONDITION: A did not actually save');
      if (mode === 'fresh-peer') {
        peer = await context.newPage();
        await peer.goto(entry);
        await peer.locator('main label').first().waitFor();
        assert.equal(await indexOnScreen(peer), 3, 'PRECONDITION: fresh peer did not load latest draft');
        assert.deepEqual(protectedFields(await readDraft(peer)), protectedFields(result.saved), 'PRECONDITION: fresh-peer initial write changed latest draft');
      }
      if (output) await primary.screenshot({ path: resolve(output, `${mode}-primary-saved.png`) });
      const beforeNavigation = await readDraft(peer);
      const visiblePeerIndex = await indexOnScreen(peer); // A correct storage-event fix may have advanced B.
      assert(visiblePeerIndex > 0, 'PRECONDITION: peer cannot navigate back');
      assert.notEqual(beforeNavigation.currentIndex, visiblePeerIndex - 1, 'PRECONDITION: saved index already equals navigation target');
      await peer.getByRole('button', { name: '前へ', exact: true }).click();
      await peer.waitForFunction(({ storageKey, previousIndex, oldSavedIndex }) => {
        const value = JSON.parse(localStorage.getItem(storageKey));
        return value?.currentIndex === previousIndex - 1 && value.currentIndex !== oldSavedIndex;
      }, { storageKey: key, previousIndex: visiblePeerIndex, oldSavedIndex: beforeNavigation.currentIndex }, { timeout: 8000 });
      assert.equal(await indexOnScreen(peer), visiblePeerIndex - 1, 'PRECONDITION: navigation not visible');
      result.afterPeerNavigation = await readDraft(peer);
      if (output) await peer.screenshot({ path: resolve(output, `${mode}-peer-after-back.png`) });
      await primary.reload();
      await primary.locator('main label').first().waitFor();
      result.afterReload = await readDraft(primary);
      if (output) await primary.screenshot({ path: resolve(output, `${mode}-primary-reloaded.png`) });
      result.preservedAfterNavigation = isDeepStrictEqual(protectedFields(result.afterPeerNavigation), protectedFields(result.saved));
      result.preservedAfterReload = isDeepStrictEqual(protectedFields(result.afterReload), protectedFields(result.saved));
      assert.deepEqual(protectedFields(result.afterPeerNavigation), protectedFields(result.saved), 'PRESERVATION: back-navigation rewrote saved answers/profile');
      assert.deepEqual(protectedFields(result.afterReload), protectedFields(result.saved), 'PRESERVATION: reloaded answers/profile differ');
      result.status = 'PASS';
    } catch (error) {
      result.status = 'FAIL';
      result.error = String(error);
      result.failureKind = String(error).includes('PRESERVATION:') ? 'PRESERVATION' : 'PRECONDITION';
    } finally {
      if (output) {
        await context.tracing.stop({ path: resolve(output, `${mode}.trace.zip`) });
        await writeFile(resolve(output, `${mode}.json`), JSON.stringify(result, null, 2) + '\n');
      }
      await context.close();
    }
    results.push(result);
    console.log(`${result.status} ${mode}${result.failureKind ? ` ${result.failureKind}` : ''}`);
    if (result.status === 'FAIL') console.error(JSON.stringify({ error: result.error, expected: result.saved, afterPeerNavigation: result.afterPeerNavigation, afterReload: result.afterReload }, null, 2));
  }
} finally {
  await browser.close();
}
if (output) await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
if (results.some((result) => result.status !== 'PASS')) process.exitCode = 1;
