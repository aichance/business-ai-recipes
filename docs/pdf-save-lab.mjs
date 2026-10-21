const PIN = '87160462e342c039235531be49883113b1265e49';
const FILES = {
  "index.html": {
    "sha": "45ce527f6c9537ecc95bce1b025f2e489455b32d",
    "bytes": 39818,
    "mode": "100644"
  },
  "css/notion.css": {
    "sha": "1a56257e2012e41274c0f12e024be5e8708dc1d1",
    "bytes": 42825,
    "mode": "100644"
  },
  "js/libs/lucide.min.js": {
    "sha": "8299901f65f954a91796f39ca07e576f8d63d696",
    "bytes": 677835,
    "mode": "100644"
  },
  "js/libs/pdf.min.js": {
    "sha": "c31b6ab62a57edd79441ca939bb7e18fc1b09c63",
    "bytes": 320004,
    "mode": "100644"
  },
  "js/libs/pdf-lib.min.js": {
    "sha": "edb12c72cdaa11b608eb5967cf1531892b7f3b31",
    "bytes": 525099,
    "mode": "100644"
  },
  "js/libs/jszip.min.js": {
    "sha": "ff4cfd5e8fdc49176c2d1d409afa897f40be01f4",
    "bytes": 97630,
    "mode": "100644"
  },
  "js/libs/pdf.worker.min.js": {
    "sha": "12242260905b0f82831f735be91e231d17a1a57d",
    "bytes": 1087212,
    "mode": "100644"
  },
  "js/app.js": {
    "sha": "9594b0ea205d51a0f6023844bc6eb7b7819bf50a",
    "bytes": 141916,
    "mode": "100644"
  }
};
const FIXTURE = 'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSIC9GMiAzIDAgUgo+PgplbmRvYmoKMiAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYSAvRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZyAvTmFtZSAvRjEgL1N1YnR5cGUgL1R5cGUxIC9UeXBlIC9Gb250Cj4+CmVuZG9iagozIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhLUJvbGQgL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcgL05hbWUgL0YyIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udAo+PgplbmRvYmoKNCAwIG9iago8PAovQ29udGVudHMgOSAwIFIgL01lZGlhQm94IFsgMCAwIDQyMCA1OTUgXSAvUGFyZW50IDggMCBSIC9SZXNvdXJjZXMgPDwKL0ZvbnQgMSAwIFIgL1Byb2NTZXQgWyAvUERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJIF0KPj4gL1JvdGF0ZSAwIC9UcmFucyA8PAoKPj4gCiAgL1R5cGUgL1BhZ2UKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0NvbnRlbnRzIDEwIDAgUiAvTWVkaWFCb3ggWyAwIDAgNDIwIDU5NSBdIC9QYXJlbnQgOCAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNiAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDggMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago4IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgNCAwIFIgNSAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjkgMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjcwCj4+CnN0cmVhbQpHYXJvOjk1Qi9WJjtCbFMna2MyOEBkaShXYF5MXEVDX0FHKE9QKy9lLkRiWS0pSklwZWhlMUgjLXJfZyhMO1NEcikxbiNBaDdwLkQ9MnNoTkpNZC0lWkBOMGw4OXJlSilXXEpXRURQZ0swRkgpU0UucycsYW8kPlZjRSEyXU05azNubEprRCgwRE9lL3FTLUpmVUwnNzlJTUoiYyYoJF4oRktWLCVVQTxLOy44Qz40RmE1JHQjNmwuJHJaJl04RlE4VzFdTFpocmUyMVZNQG1nXDs3NyQuNyZfWkNccm5vYk8vIzVOQ0pLITdaYUs+aVdOIWIlPFtaXCkrPGlCRSNJT1pZYGxpUWtKPXFxfj5lbmRzdHJlYW0KZW5kb2JqCjEwIDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDI2OQo+PgpzdHJlYW0KR2Fybzk5bCNBWCY0UT9oJ21KPUZDPlFUNmUzdC9sQ2EuTGlpLCNdRidKWDtwMXNpYlNeW0oqSTEhaFUuJSRzITsmc05lNl00dWtcWiQ3RlIjNEZmOFlpI1IjY1w+XFdnbFAlWFBsOmVUXylWWzpuO28xLz9aK2JHU1QyQzlScS5mW0Y6UzlTNUAuPWg9JW0wXmF1MUA9KUItWWVYPSdPYEQ+LjFXP1BVMEtlRF0lJGNGO3FtXzFtK2VVZCF1LmVMTyg1UUlgak5xaFUpSCZNNk5uI0dKYmphTm9cMzQiIUkoK1dZazlbKlRSWElTSGQmPDs8Rmk5JXFgdFRuLydAbFFAb29eXE49Xik/fj5lbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCAxMQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwNjEgMDAwMDAgbiAKMDAwMDAwMDEwMiAwMDAwMCBuIAowMDAwMDAwMjA5IDAwMDAwIG4gCjAwMDAwMDAzMjEgMDAwMDAgbiAKMDAwMDAwMDUxNCAwMDAwMCBuIAowMDAwMDAwNzA4IDAwMDAwIG4gCjAwMDAwMDA3NzYgMDAwMDAgbiAKMDAwMDAwMTAzNyAwMDAwMCBuIAowMDAwMDAxMTAyIDAwMDAwIG4gCjAwMDAwMDE0NjIgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8MWMxNzgxOThmYmRmYTUxYjI1OTk1ZDg5ZDQxMDIwNDM+PDFjMTc4MTk4ZmJkZmE1MWIyNTk5NWQ4OWQ0MTAyMDQzPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA3IDAgUgovUm9vdCA2IDAgUgovU2l6ZSAxMQo+PgpzdGFydHhyZWYKMTgyMgolJUVPRgo=';
const TEXT = ['A', 'B'].map((tag, i) => [`ACL_SYNTHETIC_PAGE_${tag}`, `Page ${i + 1} of 2 - synthetic test only`, `${tag}_ITEM_001 = 12.50`, `${tag}_ITEM_002 = 99.75`, `${tag}_TOTAL = 112.25`]);
const scriptOrder = ['js/libs/lucide.min.js', 'js/libs/pdf.min.js', 'js/libs/pdf-lib.min.js', 'js/libs/jszip.min.js', 'js/libs/pdf.worker.min.js', 'js/app.js'];
const VARIANTS = {
  affected: { pin: PIN, label: '修正前', files: FILES },
  fixed: {
    pin: '12849c4c8960ab74e1dc78dbf93589d98dfa9280', label: '作者修正版',
    files: { ...FILES, 'js/app.js': { sha: '20f54bf1d198cf066b82b1c60f3e255be523696d', bytes: 142138, mode: '100644' } }
  }
};
const runButton = document.querySelector('#run'), fixedButton = document.querySelector('#run-fixed'), status = document.querySelector('#status');
const verifiedSources = new Map();
let generation = 0, currentFrame;

async function sources(variant) {
  if (verifiedSources.has(variant.pin)) return verifiedSources.get(variant.pin);
  const source = `https://raw.githubusercontent.com/yoshiki2024/PDF_Studio/${variant.pin}/`;
  const items = await Promise.all(Object.entries(variant.files).map(async ([path, expected]) => {
    const response = await fetch(source + path, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Source unavailable: ${path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== expected.bytes) throw new Error(`Source length mismatch: ${path}`);
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`), blob = new Uint8Array(header.length + bytes.length);
    blob.set(header); blob.set(bytes, header.length);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', blob)), b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== expected.sha) throw new Error(`Source hash mismatch: ${path}`);
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return [path, { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), base64: btoa(binary) }];
  }));
  const verified = Object.fromEntries(items);
  verifiedSources.set(variant.pin, verified);
  return verified;
}

// Runs only inside an opaque sandbox. Its only input is the embedded synthetic PDF.
function childBoot(config) {
  const send = payload => parent.postMessage({ kind: 'acl-pdf-save', nonce: config.nonce, ...payload }, '*');
  const fail = e => send({ type: 'result', result: { case: config.mode, state: 'INCONCLUSIVE', detail: String(e?.message || e).slice(0, 220) } });
  const audit = { mode: config.mode, phase: 0, events: [], toasts: [], output: null, pending: null, downloads: [], drained: false };
  const saved = '向きの変更が完了しました！新規ファイルとして保存されました。';
  let finished = false;
  const record = type => audit.events.push({ type, phase: audit.phase });
  const wait = predicate => new Promise((resolve, reject) => {
    const end = performance.now() + 20000;
    function check() { if (predicate()) resolve(); else if (performance.now() >= end) reject(new Error('Application checkpoint timed out')); else setTimeout(check, 0); }
    check();
  });
  new MutationObserver(records => {
    for (const change of records) for (const node of change.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE && node.matches('.toast')) audit.toasts.push({ text: node.textContent, phase: audit.phase, committed: audit.output !== null || audit.downloads.length > 0 });
    }
  }).observe(document, { childList: true, subtree: true });
  // Prevent real user files/navigation. Programmatic synthetic actions remain possible.
  window.fetch = async () => { throw new DOMException('Sandbox network disabled', 'SecurityError'); };
  XMLHttpRequest.prototype.open = function () { throw new DOMException('Sandbox network disabled', 'SecurityError'); };
  // The bundled PDF.js worker handler is preloaded below; use its main-thread fallback.
  window.Worker = undefined;
  for (const type of ['click', 'drop', 'paste', 'keydown']) document.addEventListener(type, event => { if (event.isTrusted) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  document.addEventListener('click', event => { if (event.target.closest?.('a')) event.preventDefault(); }, true);
  const nativeURL = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), blobs = new Map();
  URL.createObjectURL = blob => { const u = nativeURL(blob); blobs.set(u, blob); return u; };
  URL.revokeObjectURL = u => { revoke(u); blobs.delete(u); };
  HTMLAnchorElement.prototype.click = function () {
    const blob = blobs.get(this.href);
    if (!this.download || !blob) throw new Error('Non-synthetic download blocked');
    const output = { name: this.download, phase: audit.phase, bytes: null };
    audit.downloads.push(output);
    output.ready = blob.arrayBuffer().then(bytes => { output.bytes = new Uint8Array(bytes); });
  };
  window.showSaveFilePicker = async () => {
    record('picker');
    if (audit.mode === 'abort') {
      record('abort'); const channel = new MessageChannel();
      channel.port1.onmessage = () => { audit.drained = true; channel.port1.close(); channel.port2.close(); }; channel.port2.postMessage(null);
      throw new DOMException('ACL synthetic cancellation', 'AbortError');
    }
    return { createWritable: async () => {
      record('createWritable');
      return {
        write: async bytes => { record('write'); if (audit.mode === 'write-denied') { record('write-denied'); throw new DOMException('ACL synthetic write denied', 'NotAllowedError'); } audit.pending = new Uint8Array(bytes).slice(); },
        close: async () => { record('close-request'); await new Promise(resolve => { audit.release = resolve; }); audit.output = audit.pending; record('close-committed'); }
      };
    } };
  };
  async function parse(bytes) {
    const doc = await window.pdfjsLib.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    try {
      const result = [];
      for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i), t = await p.getTextContent(); result.push({ rotation: p.rotate, view: p.view, text: t.items.map(x => x.str).filter(Boolean) }); }
      const expected = config.text.map(text => ({ rotation: 90, view: [0, 0, 420, 595], text }));
      if (JSON.stringify(result) !== JSON.stringify(expected)) throw new Error('Complete output PDF differs from synthetic gold');
      return { pages: result.length, textFields: result.reduce((n, p) => n + p.text.length, 0), rotation: 90, exact: true };
    } finally { await doc.destroy(); }
  }
  async function completeWrite() {
    await wait(() => audit.events.some(e => e.type === 'close-request' && e.phase === audit.phase));
    if (audit.output || audit.toasts.some(t => t.text === saved && t.phase === audit.phase)) throw new Error('Success before close completed');
    audit.release();
    await wait(() => audit.toasts.some(t => t.text === saved && t.phase === audit.phase));
    if (!audit.output) throw new Error('No committed PDF');
    return parse(audit.output);
  }
  const runSynthetic = async () => {
    try {
      const input = document.querySelector('#file-input');
      if (!input || !window.pdfjsLib || !window.PDFLib) throw new Error('Application did not initialize');
      const bytes = Uint8Array.from(atob(config.pdf), c => c.charCodeAt(0)), transfer = new DataTransfer();
      transfer.items.add(new File([bytes], 'acl-synthetic-two-pages.pdf', { type: 'application/pdf' })); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(() => document.querySelector('#loaded-count').textContent === '1' && !document.querySelector('#mode-card-rotate').classList.contains('disabled'));
      document.querySelector('#mode-card-rotate').click();
      await wait(() => document.querySelectorAll('.rotate-card').length === 2);
      document.querySelector('#btn-rotate-all-cw').click();
      if (![1, 2].every(n => document.querySelector('#rot-badge-' + n).textContent === '90°')) throw new Error('Rotation setup failed');
      audit.toasts.length = 0;
      document.querySelector('#btn-run-rotate').click();
      let output, falseSaved = [], cancelEvidence;
      if (config.mode === 'success') output = await completeWrite();
      if (config.mode === 'write-denied') {
        await wait(() => audit.downloads.length === 1);
        await audit.downloads[0].ready;
        if (audit.output || JSON.stringify(audit.events.map(e => e.type)) !== JSON.stringify(['picker', 'createWritable', 'write', 'write-denied'])) throw new Error('Write rejection was not observed');
        output = await parse(audit.downloads[0].bytes);
      }
      if (config.mode === 'abort') {
        await wait(() => audit.drained);
        if (audit.output || audit.downloads.length || JSON.stringify(audit.events.map(e => e.type)) !== JSON.stringify(['picker', 'abort'])) throw new Error('Cancellation boundary not observed');
        falseSaved = audit.toasts.filter(t => t.text === saved && !t.committed);
        cancelEvidence = { pickerAbort: true, outputFiles: 0, savedMessages: falseSaved.map(t => t.text) };
        if (![1, 2].every(n => document.querySelector('#rot-badge-' + n).textContent === '90°')) throw new Error('Rotation lost before retry');
        audit.mode = 'success'; audit.phase = 1; document.querySelector('#btn-run-rotate').click();
        output = await completeWrite();
      }
      const result = { case: config.mode, state: falseSaved.length ? 'FAIL' : 'PASS', boundary: falseSaved.length ? 'SAVE_COMPLETION' : null, output, cancelEvidence, events: audit.events, downloads: audit.downloads.map(d => ({ name: d.name, bytes: d.bytes?.length ?? 0 })), toasts: audit.toasts };
      finished = true; send({ type: 'result', result });
    } catch (e) { finished = true; fail(e); }
  };
  window.addEventListener('error', event => { if (!finished) { finished = true; fail(event.error || event.message); } });
  // Execute hash-verified original JS, preserving script order and DOMContentLoaded.
  for (const source of config.scripts) { const s = document.createElement('script'); s.textContent = new TextDecoder().decode(Uint8Array.from(atob(source), c => c.charCodeAt(0))); document.head.appendChild(s); }
  document.addEventListener('DOMContentLoaded', runSynthetic);
}

function frameDocument(files, mode, nonce) {
  const doc = new DOMParser().parseFromString(files['index.html'].text, 'text/html');
  doc.querySelectorAll('script,link,base,meta[http-equiv]').forEach(e => e.remove());
  const csp = doc.createElement('meta'); csp.httpEquiv = 'Content-Security-Policy';
  csp.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
  doc.head.prepend(csp);
  const css = doc.createElement('style'); css.textContent = files['css/notion.css'].text; doc.head.append(css);
  const boot = doc.createElement('script');
  boot.textContent = `(${childBoot.toString()})(${JSON.stringify({ mode, nonce, pdf: FIXTURE, text: TEXT, scripts: scriptOrder.map(p => files[p].base64) })});`;
  doc.body.append(boot);
  return '<!doctype html>' + doc.documentElement.outerHTML;
}

async function runCase(files, mode, run) {
  currentFrame?.remove();
  const frame = document.createElement('iframe'), nonce = crypto.randomUUID();
  frame.setAttribute('sandbox', 'allow-scripts'); frame.tabIndex = -1; frame.setAttribute('aria-hidden', 'true'); frame.title = 'Synthetic PDF Studio preview';
  const preview = document.querySelector('#preview'); preview.replaceChildren(frame); currentFrame = frame;
  return new Promise(resolve => {
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timeout); window.removeEventListener('message', receive); resolve(result); };
    const receive = event => {
      if (run !== generation || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.kind !== 'acl-pdf-save' || event.data.nonce !== nonce || event.data.type !== 'result') return;
      const result = event.data.result;
      if (!result || result.case !== mode || !['PASS', 'FAIL', 'INCONCLUSIVE'].includes(result.state)) return;
      if (JSON.stringify(result).length > 30000) return;
      finish(result);
    };
    const timeout = setTimeout(() => { frame.remove(); finish({ case: mode, state: 'INCONCLUSIVE', detail: 'Sandbox timed out' }); }, 45000);
    window.addEventListener('message', receive);
    frame.srcdoc = frameDocument(files, mode, nonce);
  });
}

async function runVariant(id) {
  if (runButton.disabled) return;
  const variant = VARIANTS[id], row = document.querySelector(`[data-variant="${id}"]`);
  const run = ++generation, started = performance.now(), results = [];
  runButton.disabled = fixedButton.disabled = true; document.querySelector('#report-section').hidden = true;
  document.querySelector('#report').textContent = '';
  document.querySelector('#copy').textContent = 'レポートをコピー';
  document.querySelector('#measured-version').textContent = `${variant.label} @ ${variant.pin.slice(0, 8)} の結果`;
  const sourceLink = document.querySelector('#source-link');
  sourceLink.href = `https://github.com/yoshiki2024/PDF_Studio/tree/${variant.pin}`;
  sourceLink.textContent = `PDF_Studio@${variant.pin.slice(0, 8)} (${variant.label})`;
  row.querySelector('[data-measured-at]').textContent = '実行中';
  for (const cell of row.querySelectorAll('[data-result]')) { cell.removeAttribute('data-state'); cell.textContent = '測定中'; }
  for (const card of document.querySelectorAll('.check')) { card.removeAttribute('data-state'); card.querySelector('.pill').textContent = '未実行'; card.querySelector('p').textContent = 'この版の検証を準備しています…'; }
  try {
    status.textContent = `${variant.label}の公開ソースを取得し、8ファイルのハッシュを確認しています…`;
    const files = await sources(variant);
    for (const [i, mode] of ['success', 'write-denied', 'abort'].entries()) {
      status.textContent = `${variant.label} ${i + 1}/3 実アプリで検証しています…`;
      const result = await runCase(files, mode, run); results.push(result);
      const card = document.querySelector(`[data-case="${mode}"]`); card.dataset.state = result.state; card.querySelector('.pill').textContent = result.state === 'INCONCLUSIVE' ? '判定不能' : result.state;
      card.querySelector('p').textContent = result.state === 'INCONCLUSIVE' ? result.detail : mode === 'abort' ? result.state === 'FAIL' ? 'キャンセル後、出力0件でも保存成功を表示。再試行のPDFは全2ページ正常。' : 'キャンセル時の誤った成功表示なし。再試行のPDFは全2ページ正常。' : '全2ページ・10個のテキスト・順序・90°回転が一致しました。';
      const cell = row.querySelector(`[data-result="${mode}"]`); cell.dataset.state = result.state; cell.textContent = result.state === 'INCONCLUSIVE' ? '判定不能' : result.state;
    }
    const counts = Object.fromEntries(['PASS', 'FAIL', 'INCONCLUSIVE'].map(s => [s, results.filter(r => r.state === s).length]));
    document.querySelector('#summary').textContent = `${variant.label}: ${counts.PASS} PASS / ${counts.FAIL} FAIL${counts.INCONCLUSIVE ? ` / ${counts.INCONCLUSIVE} 判定不能` : ''}`;
    const report = { tool: 'App Crash Lab / PDF save completion', measuredAt: new Date().toISOString(), sourceVariant: id, sourcePin: variant.pin, sourceFiles: Object.keys(variant.files).length, sourceBlobs: variant.files, elapsedMs: Math.round(performance.now() - started), syntheticOnly: true, saveApisSimulated: true, realOsWriteTested: false, browserFallbackIntercepted: true, counts, results };
    row.querySelector('[data-measured-at]').textContent = new Date(report.measuredAt).toLocaleTimeString('ja-JP');
    document.querySelector('#report').textContent = JSON.stringify(report, null, 2);
    document.querySelector('#report-section').hidden = false;
    status.textContent = counts.INCONCLUSIVE ? '一部の検証を完了できませんでした。準備失敗は成功に数えていません。' : '検証完了。結果はこのブラウザ内だけに保持しています。';
  } catch (e) {
    currentFrame?.remove(); status.textContent = `判定不能：${String(e.message).slice(0, 180)}`;
    for (const card of document.querySelectorAll('.check')) { card.dataset.state = 'INCONCLUSIVE'; card.querySelector('.pill').textContent = '判定不能'; card.querySelector('p').textContent = 'この版の検証を準備できませんでした。取得した結果はありません。'; }
    for (const cell of row.querySelectorAll('[data-result]')) { cell.dataset.state = 'INCONCLUSIVE'; cell.textContent = '判定不能'; }
    row.querySelector('[data-measured-at]').textContent = '準備失敗';
  } finally { runButton.disabled = fixedButton.disabled = false; }
}
runButton.addEventListener('click', () => runVariant('affected'));
fixedButton.addEventListener('click', () => runVariant('fixed'));
document.querySelector('#copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(document.querySelector('#report').textContent); document.querySelector('#copy').textContent = 'コピーしました'; }
  catch { document.querySelector('details').open = true; document.querySelector('#copy').textContent = '下のレポートを選択してコピー'; }
});
