// App Crash Lab — MIT. Real unpacked extension + real Chrome storage API.
// Only the empty Meet host page is a fixture. No Google/relay account or traffic.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const KEY = 'meetClocks';
const URL = 'https://meet.google.com/abc-defg-hij';
const HOST = '#meet-clocks-host';
const person = { name: 'Jordan Boundary', tz: 'Europe/Paris' };
const bytes = record => Buffer.byteLength(KEY) + Buffer.byteLength(JSON.stringify(record));
const added = (record, contact) => ({
  ...structuredClone(record),
  people: [...record.people, contact],
  addressBook: { ...record.addressBook, [contact.name.toLowerCase()]: contact },
});

async function withExtension(testInfo, run) {
  if (!process.env.MEET_CLOCKS_SOURCE) throw new Error('Set MEET_CLOCKS_SOURCE to the unpacked extension directory.');
  const source = path.resolve(process.env.MEET_CLOCKS_SOURCE);
  const hashes = {};
  for (const file of ['manifest.json', 'config.js', 'content.js']) {
    hashes[file] = createHash('sha256').update(await readFile(path.join(source, file))).digest('hex');
  }
  const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.permissions).toContain('storage');
  const profile = await mkdtemp(testInfo.outputPath('disposable-profile-'));
  const proof = { source_hashes: hashes, version: manifest.version, network: [], rejections: [] };
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true, locale: 'en-US', timezoneId: 'UTC',
      args: [`--disable-extensions-except=${source}`, `--load-extension=${source}`],
    });
    proof.browser_version = context.browser().version();
    await context.route('**/*', async route => {
      const url = route.request().url();
      proof.network.push({ url, action: url === URL ? 'fixture' : 'blocked' });
      if (url === URL) await route.fulfill({
        status: 200, contentType: 'text/html',
        body: '<!doctype html><html lang="en"><title>Offline Meet fixture</title><body><h1>Synthetic empty meeting</h1></body></html>',
      });
      else await route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const worlds = new Map();
    cdp.on('Runtime.executionContextCreated', ({ context: c }) => worlds.set(c.id, c));
    cdp.on('Runtime.executionContextDestroyed', ({ executionContextId }) => worlds.delete(executionContextId));
    cdp.on('Runtime.executionContextsCleared', () => worlds.clear());
    cdp.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
      if (worlds.get(d.executionContextId)?.origin.startsWith('chrome-extension://')) {
        proof.rejections.push(d.exception?.description || d.text);
      }
    });
    await cdp.send('Runtime.enable');
    // CDP observes the real isolated extension world. No save/load/API monkey patch.
    const evaluate = async expression => {
      const world = [...worlds.values()].find(c => c.origin.startsWith('chrome-extension://'));
      expect(world, 'The actual unpacked extension must be loaded').toBeTruthy();
      const result = await cdp.send('Runtime.evaluate', {
        expression, contextId: world.id, awaitPromise: true, returnByValue: true,
      });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const read = () => evaluate(`chrome.storage.sync.get(${JSON.stringify(KEY)}).then(r => r[${JSON.stringify(KEY)}])`);
    const storedBytes = () => evaluate(`chrome.storage.sync.getBytesInUse(${JSON.stringify(KEY)})`);
    const reload = async () => {
      await page.reload();
      await expect(page.locator(HOST)).toBeVisible();
    };
    const add = async contact => {
      if (!(await page.locator(`${HOST} #addbox`).isVisible())) await page.locator(`${HOST} #addtogglebtn`).click();
      await page.locator(`${HOST} #name`).fill(contact.name);
      await page.locator(`${HOST} #tz`).fill(contact.tz);
      await page.locator(`${HOST} #add button`).click();
    };
    await page.goto(URL);
    await expect(page.locator(HOST)).toBeVisible();
    proof.api = await evaluate('({extensionId:chrome.runtime.id,perItemQuota:chrome.storage.sync.QUOTA_BYTES_PER_ITEM})');
    expect(proof.api.perItemQuota).toBe(8192);
    // Establish the upstream's full real persisted shape via its ordinary UI.
    await add({ name: 'Avery Test', tz: 'Asia/Tokyo' });
    await expect.poll(async () => (await read())?.people).toEqual([{ name: 'Avery Test', tz: 'Asia/Tokyo' }]);
    const normal = await read();
    expect(normal.addressBook['avery test']).toEqual(normal.people[0]);
    expect(Object.hasOwn(normal, 'shared')).toBe(false); // Upstream intentionally excludes this transient flag.
    const seedNearLimit = async () => {
      const record = structuredClone(normal);
      for (let i = 0; ; i++) {
        const contact = { name: `Synthetic Contact ${String(i).padStart(3, '0')}`, tz: 'Asia/Tokyo' };
        const next = { ...record, addressBook: { ...record.addressBook, [contact.name.toLowerCase()]: contact } };
        if (bytes(next) > proof.api.perItemQuota) break;
        record.addressBook = next.addressBook;
      }
      expect(bytes(record)).toBeLessThanOrEqual(proof.api.perItemQuota);
      expect(bytes(added(record, person))).toBeGreaterThan(proof.api.perItemQuota);
      // Fixture setup uses one real bulk write, not hundreds of UI saves or a fake API.
      await evaluate(`chrome.storage.sync.set(${JSON.stringify({ [KEY]: record })})`);
      expect(await read()).toEqual(record);
      expect(await storedBytes()).toBe(bytes(record));
      await reload();
      expect(await read()).toEqual(record);
      proof.seed = { record, bytes: await storedBytes(), addressBookCount: Object.keys(record.addressBook).length };
      return record;
    };
    await run({ page, proof, read, storedBytes, reload, add, normal, seedNearLimit });
    expect(proof.network.every(r => r.action === 'fixture' || r.action === 'blocked')).toBe(true);
  } finally {
    try {
      if (context) await context.close();
    } finally {
      await rm(profile, { recursive: true, force: true });
      proof.disposable_profile_removed = true;
    }
    const output = testInfo.outputPath('storage-observations.json');
    await writeFile(output, JSON.stringify(proof, null, 2) + '\n');
    await testInfo.attach('real-storage-observations', { path: output, contentType: 'application/json' });
  }
}

test('control: an ordinary UI add preserves the complete saved record after reload', async ({}, info) => {
  await withExtension(info, async ({ page, proof, read, storedBytes, reload, normal }) => {
    proof.before_reload = normal;
    proof.saved_bytes = await storedBytes();
    await reload();
    proof.after_reload = await read();
    expect(proof.after_reload).toEqual(normal);
    await expect(page.locator(`${HOST} #rows`)).toContainText('Avery Test');
    expect(proof.rejections).toEqual([]);
  });
});

test('control: a same-size UI edit persists a valid near-limit complete record', async ({}, info) => {
  await withExtension(info, async ({ page, proof, read, reload, seedNearLimit }) => {
    const baseline = await seedNearLimit();
    const expected = { ...baseline, fmt: baseline.fmt === '12' ? '24' : '12' };
    expect(bytes(expected)).toBe(bytes(baseline));
    await page.locator(`${HOST} #fmt`).click();
    await expect.poll(read).toEqual(expected);
    await reload();
    proof.after_reload = await read();
    expect(proof.after_reload).toEqual(expected);
    expect(proof.rejections).toEqual([]);
  });
});

test('quota refusal must retain every old field and show a visible save failure', async ({}, info) => {
  await withExtension(info, async ({ page, proof, read, reload, add, seedNearLimit }) => {
    const baseline = await seedNearLimit();
    proof.attempted = { record: added(baseline, person), bytes: bytes(added(baseline, person)) };
    const initialRejections = proof.rejections.length;
    const visibleFailure = async () => {
      const messages = [];
      for (const item of await page.locator(`${HOST} #err, ${HOST} [role="alert"]`).all()) {
        if (await item.isVisible()) messages.push((await item.innerText()).trim());
      }
      return messages.filter(Boolean).join('\n');
    };
    await add(person);
    // A fixed handler can catch the Promise and report failure without an
    // unhandled rejection. Observe either outcome; do not require today's bug.
    await expect.poll(async () => Boolean(await visibleFailure()) ||
      proof.rejections.slice(initialRejections).some(s => /quota/i.test(s))).toBe(true);
    proof.before_reload = await read();
    proof.visible_error = await visibleFailure();
    proof.new_clock_visible_before_reload = await page.locator(`${HOST} #rows`).getByText(person.name, { exact: true }).isVisible();
    await page.screenshot({ path: info.outputPath('quota-before-reload.png') });
    expect(proof.before_reload).toEqual(baseline);
    await reload();
    proof.after_reload = await read();
    expect(proof.after_reload).toEqual(baseline);
    await expect(page.locator(`${HOST} #rows`)).not.toContainText(person.name);
    await page.screenshot({ path: info.outputPath('quota-after-reload.png') });
    // This is deliberately NOT test.fail(): an unfixed silent refusal exits nonzero.
    expect(proof.visible_error.trim(), 'A refused save must give explicit visible feedback before reload').not.toBe('');
  });
});
