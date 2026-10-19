import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Unchanged PDF_Studio@87160462e342c039235531be49883113b1265e49.
// Only synthetic input and browser output APIs are controlled by this test.
const target = new URL(process.env.PDF_STUDIO_BASE_URL || 'http://localhost:8000');
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname) || target.username || target.password) throw new Error('Use a disposable loopback PDF Studio');
const pdf = Buffer.from('JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOSAwIFIgL01lZGlhQm94IFsgMCAwIDQyMCA1OTUgXSAvUGFyZW50IDggMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0NvbnRlbnRzIDEwIDAgUiAvTWVkaWFCb3ggWyAwIDAgNDIwIDU5NSBdIC9QYXJlbnQgOCAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNiAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDggMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgNCAwIFIgNSAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjkgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjcwCj4+CnN0cmVhbQpHYXJvOjk1Qi9WJjtCbFMna2MyOEBkaShXYF5MXEVDX0FHKE9QKy9lLkRiWS0pSklwZWhlMUgjLXJfZyhMO1NEcikxbiNBaDdwLkQ9MnNoTkpNZC0lWkBOMGw4OXJlSilXXEpXRURQZ0swRkgpU0UucycsYW8kPlZjRSEyXU05azNubEprRCgwRE9lL3FTLUpmVUwnNzlJTUoiYyYoJF4oRktWLCVVQTxLOy44Qz40RmE1JHQjNmwuJHJaJl04RlE4VzFdTFpocmUyMVZNQG1nXDs3NyQuNyZfWkNccm5vYk8vIzVOQ0pLITdaYUs+aVdOIWIlPFtaXCkrPGlCRSNJT1pZYGxpUWtKPXFxfj5lbmRzdHJlYW0KZW5kb2JqCjEwIDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDI2OQo+PgpzdHJlYW0KR2Fybzk5bCNBWCY0UT9oJ21KPUZDPlFUNmUzdC9sQ2EuTGlpLCNdRidKWDtwMXNpYlNeW0oqSTEhaFUuJSRzITsmc05lNl00dWtcWiQ3RlIjNEZmOFlpI1IjY1w+XFdnbFAlWFBsOmVUXylWWzpuO28xLz9aK2JHU1QyQzlScS5mW0Y6UzlTNUAuPWg9JW0wXmF1MUA9KUItWWVYPSdPYEQ+LjFXP1BVMEtlRF0lJGNGO3FtXzFtK2VVZCF1LmVMTyg1UUlgak5xaFUpSCZNNk5uI0dKYmphTm9cMzQiIUkoK1dZazlbKlRSWElTSGQmPDs8Rmk5JXFgdFRuLydAbFFAb29eXE49Xik/fj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCAxMQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDEwMiAwMDAwMCBuIAowMDAwMDAwMjA5IDAwMDAwIG4gCjAwMDAwMDAzMjEgMDAwMDAgbiAKMDAwMDAwMDUxNCAwMDAwMCBuIAowMDAwMDAwNzA4IDAwMDAwIG4gCjAwMDAwMDA3NzYgMDAwMDAgbiAKMDAwMDAwMTAzNyAwMDAwMCBuIAowMDAwMDAxMTAyIDAwMDAwIG4gCjAwMDAwMDE0NjIgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8MWMxNzgxOThmYmRmYTUxYjI1OTk1ZDg5ZDQxMDIwNDM+PDFjMTc4MTk4ZmJkZmE1MWIyNTk5NWQ4OWQ0MTAyMDQzPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA3IDAgUgovUm9vdCA2IDAgUgovU2l6ZSAxMQo+PgpzdGFydHhyZWYKMTgyMgolJUVPRgo=', 'base64');
const expectedText = ['A', 'B'].map((tag, i) => [
  `ACL_SYNTHETIC_PAGE_${tag}`, `Page ${i + 1} of 2 - synthetic test only`,
  `${tag}_ITEM_001 = 12.50`, `${tag}_ITEM_002 = 99.75`, `${tag}_TOTAL = 112.25`
]);
const saved = '向きの変更が完了しました！新規ファイルとして保存されました。';
test.use({ browserName: 'chromium', serviceWorkers: 'block' });
test.setTimeout(45000);

async function prepare(context, page, mode) {
  const run = { mode, pageErrors: [], blockedExternal: [], downloads: [] };
  page.__pdfRun = run;
  page.on('pageerror', e => run.pageErrors.push(e.message));
  page.on('download', d => run.downloads.push(d.suggestedFilename()));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === target.origin) return route.continue();
    run.blockedExternal.push(url.origin);
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(({ mode, saved }) => {
    const audit = window.__pdfAudit = { mode, phase: 0, events: [], toasts: [], output: null, drained: false };
    const record = (type, detail = {}) => audit.events.push({ type, phase: audit.phase, ...detail });
    new MutationObserver(records => {
      for (const change of records) for (const node of change.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || !node.matches('.toast')) continue;
        audit.toasts.push({ text: node.textContent, phase: audit.phase, committed: audit.output !== null });
      }
    }).observe(document, { childList: true, subtree: true });
    window.showSaveFilePicker = async options => {
      record('picker', { name: options.suggestedName });
      if (audit.mode === 'abort') {
        record('abort');
        // A new task starts after the rejecting promise's microtasks drain.
        // No fixed sleep, toast timeout, or background-tab animation is used.
        const channel = new MessageChannel();
        channel.port1.onmessage = () => { audit.drained = true; channel.port1.close(); channel.port2.close(); };
        channel.port2.postMessage(null);
        throw new DOMException('ACL synthetic user cancellation', 'AbortError');
      }
      return { createWritable: async () => {
        record('createWritable');
        return {
          write: async bytes => {
            record('write', { bytes: bytes.byteLength });
            if (audit.mode === 'write-denied') { record('write-denied'); throw new DOMException('ACL synthetic write denied', 'NotAllowedError'); }
            audit.pending = Array.from(new Uint8Array(bytes));
          },
          close: async () => {
            record('close-request');
            await new Promise(resolve => { audit.releaseClose = resolve; });
            audit.output = audit.pending;
            record('close-committed');
          }
        };
      } };
    };
    audit.savedMessage = saved;
  }, { mode, saved });
  await page.goto(target.href);
  await expect(page.locator('#file-input')).toHaveCount(1);
  await page.locator('#file-input').setInputFiles({ name: 'acl-synthetic-two-pages.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#loaded-count')).toHaveText('1');
  await expect(page.locator('#mode-card-rotate')).not.toHaveClass(/disabled/);
  await page.locator('#mode-card-rotate').click();
  await expect(page.locator('#rotate-grid-container .rotate-card')).toHaveCount(2);
  await page.locator('#btn-rotate-all-cw').click();
  await expect(page.locator('#rot-badge-1')).toHaveText('90°');
  await expect(page.locator('#rot-badge-2')).toHaveText('90°');
  await page.evaluate(() => { window.__pdfAudit.toasts.length = 0; });
  return run;
}

async function parseOutput(page, bytes, testInfo, label) {
  expect(bytes.length).toBeGreaterThan(100);
  await testInfo.attach(`${label}.pdf`, { body: bytes, contentType: 'application/pdf' });
  const parsed = await page.evaluate(async base64 => {
    // PDF.js reads the output; the application's writer is a different library, PDF-lib.
    const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const doc = await window.pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
    try {
      const pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const p = await doc.getPage(n), text = await p.getTextContent();
        pages.push({ rotation: p.rotate, view: p.view, text: text.items.map(item => item.str).filter(Boolean) });
      }
      return pages;
    } finally { await doc.destroy(); }
  }, bytes.toString('base64'));
  await testInfo.attach(`${label}-parsed.json`, { body: JSON.stringify(parsed, null, 2), contentType: 'application/json' });
  expect(parsed).toEqual(expectedText.map(text => ({ rotation: 90, view: [0, 0, 420, 595], text })));
  return parsed;
}

async function finishWrite(page, testInfo, label) {
  await page.waitForFunction(() => window.__pdfAudit.events.some(e => e.type === 'close-request' && e.phase === window.__pdfAudit.phase));
  const before = await page.evaluate(() => ({ output: window.__pdfAudit.output, saved: window.__pdfAudit.toasts.filter(t => t.text === window.__pdfAudit.savedMessage && t.phase === window.__pdfAudit.phase) }));
  expect(before).toEqual({ output: null, saved: [] });
  await page.evaluate(() => window.__pdfAudit.releaseClose());
  await page.waitForFunction(() => window.__pdfAudit.toasts.some(t => t.text === window.__pdfAudit.savedMessage && t.phase === window.__pdfAudit.phase));
  const output = await page.evaluate(() => window.__pdfAudit.output);
  expect(output).not.toBeNull();
  await parseOutput(page, Buffer.from(output), testInfo, label);
}

test.afterEach(async ({ page }, info) => {
  if (!page.__pdfRun) return;
  const browser = await page.evaluate(() => {
    const a = window.__pdfAudit;
    return a ? { mode: a.mode, phase: a.phase, events: a.events, toasts: a.toasts, drained: a.drained, committedBytes: a.output?.length ?? 0 } : null;
  }).catch(() => null);
  await info.attach('save-diagnostics.json', { body: JSON.stringify({ ...page.__pdfRun, browser }, null, 2), contentType: 'application/json' });
});

test('normal save: success follows close and the complete rotated PDF is preserved', async ({ context, page }, info) => {
  const run = await prepare(context, page, 'success');
  await page.locator('#btn-run-rotate').click();
  await finishWrite(page, info, 'normal-output');
  const events = await page.evaluate(() => window.__pdfAudit.events.map(e => e.type));
  expect(events).toEqual(['picker', 'createWritable', 'write', 'close-request', 'close-committed']);
  expect(run.downloads).toEqual([]);
  expect(run.pageErrors).toEqual([]);
});

test('denied write: the actual browser fallback downloads the whole rotated PDF', async ({ context, page }, info) => {
  const run = await prepare(context, page, 'write-denied');
  const downloaded = page.waitForEvent('download');
  await page.locator('#btn-run-rotate').click();
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe('acl-synthetic-two-pages_向き修正.pdf');
  await parseOutput(page, await readFile(await download.path()), info, 'fallback-output');
  const result = await page.evaluate(() => ({ events: window.__pdfAudit.events.map(e => e.type), output: window.__pdfAudit.output }));
  expect(result).toEqual({ events: ['picker', 'createWritable', 'write', 'write-denied'], output: null });
  expect(run.downloads).toHaveLength(1);
  expect(run.pageErrors).toEqual([]);
});

test('SAVE_COMPLETION: cancellation must not claim saved; the unchanged document can retry', async ({ context, page }, info) => {
  const run = await prepare(context, page, 'abort');
  await page.locator('#btn-run-rotate').click();
  await page.waitForFunction(() => window.__pdfAudit.drained);
  const cancelled = await page.evaluate(() => ({
    events: window.__pdfAudit.events.map(e => e.type), output: window.__pdfAudit.output,
    falseSaved: window.__pdfAudit.toasts.filter(t => t.text === window.__pdfAudit.savedMessage && !t.committed)
  }));
  expect(cancelled.events).toEqual(['picker', 'abort']);
  expect(cancelled.output).toBeNull();
  expect(run.downloads).toEqual([]);
  await info.attach('cancel-before-retry.png', { body: await page.screenshot(), contentType: 'image/png' });
  await info.attach('cancel-before-retry.json', { body: JSON.stringify(cancelled, null, 2), contentType: 'application/json' });
  await expect(page.locator('#rot-badge-1')).toHaveText('90°');
  await expect(page.locator('#rot-badge-2')).toHaveText('90°');
  await page.evaluate(() => { const a = window.__pdfAudit; a.mode = 'success'; a.phase = 1; });
  await page.locator('#btn-run-rotate').click();
  await finishWrite(page, info, 'retry-output');
  expect(run.downloads).toEqual([]);
  expect(run.pageErrors).toEqual([]);
  expect(cancelled.falseSaved, 'SAVE_COMPLETION: no output was committed after AbortError').toEqual([]);
});
