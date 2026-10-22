import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { test, expect, chromium } = require('@playwright/test');
const PIN = '663372bbae5ce8a6903035551d150b19ab12438d4f45d14c438b986e1a38bc9e';
const expectedHash = process.env.NUMBERPLACE_EXPECT_SHA256 || PIN;
const sourcePath = process.env.NUMBERPLACE_HTML;
const BOARD = [
  '530070000', '600195000', '098000060',
  '800060003', '400803001', '700020006',
  '060000280', '000419005', '000080079',
].join('').split('').map(Number);
if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Expected a lowercase source SHA-256');
if (!sourcePath) throw new Error('Set NUMBERPLACE_HTML to the reviewed NumberPlace000.htm file');
test.setTimeout(45000);

let server;
let origin;
let sourceHash;
test.beforeAll(async () => {
  const html = await readFile(sourcePath);
  sourceHash = createHash('sha256').update(html).digest('hex');
  expect(sourceHash, 'Refuse an unreviewed or changed app snapshot').toBe(expectedHash);
  server = createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method) || new URL(req.url, 'http://localhost').pathname !== '/NumberPlace000.htm') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // Original HTML bytes; allow its inline app code, deny external analytics/assets.
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'",
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});

function reviewedUrl(title, author) {
  const url = new URL('/NumberPlace000.htm', origin);
  url.searchParams.set('title', title);
  url.searchParams.set('author', author);
  url.searchParams.set('data', Buffer.from(BOARD.join('')).toString('base64url'));
  return url.href;
}

async function ready(page) {
  await expect(page.locator('#grid input')).toHaveCount(81);
  await expect(page.locator('#status')).toHaveText(/^(URLから問題を読み込みました！|新しい問題を生成しました。)$/);
}

async function state(page) {
  return {
    board: await page.locator('#grid input').evaluateAll(inputs => inputs.map(input => Number(input.value || 0))),
    title: await page.locator('#SPtitle').innerText(),
    author: await page.locator('#SPauthor').innerText(),
  };
}

async function runCase(info, { title, author, useShareButton }) {
  const expected = { board: BOARD, title, author };
  const browser = await chromium.launch({ headless: true });
  const proof = {
    source_url: 'https://nas6.net/NumberPlace000.htm', source_sha256: sourceHash,
    node: process.version, playwright: require('@playwright/test/package.json').version,
    chromium: browser.version(), expected, use_share_button: useShareButton,
    blocked_requests: [], page_errors: [],
    scope: useShareButton
      ? 'Unmodified local HTML, real clipboard, separate contexts and complete DOM state'
      : 'Independently encoded reference URL; no clipboard action or app fix',
  };
  async function context() {
    const c = await browser.newContext({
      viewport: { width: 1000, height: 950 }, locale: 'ja-JP',
      permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block',
    });
    await c.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin === origin && ['GET', 'HEAD'].includes(request.method())) await route.continue();
      else {
        proof.blocked_requests.push({ method: request.method(), url: request.url() });
        await route.abort('blockedbyclient');
      }
    });
    c.on('page', page => page.on('pageerror', error => proof.page_errors.push(error.message)));
    return c;
  }
  try {
    const source = await (await context()).newPage();
    await source.goto(reviewedUrl(title, author));
    await ready(source);
    proof.before = await state(source);
    expect(proof.before, 'The independently reviewed fixture must really load first').toEqual(expected);
    await source.screenshot({ path: info.outputPath('before-share.png') });

    let transferUrl = reviewedUrl(title, author);
    if (useShareButton) {
      await source.getByRole('button', { name: '問題共有URLコピー', exact: true }).click();
      await expect(source.locator('#status')).toHaveText('共有用URLをクリップボードにコピーしました！');
      transferUrl = await source.evaluate(() => navigator.clipboard.readText());
    }
    const parsed = new URL(transferUrl);
    expect(parsed.origin).toBe(origin);
    expect(parsed.pathname).toBe('/NumberPlace000.htm');
    proof.transferred_search = parsed.search;
    proof.transferred_hash = parsed.hash;
    proof.transferred_board_param = parsed.searchParams.get('data');

    const recipient = await (await context()).newPage();
    await recipient.goto(transferUrl);
    await ready(recipient);
    proof.after_fresh_context = await state(recipient);
    await recipient.screenshot({ path: info.outputPath('after-share.png') });
    await recipient.reload();
    await ready(recipient);
    proof.after_reload = await state(recipient);
    // Compare all 81 positions and both fields, not just a board count or success toast.
    expect(proof.after_fresh_context).toEqual(expected);
    expect(proof.after_reload).toEqual(expected);
    expect(proof.page_errors).toEqual([]);
  } finally {
    try {
      await info.attach('complete-share-state', { body: JSON.stringify(proof, null, 2), contentType: 'application/json' });
    } finally {
      await browser.close();
    }
  }
}

test('ordinary title: actual clipboard share preserves all 81 cells and metadata', async ({}, info) => {
  await runCase(info, { title: 'Control 2026', author: 'Fixture', useShareButton: true });
});
test('reserved characters: actual clipboard share preserves all 81 cells and metadata', async ({}, info) => {
  await runCase(info, { title: '親 & 子 #1? + 日本語 %', author: 'Fixture & QA #2', useShareButton: true });
});
test('reference URL control: encoded fields load and reload without changing the app', async ({}, info) => {
  await runCase(info, { title: '親 & 子 #1? + 日本語 %', author: 'Fixture & QA #2', useShareButton: false });
});
