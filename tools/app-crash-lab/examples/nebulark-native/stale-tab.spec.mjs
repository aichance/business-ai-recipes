import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { test, expect, chromium } = require('@playwright/test');

const APP_URL = 'https://nebulark.app/';
const ROOT = 'CLAB Root';
const CHILD = 'CLAB New Child';
// Optional historical pin: leave unset to test a later deployment or a fix.
const MAIN = process.env.NEBULARK_EXPECT_MAIN_SHA;
if (MAIN && !/^[a-f0-9]{64}$/.test(MAIN)) throw new Error('NEBULARK_EXPECT_MAIN_SHA must be a lowercase SHA-256');
test.setTimeout(120000);

async function state(page) {
  return page.evaluate(() => {
    const raw = Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]));
    const decode = value => {
      for (let i = 0; i < 4 && typeof value === 'string'; i++) value = JSON.parse(value);
      if (!value || typeof value !== 'object') throw new Error('Unrecognized persisted record');
      return value;
    };
    const index = decode(raw['flutter.mindmap_index']);
    const mapId = index.currentMapId;
    const nodes = decode(raw[`flutter.mindmap_nodes_${mapId}`]);
    return { raw, index, mapId, nodes };
  });
}

async function ready(page) {
  await page.locator('flt-semantics-placeholder,[role="button"]').first().waitFor({ state: 'attached', timeout: 45000 });
  const enable = page.getByRole('button', { name: 'Enable accessibility', exact: true });
  if (await enable.count()) await enable.dispatchEvent('click');
  await expect(page.getByRole('button', { name: 'マイマップ', exact: true })).toBeVisible({ timeout: 20000 });
}

async function open(context) {
  const page = await context.newPage();
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await ready(page);
  return page;
}

async function renderedFrames(page) {
  // Flutter commits focus and semantics updates on rendered frames.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(
    () => requestAnimationFrame(() => resolve())
  )));
}

async function renameSelected(page, title) {
  await page.bringToFront();
  const candidates = page.getByRole('textbox', { name: 'タイトル', exact: true });
  // Sidebar selection has ended any prior inline edit. Always reopen the
  // actual node-title editor, rather than filling a memo's stale label.
  await page.getByRole('button', { name: /^タイトルを編集/, disabled: false }).dispatchEvent('click');
  // The observed canvas field is x700; memo field with the same name is x916.
  // Wait for the new canvas editor, rather than racing its first frame.
  let index = -1;
  await expect.poll(async () => {
    const rectangles = await candidates.evaluateAll(es => es.map((e, i) => {
      const r = e.getBoundingClientRect();
      return { i, x: r.x, width: r.width, height: r.height };
    }));
    const inline = rectangles.filter(r => r.x >= 240 && r.x < 900 && r.width > 0 && r.height > 0);
    if (inline.length === 1) index = inline[0].i;
    return inline.length;
  }, { timeout: 10000 }).toBe(1);
  const field = candidates.nth(index);
  // A real pointer click binds Flutter's editor; DOM focus alone can leave
  // a semantics-only text field that never submits the app edit.
  await field.click({ force: true, noWaitAfter: true });
  await renderedFrames(page);
  await expect(field).toBeFocused();
  // Keep Flutter's actual focused editor, rather than assigning its semantics mirror.
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(title);
  await expect(field).toHaveValue(title);
  await renderedFrames(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('textarea[placeholder="タイトル"]')).toHaveCount(0);
  await expect.poll(async () => Object.values((await state(page)).nodes).some(n => n.title === title)).toBe(true);
}

async function renameRoot(page, oldTitle, newTitle) {
  await page.bringToFront();
  await page.getByRole('group', { name: /^ノード一覧（/ }).getByRole('group', { name: oldTitle, exact: true }).click({ noWaitAfter: true });
  await renameSelected(page, newTitle);
}

async function addChild(page, rootId) {
  await page.bringToFront();
  await page.getByRole('button', { name: '子ノードを追加 (Tab)', exact: true, disabled: false }).dispatchEvent('click');
  await expect.poll(async () => Object.keys((await state(page)).nodes).length).toBe(2);
  const child = Object.values((await state(page)).nodes).find(n => n.id !== rootId);
  expect(child).toBeTruthy();
  await page.getByRole('group', { name: /^ノード一覧（/ }).getByRole('group', { name: child.title || '(無題)', exact: true }).click({ noWaitAfter: true });
  await renameSelected(page, CHILD);
  const saved = await state(page);
  expect(saved.nodes[rootId].childrenIds).toContain(child.id);
  expect(saved.nodes[child.id].title).toBe(CHILD);
  return child.id;
}

async function screenshot(page, info, name) {
  // Flutter may expose semantics before its fallback glyphs finish loading.
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await renderedFrames(page);
  await page.screenshot({ path: info.outputPath(name), clip: { x: 0, y: 48, width: 245, height: 280 } });
}

async function withApp(info, run) {
  const browser = await chromium.launch({ headless: true });
  const proof = { started_at: new Date().toISOString(), node: process.version, playwright: require('playwright/package.json').version, chromium: browser.version(), network: [], assets: [], stages: [], page_errors: [] };
  const tasks = [];
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ja-JP', timezoneId: 'UTC', serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const req = route.request();
      const u = new URL(req.url());
      const allowed = ['GET', 'HEAD'].includes(req.method()) &&
        (u.origin === 'https://nebulark.app' || u.href.startsWith('https://www.gstatic.com/flutter-canvaskit/') || u.origin === 'https://fonts.gstatic.com' || u.origin === 'https://fonts.googleapis.com');
      proof.network.push({ url: req.url(), method: req.method(), action: allowed ? 'static_allowed' : 'blocked' });
      if (allowed) await route.continue();
      else await route.abort('blockedbyclient');
    });
    context.on('page', page => {
      page.on('pageerror', e => proof.page_errors.push(e.message));
      page.on('response', response => {
        if (!response.url().startsWith('https://nebulark.app/') || !/\.(?:js|json|wasm)(?:\?|$)/.test(response.url())) return;
        tasks.push((async () => {
          try {
            const b = await response.body();
            proof.assets.push({ url: response.url(), status: response.status(), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') });
          } catch (e) { proof.assets.push({ url: response.url(), error: e.message }); }
        })());
      });
    });
    proof.stages.push('Open actual web app in fresh browser context');
    const a = await open(context);
    await expect(pageSourceStable()).resolves.toBe(true);
    async function pageSourceStable() {
      await Promise.allSettled(tasks);
      const mains = proof.assets.filter(x => x.url === 'https://nebulark.app/main.dart.js');
      return mains.length >= 1 && mains.every(x => x.sha256 === (MAIN || mains[0].sha256));
    }
    const initial = await state(a);
    expect(Object.keys(initial.nodes)).toHaveLength(1);
    const rootId = Object.keys(initial.nodes)[0];
    proof.initial = initial;
    proof.root_id = rootId;
    proof.stages.push('Rename initial root with actual accessible UI');
    await renameRoot(a, '中心テーマ', ROOT);
    proof.root_ready = await state(a);
    await run({ a, context, rootId, proof });
    expect(await pageSourceStable()).toBe(true);
  } catch (e) {
    proof.failure = { message: e.message, stage: proof.stages.at(-1) };
    if (context) {
      proof.final_pages = [];
      for (const page of context.pages()) {
        proof.final_pages.push({ url: page.url(), snapshot: await page.locator('body').ariaSnapshot().catch(() => null), storage: await state(page).catch(() => null) });
      }
    }
    throw e;
  } finally {
    await browser.close();
    await Promise.allSettled(tasks);
    const mains = proof.assets.filter(x => x.url === 'https://nebulark.app/main.dart.js');
    proof.bundle_snapshot = { expected_sha256: MAIN || null, observed_sha256: [...new Set(mains.map(x => x.sha256))], reads: mains.length };
    proof.finished_at = new Date().toISOString();
    proof.owned_browser_closed = true;
    const file = info.outputPath('observations.json');
    await writeFile(file, JSON.stringify(proof, null, 2) + '\n');
    await info.attach('actual-storage-observations', { path: file, contentType: 'application/json' });
  }
}

function checkProtectedGraph(before, after, rootId, childId, newTitle) {
  expect(after.mapId).toBe(before.mapId);
  expect(after.index).toEqual(before.index);
  expect(after.nodes[childId], 'Renaming the root must retain every field of the already saved child').toEqual(before.nodes[childId]);
  const expectedRoot = { ...before.nodes[rootId], title: newTitle, updatedAt: after.nodes[rootId].updatedAt };
  expect(after.nodes[rootId]).toEqual(expectedRoot);
  expect(Object.keys(after.nodes).sort()).toEqual(Object.keys(before.nodes).sort());
}

test('control: same tab retains child and complete records through root rename and reload', async ({}, info) => {
  await withApp(info, async ({ a, rootId, proof }) => {
    proof.stages.push('Add synthetic child via actual UI');
    const childId = await addChild(a, rootId);
    const before = await state(a);
    proof.stages.push('Same-tab root rename');
    await renameRoot(a, ROOT, 'CLAB Same Tab');
    const after = await state(a);
    proof.before_rename = before;
    proof.after_rename = after;
    checkProtectedGraph(before, after, rootId, childId, 'CLAB Same Tab');
    await a.reload(); await ready(a);
    proof.after_reload = await state(a);
    expect(proof.after_reload).toEqual(after);
    await expect(a.getByRole('group', { name: CHILD, exact: true })).toBeVisible();
  });
});

test('control: newly opened tab retains child while renaming root', async ({}, info) => {
  await withApp(info, async ({ a, context, rootId, proof }) => {
    proof.stages.push('Add child before opening second tab');
    const childId = await addChild(a, rootId);
    const before = await state(a);
    const b = await open(context);
    await expect(b.getByRole('group', { name: /^ノード一覧（/ }).getByRole('group', { name: CHILD, exact: true })).toBeVisible();
    expect(await state(b)).toEqual(before);
    proof.stages.push('Fresh-tab root rename');
    await renameRoot(b, ROOT, 'CLAB Fresh Tab');
    const after = await state(b);
    proof.before_rename = before; proof.after_rename = after;
    checkProtectedGraph(before, after, rootId, childId, 'CLAB Fresh Tab');
    await b.reload(); await ready(b);
    proof.after_reload = await state(b);
    expect(proof.after_reload).toEqual(after);
  });
});

test('a previously opened tab must not remove another tab’s saved child when renaming root', async ({}, info) => {
  await withApp(info, async ({ a, context, rootId, proof }) => {
    proof.stages.push('Open older tab before child exists');
    const b = await open(context);
    await expect(b.getByRole('group', { name: 'ノード一覧（1）', exact: true })).toBeVisible();
    await expect(b.getByRole('group', { name: /^ノード一覧（/ }).getByRole('group', { name: ROOT, exact: true })).toBeVisible();
    proof.older_tab_initial_ui = await b.locator('body').ariaSnapshot();
    proof.older_tab_initial = await state(b);
    proof.stages.push('Add child in first tab');
    const childId = await addChild(a, rootId);
    const before = await state(a);
    proof.child_id = childId; proof.before_rename = before;
    await screenshot(a, info, 'before-older-tab-save.png');
    proof.older_tab_sees_child_before_edit = await b.getByRole('group', { name: /^ノード一覧（/ }).getByRole('group', { name: CHILD, exact: true }).isVisible();
    proof.stages.push('Older tab renames root only');
    await renameRoot(b, ROOT, 'CLAB Older Tab');
    proof.after_rename = await state(a);
    proof.a_still_shows_child = await a.getByRole('group', { name: CHILD, exact: true }).isVisible();
    await a.reload(); await ready(a);
    proof.after_reload = await state(a);
    proof.child_visible_after_reload = await a.getByRole('group', { name: CHILD, exact: true }).isVisible();
    await screenshot(a, info, 'after-older-tab-save.png');
    checkProtectedGraph(before, proof.after_reload, rootId, childId, 'CLAB Older Tab');
  });
});
