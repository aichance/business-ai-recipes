/*
MIT License

Copyright (c) 2026 Naoya / jokv213

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { writeFile } from 'node:fs/promises';

const LIBRARY_VERSION = '0.7.0-experimental.1';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const describeError = error => { try { return error instanceof Error ? error.message : String(error); } catch { return 'Non-Error thrown value'; } };
const httpOrigin = url => { try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) ? u.origin : null; } catch { return null; } };

function validate(probes, timeoutMs) {
  if (!Array.isArray(probes) || probes.length < 1 || probes.length > 16) throw new Error('Select 1–16 application probes');
  const names = new Set();
  for (const p of probes) {
    if (typeof p?.name !== 'string' || !p.name || names.has(p.name)) throw new Error('Probe names must be nonempty and unique');
    names.add(p.name);
    if (!['localStorage', 'sessionStorage', 'indexedDB'].includes(p.source)) throw new Error('Unsupported probe source');
    if (['localStorage', 'sessionStorage'].includes(p.source) && typeof p.key !== 'string') throw new Error(`${p.source} requires a string key`);
    if (p.source === 'indexedDB' && (typeof p.database !== 'string' || !p.database || typeof p.store !== 'string' || !p.store
        || !(typeof p.key === 'string' || (typeof p.key === 'number' && Number.isFinite(p.key))))) throw new Error('IndexedDB requires database, store and a string/number key');
    if (p.pointer !== undefined) {
      if (typeof p.pointer !== 'string' || (p.pointer !== '' && !p.pointer.startsWith('/'))
          || /~(?![01])/.test(p.pointer) || p.pointer.split('/').length > 33
          || new TextEncoder().encode(p.pointer).byteLength > 2048) throw new Error('pointer must be an RFC6901 JSON pointer with at most32 segments and2048 UTF8 bytes');
      if (p.source !== 'indexedDB' && p.json !== true) throw new Error('Web Storage pointer selection requires json:true');
    }
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 5000) throw new Error('timeoutMs must be50–5000');
}

async function readProbe(page, probe, timeoutMs, expectedOrigin) {
  const json = await page.evaluate(async ({ probe: p, timeout, expectedOrigin }) => {
    async function observeSelected() {
    if (location.origin !== expectedOrigin) return { status: 'INCONCLUSIVE', reason: 'Origin changed before reading the selected data' };
    function plain(value, undefinedPaths, datePaths, seen = new WeakSet(), depth = 0, path = '') {
      if (depth > 12) throw new Error('Selected value exceeds depth12');
      if (value === undefined) { undefinedPaths.push(path); return null; }
      if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'object' && Object.prototype.toString.call(value) === '[object Date]') {
        if (!Number.isFinite(Date.prototype.getTime.call(value))) throw new Error('Selected Date value is invalid');
        datePaths.push(path);
        return Date.prototype.toISOString.call(value);
      }
      if (typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]' && !Array.isArray(value)) throw new Error('Selected value is not plain JSON');
      if (seen.has(value)) throw new Error('Selected value contains a cycle');
      seen.add(value);
      if (Array.isArray(value) && (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, i) => !Object.hasOwn(value, i)).some(Boolean))) throw new Error('Sparse or extended arrays are not plain JSON');
      const childPath = key => `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
      const result = Array.isArray(value) ? value.map((x, i) => plain(x, undefinedPaths, datePaths, seen, depth + 1, childPath(i)))
        : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v, undefinedPaths, datePaths, seen, depth + 1, childPath(k))]));
      seen.delete(value);
      return result;
    }
    function normalize(exists, value) {
      const pointed = p.pointer !== undefined;
      let selectedExists = exists;
      if (pointed && exists && p.pointer !== '') {
        for (const part of p.pointer.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'))) {
          if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)
              || (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(part) || !Number.isSafeInteger(Number(part)) || Number(part) >= value.length))) {
            selectedExists = false; break;
          }
          value = value[part];
        }
      }
      const undefinedPaths = [], datePaths = [];
      const normalized = selectedExists ? plain(value, undefinedPaths, datePaths) : null;
      undefinedPaths.sort(); datePaths.sort();
      const annotations = { ...(undefinedPaths.length ? { undefinedPaths } : {}), ...(datePaths.length ? { datePaths } : {}) };
      const selection = pointed ? { selection: { pointer: p.pointer, exists: selectedExists } } : {};
      const representation = pointed || undefinedPaths.length || datePaths.length ? { value: normalized, ...annotations, ...selection } : normalized;
      if (new TextEncoder().encode(JSON.stringify(representation)).byteLength > 65536) throw new Error('Selected value exceeds64KiB');
      return { status: 'OBSERVED', exists, value: normalized, ...selection,
        ...(datePaths.length ? { valueEncoding: 'json-with-type-paths-v1', ...annotations }
          : undefinedPaths.length ? { valueEncoding: 'json-with-undefined-paths-v1', undefinedPaths } : {}) };
    }
    try {
      if (p.source === 'localStorage' || p.source === 'sessionStorage') {
        const area = p.source === 'localStorage' ? localStorage : sessionStorage;
        const value = area.getItem(p.key);
        if (value === null || p.json !== true) return normalize(value !== null, value);
        if (p.pointer !== undefined && new TextEncoder().encode(value).byteLength > 4 * 1024 * 1024) throw new Error('Selected JSON text exceeds4MiB input limit');
        let parsed;
        try { parsed = JSON.parse(value); }
        catch (error) { if (p.pointer !== undefined) throw new Error('Selected JSON text is malformed'); throw error; }
        return normalize(true, parsed);
      }
      if (typeof indexedDB.databases !== 'function') throw new Error('Database existence cannot be checked');
      // Never enumerate or export app records; check that the selected database exists first.
      const databases = await Promise.race([
        indexedDB.databases(), new Promise((_, reject) => setTimeout(() => reject(new Error('Database listing timed out')), timeout)),
      ]);
      if (!databases.some(db => db.name === p.database)) throw new Error('Selected database does not exist');
      return await new Promise(resolve => {
        let db, tx, settled = false;
        const finish = result => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          if (db) db.close();
          resolve(result);
        };
        const fail = message => finish({ status: 'INCONCLUSIVE', reason: message });
        const timer = setTimeout(() => { if (tx) { try { tx.abort(); } catch {} } fail('Selected database read timed out'); }, timeout);
        const request = indexedDB.open(p.database);
        request.onupgradeneeded = () => {
          // It disappeared between listing and open: abort creation, close the late result.
          request.transaction.abort();
          fail('Selected database disappeared before observation');
        };
        request.onerror = () => fail(request.error?.message || 'Database open failed');
        request.onblocked = () => fail('Selected database is blocked');
        request.onsuccess = () => {
          db = request.result;
          if (settled) { db.close(); return; }
          if (!db.objectStoreNames.contains(p.store)) { fail('Selected object store does not exist'); return; }
          try {
            tx = db.transaction(p.store, 'readonly');
            const store = tx.objectStore(p.store), key = store.getKey(p.key), value = store.get(p.key);
            tx.onerror = () => fail(tx.error?.message || 'Database transaction failed');
            tx.onabort = () => fail('Database transaction aborted');
            tx.oncomplete = () => { try { finish(normalize(key.result !== undefined, value.result)); } catch (error) { fail(error.message); } };
          } catch (error) { fail(error.message); }
        };
      });
    } catch (error) { return { status: 'INCONCLUSIVE', reason: error?.message || String(error) }; }
    }
    // Preserve JSON keys such as __proto__ across the browser protocol serializer.
    return JSON.stringify(await observeSelected());
  }, { probe, timeout: timeoutMs, expectedOrigin });
  return JSON.parse(json);
}

export function differences(before, after, path = '$', output = []) {
  if (JSON.stringify(before) === JSON.stringify(after)) return output;
  if (before && after && typeof before === 'object' && typeof after === 'object'
      && Array.isArray(before) === Array.isArray(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) differences(Object.hasOwn(before, key) ? before[key] : undefined, Object.hasOwn(after, key) ? after[key] : undefined, `${path}.${key}`, output);
  } else output.push({ path, before: before === undefined ? '(missing)' : before, after: after === undefined ? '(missing)' : after });
  return output;
}

export function renderTimeline(report) {
  const json = JSON.stringify(report).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>State Lens · ${escape(report.title)}</title>
<style>body{margin:0;background:#0e1720;color:#e8f0f7;font:16px system-ui}main{max-width:1400px;margin:auto;padding:28px}h1{font-size:42px;margin:10px 0}small{color:#98adbf}button{font:inherit;display:block;width:100%;padding:14px;text-align:left;background:#203141;color:inherit;border:1px solid #354d61;border-radius:10px;margin-bottom:10px;cursor:pointer}button[aria-pressed=true]{border-color:#b3f16d;color:#b3f16d}.layout{display:grid;grid-template-columns:260px 1fr;gap:20px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:18px}img{width:100%;border-radius:12px}pre{font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#192938;padding:16px;border-radius:12px}.delta{border-left:4px solid #eebc64}.badge{color:#b3f16d}@media(max-width:800px){.layout,.cards{grid-template-columns:1fr}}</style>
<main><small>SELECTED APPLICATION DATA · LOCAL OBSERVATIONS · State Lens ${escape(report.libraryVersion ?? 'unspecified')}</small><h1>${escape(report.title)}</h1><p>UI steps beside the data they leave behind.</p><div class="layout"><nav id="steps" aria-label="Recorded checkpoints"></nav><section><h2 id="label"></h2><p id="status" class="badge"></p><div class="cards"><div><img id="screen" alt="Application screenshot at this checkpoint"><p><small id="screen-status"></small></p></div><div><h3>Changes since the preceding checkpoint</h3><pre id="changes" class="delta"></pre><h3>Selected values</h3><p id="value-note"></p><pre id="values"></pre></div></div></section></div><p><small>Snapshots are observations, not database commit timestamps, causal proof or assertions that all data is correct. INCONCLUSIVE is not absent or PASS. This file includes only the selected data and captured viewport, and stays local unless you share it.</small></p></main>
<script type="application/json" id="data">${json}</script><script>
const r=JSON.parse(document.getElementById('data').textContent), nav=document.getElementById('steps');
const annotated=r.checkpoints.some(c=>Object.values(c.values).some(v=>v.undefinedPaths?.length));
const dated=r.checkpoints.some(c=>Object.values(c.values).some(v=>v.datePaths?.length));
function select(i){const c=r.checkpoints[i];document.getElementById('label').textContent=c.label;document.getElementById('status').textContent=c.action.status+' · '+c.observedAt+' · '+(c.origin||'no HTTP origin')+' · '+c.scopeStatus;document.getElementById('changes').textContent=JSON.stringify(c.changes,null,2);document.getElementById('values').textContent=JSON.stringify(c.values,null,2);document.getElementById('value-note').textContent=[(r.probes||[]).some(p=>typeof p.pointer==='string')?'JSON pointer selection: only configured paths are observed, not the whole saved record. exists describes the storage key; selection.exists describes the path. When that path is absent, value:null is a placeholder. Type paths below are relative to the selected value.':'',annotated?'Annotated JSON projection: null at each undefinedPaths pointer represents an observed undefined, not a saved null. Pointers escape ~ and /; an empty pointer means the entire selected value.':'',dated?'Valid Date values are ISO strings at datePaths pointers, not saved plain strings. Pointers escape ~ and /; an empty pointer means the entire selected value.':''].filter(Boolean).join(' ');const img=document.getElementById('screen');img.hidden=!c.screenshot;if(c.screenshot)img.src='data:image/png;base64,'+c.screenshot;else img.removeAttribute('src');document.getElementById('screen-status').textContent=c.screenshotError||'';[...nav.children].forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));}
r.checkpoints.forEach((c,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'. '+c.label;b.onclick=()=>select(i);nav.appendChild(b)});if(r.checkpoints.length)select(0);
</script></html>`;
}

/**
 * @typedef {({name:string, source:'localStorage'|'sessionStorage', key:string} & ({json?:boolean, pointer?:never} | {json:true, pointer:string})) | {name:string, source:'indexedDB', database:string, store:string, key:string|number, pointer?:string}} StateLensProbe
 * @typedef {{probes?:ReadonlyArray<StateLensProbe>, timeoutMs?:number, screenshots?:boolean, title?:string}} StateLensOptions
 */
/** @param {any} page An existing Playwright Page. @param {StateLensOptions} [options] */
export function createStateLens(page, { probes, timeoutMs = 750, screenshots = true, title = 'What happened to the saved data?' } = {}) {
  validate(probes, timeoutMs);
  const selected = structuredClone(probes), checkpoints = [];
  let running = false, selectedOrigin = httpOrigin(page.url());
  async function capture(label, action) {
    const url = page.url(), origin = httpOrigin(url);
    if (!selectedOrigin && origin) selectedOrigin = origin;
    let inScope = origin !== null && origin === selectedOrigin;
    const values = {};
    for (const p of selected) {
      try { Object.defineProperty(values, p.name, { enumerable: true, configurable: true, writable: true, value: inScope ? await readProbe(page, p, timeoutMs, selectedOrigin) : { status: 'INCONCLUSIVE', reason: 'Outside the first selected HTTP origin' } }); }
      catch (error) { Object.defineProperty(values, p.name, { enumerable: true, configurable: true, writable: true, value: { status: 'INCONCLUSIVE', reason: describeError(error) } }); }
    }
    let screenshot = null, screenshotError = null;
    if (screenshots && inScope && httpOrigin(page.url()) === origin) {
      try { screenshot = (await page.screenshot({ type: 'png', timeout: 3000 })).toString('base64'); }
      catch (error) { screenshotError = describeError(error); }
    }
    if (httpOrigin(page.url()) !== origin) {
      inScope = false; screenshot = null;
      for (const p of selected) values[p.name] = { status: 'INCONCLUSIVE', reason: 'Origin changed during the sequential observation' };
    }
    const previous = checkpoints.at(-1)?.values;
    const sameScope = inScope && checkpoints.at(-1)?.origin === origin && checkpoints.at(-1)?.scopeStatus === 'SELECTED_ORIGIN';
    const c = { index: checkpoints.length, label, observedAt: new Date().toISOString(), url, endURL: page.url(), origin, selectedOrigin, scopeStatus: inScope ? 'SELECTED_ORIGIN' : 'OUTSIDE_ORIGIN', action, values,
      changes: previous && sameScope ? differences(previous, values) : [], screenshot, screenshotError };
    checkpoints.push(c); return structuredClone(c);
  }
  return {
    async checkpoint(label) {
      if (running) throw new Error('Overlapping steps are not supported');
      running = true;
      try { return await capture(label, { status: 'CHECKPOINT' }); } finally { running = false; }
    },
    async step(label, action) {
      if (running) throw new Error('Overlapping steps are not supported');
      running = true;
      try {
        await capture(`${label} · before`, { status: 'BEFORE' });
        try { const value = await action(); await capture(`${label} · after`, { status: 'COMPLETED' }); return value; }
        catch (error) { await capture(`${label} · failed`, { status: 'FAILED', error: describeError(error) }); throw error; }
      } finally { running = false; }
    },
    report() { return { schema: 4, libraryVersion: LIBRARY_VERSION, title, probes: structuredClone(selected), checkpoints: structuredClone(checkpoints) }; },
    async writeHTML(path) { await writeFile(path, renderTimeline(this.report()), { flag: 'wx', mode: 0o600 }); },
  };
}
