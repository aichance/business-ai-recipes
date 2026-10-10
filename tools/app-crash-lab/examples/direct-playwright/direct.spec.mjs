import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const { valid, invalid } = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
const origin = 'http://127.0.0.1:4397';
const canvas = 'canvas[aria-label="Glypha scene"]';

async function upload(page, document, status) {
  const response = await page.request.put(`${origin}/content`, {
    multipart: {
      content: { name: 'content.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }
    },
    maxRedirects: 0
  });
  try { expect(response.status()).toBe(status); }
  finally { await response.dispose(); }
}

async function readSaved(page) {
  const response = await page.request.get(`${origin}/display`, { maxRedirects: 0 });
  try {
    expect(response.status()).toBe(200);
    return { display: await response.json(), etag: response.headers().etag ?? null };
  } finally { await response.dispose(); }
}

for (const check of ['reload', 'rejected-update']) {
  test(check, async ({ page, context }, testInfo) => {
    await context.route('**/*', route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort('blockedbyclient'));
    await context.routeWebSocket('**/*', socket => {
      const url = new URL(socket.url());
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      if (url.origin === origin) socket.connectToServer();
      else socket.close();
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await upload(page, valid, 200);
    await expect(page.locator(canvas)).toBeVisible();
    await expect.poll(async () => (await readSaved(page)).display.ast.elements[1].text).toBe('会場 A / 14:00 開始');
    const before = await readSaved(page);
    if (check === 'reload') {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator(canvas)).toBeVisible();
    } else {
      await upload(page, invalid, 422);
    }
    await expect.poll(() => readSaved(page)).toEqual(before);
    const deadline = Date.now() + 250;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, Math.min(75, deadline - Date.now())));
      expect(await readSaved(page)).toEqual(before);
    }
    await testInfo.attach('saved-state', {
      body: JSON.stringify({ before, after: await readSaved(page) }, null, 2), contentType: 'application/json'
    });
  });
}
