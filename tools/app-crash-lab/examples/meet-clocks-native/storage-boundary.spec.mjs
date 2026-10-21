// App Crash Lab — MIT. Real unpacked extension + real Chrome storage API.
// Only the empty Meet host page is a fixture. No Google/relay account or traffic.
// Accept either a complete local fallback or an explicit refusal with old data intact.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import path from 'node:path';

// Fresh extension profiles can take over 30s to start and close on a busy host.
test.setTimeout(90_000);

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
  const proof = { source_hashes: hashes, version: manifest.version, case_timeout_ms: 90_000, network: [], rejections: [] };
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
    const readBoth = () => evaluate(`Promise.all([
      chrome.storage.sync.get(${JSON.stringify(KEY)}),
      chrome.storage.local.get(${JSON.stringify(KEY)})
    ]).then(([s, l]) => ({ sync: s[${JSON.stringify(KEY)}] ?? null, local: l[${JSON.stringify(KEY)}] ?? null }))`);
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
      // Seed both real areas identically: v0.9.3 merges local over sync on load.
      await evaluate(`Promise.all([
        chrome.storage.sync.set(${JSON.stringify({ [KEY]: record })}),
        chrome.storage.local.set(${JSON.stringify({ [KEY]: record })})
      ])`);
      expect(await readBoth()).toEqual({ sync: record, local: record });
      expect(await read()).toEqual(record);
      expect(await storedBytes()).toBe(bytes(record));
      await reload();
      expect(await read()).toEqual(record);
      proof.seed = { record, bytes: await storedBytes(), addressBookCount: Object.keys(record.addressBook).length };
      return record;
    };
    await run({ page, proof, read, readBoth, storedBytes, reload, add, normal, seedNearLimit });
    expect(proof.network.every(r => r.action === 'fixture' || r.action === 'blocked')).toBe(true);
  } finally {
    const output = testInfo.outputPath('storage-observations.json');
    // Preserve measured evidence even if browser teardown is interrupted.
    await writeFile(output, JSON.stringify(proof, null, 2) + '\n');
    try {
      if (context) await context.close();
    } finally {
      await rm(profile, { recursive: true, force: true });
      proof.disposable_profile_removed = true;
    }
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

test('quota boundary: complete fallback survives reload and another save, or refusal is explicit', async ({}, info) => {
  await withExtension(info, async ({ page, proof, readBoth, reload, add, seedNearLimit }) => {
    const baseline = await seedNearLimit();
    const expected = added(baseline, person);
    proof.attempted = { record: expected, bytes: bytes(expected) };
    const initialRejections = proof.rejections.length;
    const visibleFailure = async () => {
      const messages = [];
      for (const item of await page.locator(`${HOST} #err, ${HOST} [role="alert"]`).all()) {
        if (await item.isVisible()) messages.push((await item.innerText()).trim());
      }
      return messages.filter(Boolean).join('\n');
    };
    await add(person);
    await expect.poll(async () => {
      const stored = await readBoth();
      return equal(stored.local, expected) || equal(stored.sync, expected) ||
        Boolean(await visibleFailure()) ||
        proof.rejections.slice(initialRejections).some(s => /quota/i.test(s));
    }).toBe(true);
    proof.before_reload = await readBoth();
    proof.visible_error = await visibleFailure();
    proof.new_clock_visible_before_reload = await page.locator(`${HOST} #rows`)
      .getByText(person.name, { exact: true }).isVisible();
    await page.screenshot({ path: info.outputPath('boundary-before-reload.png') });
    await page.locator(HOST).screenshot({ path: info.outputPath('boundary-before-closeup.png') });

    if (equal(proof.before_reload.local, expected)) {
      proof.acceptance_path = 'complete_local_fallback';
      // Both values are compared in full. No API replacement or forced rejection.
      expect(proof.before_reload).toEqual({ sync: baseline, local: expected });
      expect(proof.attempted.bytes).toBeGreaterThan(proof.api.perItemQuota);
      expect(proof.rejections.slice(initialRejections)).toEqual([]);
      await reload();
      proof.after_reload = await readBoth();
      expect(proof.after_reload).toEqual({ sync: baseline, local: expected });
      await expect(page.locator(`${HOST} #rows`)).toContainText(person.name);

      // A second ordinary UI save serializes the loaded app state. This catches
      // a load that displayed the clock but dropped other contacts or settings.
      const edited = { ...expected, fmt: expected.fmt === '12' ? '24' : '12' };
      await page.locator(`${HOST} #fmt`).click();
      await expect.poll(async () => (await readBoth()).local).toEqual(edited);
      proof.after_reload_edit = await readBoth();
      expect(proof.after_reload_edit).toEqual({ sync: baseline, local: edited });
      await reload();
      proof.after_second_reload = await readBoth();
      expect(proof.after_second_reload).toEqual({ sync: baseline, local: edited });
      await expect(page.locator(`${HOST} #rows`)).toContainText(person.name);
      await expect(page.locator(`${HOST} #rows`)).toContainText('Avery Test');
      expect(proof.rejections.slice(initialRejections)).toEqual([]);
    } else {
      proof.acceptance_path = 'refused_or_unsaved';
      expect(proof.before_reload).toEqual({ sync: baseline, local: baseline });
      await reload();
      proof.after_reload = await readBoth();
      expect(proof.after_reload).toEqual({ sync: baseline, local: baseline });
      await expect(page.locator(`${HOST} #rows`)).not.toContainText(person.name);
      await page.screenshot({ path: info.outputPath('boundary-after-reload.png') });
      await page.locator(HOST).screenshot({ path: info.outputPath('boundary-after-closeup.png') });
      // An unchanged old record alone is not a pass: refusal must be visible.
      expect(proof.visible_error.trim(), 'An unsaved addition must give explicit visible feedback').not.toBe('');
    }
    await page.screenshot({ path: info.outputPath('boundary-after-reload.png') });
    await page.locator(HOST).screenshot({ path: info.outputPath('boundary-after-closeup.png') });
  });
});
