import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:54230';
const key = 'WatchedHistory';
const marker = 'C_SYNTHETIC_VIDEO_HISTORY_DENIED';
const prior = { 'old-video': { movie: { id: 'old-video', title: 'Previous local fixture', variants: [], series: null }, watched: 0.4 } };
const priorRaw = JSON.stringify(prior);

async function prepare(context, page, mode) {
  const network = { manifest: [], segments: [], blocked: [] };
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push({ name: error.name, message: error.message }));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { network.blocked.push(url.href); return route.abort('blockedbyclient'); }
    if (url.pathname.startsWith('/media/') && url.pathname.endsWith('.m3u8')) network.manifest.push(url.pathname);
    if (url.pathname.startsWith('/media/') && url.pathname.endsWith('.ts')) network.segments.push(url.pathname);
    return route.continue();
  });
  await context.addInitScript(({ key, priorRaw, marker, mode }) => {
    if (location.origin !== 'http://127.0.0.1:54230') return;
    const nativeSet = Storage.prototype.setItem;
    Reflect.apply(nativeSet, localStorage, [key, priorRaw]);
    window.__videoProbe = { armed: false, sequence: 0, events: [], denied: 0, attempts: 0 };
    window.__componentFixture = { error: null, hlsInitialized: false };
    Storage.prototype.setItem = function (name, value) {
      const p = window.__videoProbe;
      if (this === localStorage) {
        p.events.push({ sequence: ++p.sequence, kind: 'storage-attempt', key: String(name), value: String(value) });
        if (String(name) === key) p.attempts++;
        const selected = mode === 'quota' ? key : mode === 'unrelated' ? 'C_unrelated_control' : null;
        if (p.armed && String(name) === selected) {
          p.denied++;
          p.events.push({ sequence: ++p.sequence, kind: 'storage-denied', key: String(name),
            errorName: 'QuotaExceededError', message: marker, stack: new Error().stack });
          throw new DOMException(marker, 'QuotaExceededError');
        }
      }
      return Reflect.apply(nativeSet, this, [name, value]);
    };
  }, { key, priorRaw, marker, mode });
  await page.goto(origin);
  await expect(page.getByTestId('history-memory')).toContainText('old-video');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(priorRaw);
  // Calibrate that unrelated-key selection can actually reject a write, then reset witnesses.
  if (mode === 'unrelated') {
    const calibration = await page.evaluate(() => {
      window.__videoProbe.armed = true;
      try { localStorage.setItem('C_unrelated_control', 'calibration'); return null; }
      catch (e) { return { name: e.name, message: e.message }; }
    });
    expect(calibration).toEqual({ name: 'QuotaExceededError', message: marker });
  }
  await page.evaluate(() => { window.__videoProbe.armed = true; window.__videoProbe.events = [];
    window.__videoProbe.sequence = 0; window.__videoProbe.denied = 0; window.__videoProbe.attempts = 0; });
  await page.getByRole('button', { name: 'Mount actual Video', exact: true }).click();
  return { network, pageErrors };
}
async function snapshot(page, witnesses) {
  const state = await page.evaluate(key => ({ fixture: structuredClone(window.__componentFixture),
    probe: structuredClone(window.__videoProbe), durable: localStorage.getItem(key),
    media: (() => { const v = document.querySelector('video'); return v && { currentTime: v.currentTime,
      duration: Number.isFinite(v.duration) ? v.duration : null, readyState: v.readyState, paused: v.paused, error: v.error?.code ?? null }; })() }), key);
  return { ...state, ...witnesses };
}
async function attach(page, testInfo, label, state) {
  await testInfo.attach(`${label}.json`, { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
  await testInfo.attach(`${label}.png`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}
async function requireActualPlayback(page, { historyMustPersist = true } = {}) {
  await expect(page.getByTestId('hls-state')).toHaveText('HLS initialized: true');
  await expect.poll(() => page.locator('video').evaluate(v => v.readyState >= 2 && Number.isFinite(v.duration) && Math.abs(v.duration - 12) < 0.02)).toBe(true);
  await page.getByRole('button', { name: 'Play synthetic media', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0.15);
  if (historyMustPersist) {
    await page.getByRole('button', { name: 'Seek to 10.2 seconds', exact: true }).click();
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key))?.['synthetic-video']?.watched ?? 0, key)).toBeGreaterThan(0.8);
  }
}
for (const mode of ['normal', 'unrelated']) {
  test(`${mode} control loads real local HLS and durably records actual progress`, async ({ context, page }, testInfo) => {
    const witnesses = await prepare(context, page, mode);
    await requireActualPlayback(page);
    const state = await snapshot(page, witnesses);
    await attach(page, testInfo, mode, state);
    expect(state.fixture.error).toBeNull();
    expect(state.pageErrors).toEqual([]);
    expect(state.network.blocked).toEqual([]);
    expect(state.network.manifest.length).toBeGreaterThan(0);
    expect(state.network.segments.length).toBeGreaterThan(0);
    expect(state.probe.denied).toBe(0);
    expect(JSON.parse(state.durable)['old-video']).toEqual(prior['old-video']);
    expect(JSON.parse(state.durable)['synthetic-video'].movie).toEqual(state.fixture.movie);
    expect(JSON.parse(state.durable)['synthetic-video'].watched).toBeGreaterThan(0.8);
  });
}
test('optional history rejection must not prevent first video load', async ({ context, page }, testInfo) => {
  const witnesses = await prepare(context, page, 'quota');
  await expect.poll(() => page.evaluate(() => !!window.__componentFixture.error || window.__componentFixture.hlsInitialized)).toBe(true);
  const state = await snapshot(page, witnesses);
  await attach(page, testInfo, 'quota-before-outcome', state);
  expect(state.network.blocked, 'PRECONDITION: no unexpected external dependency').toEqual([]);
  expect(state.probe.denied, 'PRECONDITION: a real exact-key setItem must be denied').toBeGreaterThan(0);
  const denied = state.probe.events.find(e => e.kind === 'storage-denied');
  expect(denied.key).toBe(key);
  expect(denied.errorName).toBe('QuotaExceededError');
  expect(denied.stack, 'PRECONDITION: denial must originate in the unchanged Video component').toContain('Video.tsx');
  expect(state.durable, 'PRECONDITION: previous durable bytes preserved').toBe(priorRaw);
  if (state.fixture.error) {
    expect(state.fixture.error, 'PRECONDITION: classify only the marked history exception').toEqual({ name: 'QuotaExceededError', message: marker });
    const caught = state.probe.events.find(e => e.kind === 'fixture-boundary-caught');
    expect(caught.sequence, 'PRECONDITION: caught after actual history denial').toBeGreaterThan(denied.sequence);
    expect(state.probe.events.filter(e => e.kind === 'hls-atom-observed' && e.value === true), 'PRECONDITION: load not previously reached').toEqual([]);
    expect(state.fixture.hlsInitialized).toBe(false);
    expect(state.network.manifest).toEqual([]);
    expect(state.network.segments).toEqual([]);
  }
  // Deliberately a normal positive product assertion: no skip/test.fail/expected failure.
  expect(state.fixture.error, 'OUTCOME: optional history must not abort initial Video effect before media loading').toBeNull();
  await requireActualPlayback(page, { historyMustPersist: false });
});
