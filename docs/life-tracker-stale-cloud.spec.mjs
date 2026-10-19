// SPDX-License-Identifier: MIT
// Copyright (c) 2026 aichance. Original app source is not included in this test pack.
import { test, expect } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

const app = 'http://127.0.0.1:54311';
const api = 'http://127.0.0.1:54312';
const userId = '10000000-0000-4000-8000-000000000028';
const key = `lifeTrackerCache:${userId}`;
const fields = ['life_data', 'year_data', 'habit_labels', 'birth_date', 'user_name'];
const business = row => Object.fromEntries(fields.map(field => [field, row[field]]));
const baseline = {
  life_data: { '3': { weeklyGoal: 'Keep 日本語 🐾', weeklyReview: 'Synthetic review',
    milestone: 'Synthetic pin', weeklyScore: 4,
    days: Array.from({ length: 7 }, (_, i) => ({ score: 3,
      subgoals: [{ text: `Synthetic task ${i}`, done: i % 2 === 0 }],
      habits: Array.from({ length: 10 }, (_, j) => j === i),
    })),
  } },
  year_data: { '0': 'Retain this synthetic year note' },
  habit_labels: ['Read', 'Walk', '', '', '', '', '', '', '', ''],
  birth_date: '1990-01-02', user_name: 'Initial synthetic writer',
};

for (const mode of ['remote update control', 'unavailable remote control', 'older remote regression']) {
  test(mode, async ({ browser }, info) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });
    const transport = { mode: 'available', row: { user_id: userId, ...structuredClone(baseline), updated_at: '2025-01-01T00:00:00Z' },
      reads: [], writes: [], auth: [], unexpected: [], blockedForeign: [] };
    const checkpoints = {};
    let phase = 'SETUP';
    const cors = { 'access-control-allow-origin': app,
      'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,x-supabase-api-version',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    const syntheticUser = { id: userId, aud: 'authenticated', role: 'authenticated',
      email: 'synthetic@example.invalid', app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {}, identities: [], created_at: '2025-01-01T00:00:00Z', email_confirmed_at: '2025-01-01T00:00:00Z' };
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, aud: 'authenticated',
      role: 'authenticated', email: syntheticUser.email, iat: now, exp: now + 3600, iss: `${api}/auth/v1` })}.synthetic-not-a-real-signature`;
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url()); const method = request.method();
      if (url.origin === app || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
      if (url.origin !== api) { transport.blockedForeign.push(url.href); return route.abort('blockedbyclient'); }
      const reply = (status, json) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(json) });
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
      if (url.pathname === '/auth/v1/token' && method === 'POST') {
        transport.auth.push({ path: url.pathname, method, grant: url.searchParams.get('grant_type') });
        return reply(200, { access_token: token, refresh_token: 'synthetic-refresh-only', token_type: 'bearer',
          expires_in: 3600, expires_at: now + 3600, user: syntheticUser });
      }
      if (url.pathname === '/auth/v1/user' && method === 'GET') return reply(200, syntheticUser);
      if (url.pathname === '/rest/v1/life_tracker_data') {
        if (method === 'GET') {
          transport.reads.push({ query: url.search, available: transport.mode === 'available', row: structuredClone(transport.row) });
          if (transport.mode !== 'available') return reply(503, { code: 'SYNTHETIC_REMOTE_UNAVAILABLE', message: 'Controlled transport failure' });
          return reply(200, [transport.row]);
        }
        if (method === 'POST') {
          const payload = request.postDataJSON();
          transport.writes.push({ available: transport.mode === 'available', payload });
          if (transport.mode !== 'available') return reply(503, { code: 'SYNTHETIC_REMOTE_UNAVAILABLE', message: 'Controlled transport failure' });
          transport.row = { ...transport.row, ...payload };
          return route.fulfill({ status: 201, headers: cors, body: '' });
        }
      }
      transport.unexpected.push({ path: url.pathname, method });
      return route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    const read = () => page.evaluate(key => {
      const raw = localStorage.getItem(key); return { raw, value: raw === null ? null : JSON.parse(raw) };
    }, key);
    const readBusiness = async () => { const result = await read(); return result.value && business(result.value); };
    const heading = page.getByRole('heading', { level: 1 });
    try {
      await page.goto(app);
      await page.getByPlaceholder('you@example.com', { exact: true }).fill(syntheticUser.email);
      await page.getByPlaceholder('••••••••', { exact: true }).fill('synthetic-password-only');
      await page.getByRole('button', { name: 'Log In', exact: true }).click();
      await expect(heading).toContainText(baseline.user_name);
      await expect.poll(readBusiness, { message: 'PRECONDITION: SDK loaded complete baseline row' }).toEqual(baseline);
      expect(transport.auth.some(entry => entry.grant === 'password')).toBe(true);
      expect(transport.reads.some(entry => entry.available && entry.query.includes(userId))).toBe(true);
      checkpoints.baseline = await read();
      if (mode === 'remote update control') {
        transport.row = { ...transport.row, user_name: 'Newer remote writer', updated_at: '2025-01-02T00:00:00Z' };
        const expected = business(transport.row); const beforeReads = transport.reads.length;
        await page.reload();
        await expect.poll(() => transport.reads.length).toBeGreaterThan(beforeReads);
        await expect.poll(readBusiness).toEqual(expected);
        await expect(heading).toContainText(expected.user_name);
        checkpoints.afterReload = await read();
      } else {
        transport.mode = 'unavailable';
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        const edited = { ...structuredClone(baseline), user_name: 'New offline edit 日本語 🐾' };
        await page.getByPlaceholder('Enter your name...', { exact: true }).fill(edited.user_name);
        await expect.poll(readBusiness, { message: 'PRECONDITION: ordinary UI wrote newer local business record' }).toEqual(edited);
        await expect.poll(() => transport.writes.filter(entry => !entry.available && entry.payload.user_name === edited.user_name).length,
          { message: 'PRECONDITION: actual SDK upsert was rejected', timeout: 10000 }).toBeGreaterThan(0);
        await expect(page.getByTitle('Offline - changes saved locally, will sync when back online', { exact: true })).toBeVisible();
        checkpoints.localBeforeReload = await read();
        checkpoints.visibleBeforeReload = await heading.textContent();
        checkpoints.localObservedAt = new Date().toISOString();
        const beforeReads = transport.reads.length;
        if (mode === 'older remote regression') transport.mode = 'available';
        const responseReady = page.waitForResponse(response => response.url().startsWith(`${api}/rest/v1/life_tracker_data`)
          && response.request().method() === 'GET');
        await page.reload();
        const fetchedResponse = await responseReady;
        await fetchedResponse.finished();
        expect(fetchedResponse.status()).toBe(mode === 'older remote regression' ? 200 : 503);
        await expect.poll(() => transport.reads.length, { message: 'PRECONDITION: reload fetched controlled remote endpoint' }).toBeGreaterThan(beforeReads);
        // PostgREST GET retries wait 1+2+4 seconds before the app's offline fallback.
        await expect(heading, 'PRECONDITION: post-reload hook hydrated a known record')
          .toContainText(/Initial synthetic writer|New offline edit/, { timeout: 15000 });
        if (mode === 'older remote regression') {
          await expect(page.getByTitle('Synced to cloud', { exact: true })).toBeVisible();
        } else {
          await expect(page.getByTitle('Offline - changes saved locally, will sync when back online', { exact: true })).toBeVisible();
        }
        expect(transport.unexpected, 'SETUP: no unhandled synthetic API request').toEqual([]);
        const until = performance.now() + 1600;
        do {
          const observed = await read();
          if (JSON.stringify(business(observed.value)) !== JSON.stringify(edited) && !checkpoints.firstLoss) {
            checkpoints.firstLoss = { phase: 'after completed remote response', cache: observed };
          }
          await delay(80);
        } while (performance.now() < until);
        checkpoints.afterReload = await read();
        checkpoints.visibleAfterReload = await heading.textContent();
        await page.screenshot({ path: info.outputPath('after-reload.png') });
        phase = 'OUTCOME';
        expect(checkpoints.firstLoss, 'PRESERVATION: no transient loss after remote response').toBeUndefined();
        expect(business(checkpoints.afterReload.value), 'PRESERVATION: old remote response must not discard newer offline edits').toEqual(edited);
        await expect(heading, 'PRESERVATION: visible tracker title must keep the offline edit').toContainText(edited.user_name);
      }
      expect(transport.unexpected, 'SETUP: unexpected synthetic service request').toEqual([]);
    } catch (error) {
      if (phase === 'SETUP') throw new Error(`SETUP_FAILED: ${error.message}`, { cause: error });
      throw error;
    } finally {
      await info.attach('saved-state-and-transport', { contentType: 'application/json',
        body: JSON.stringify({ mode, phase, sourcePin: '402ad57f75816302fc0cd50cb1a17f78eb78d143',
          scope: 'Unmodified app and SDK; synthetic auth/REST responses; no cloud or RLS validation', checkpoints, transport }, null, 2) });
      await context.close();
    }
  });
}
