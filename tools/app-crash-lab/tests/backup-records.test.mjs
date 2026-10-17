import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { validateContract } from '../lib/contract.mjs';
import { runContract } from '../lib/runner.mjs';
import { executeBackupRoundtrip, executeCheck, confineContext } from '../lib/protocol.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const records = [
  { id: 'b', title: 'PRIVATE_RECORD_B', nested: { amount: 42, tags: ['study'] } },
  { id: 'a', title: 'PRIVATE_RECORD_A', nested: { amount: 12, tags: [] } },
];
const details = [{ id: 2, note: 'PRIVATE_DETAIL', epoch: 1 }];
const whole = store => ({ source: 'indexedDB', database: 'record-vault', store, field: 'records', keyPath: 'id', maxEntries: 128, maxBytes: 262144 });
const base = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Whole inline record backup',
  baseURL: 'http://127.0.0.1:1', path: '/', timeoutMs: 2000, stabilityMs: 25, reset: [],
  setup: [
    { action: 'click', target: { css: '#open' } },
    { action: 'click', target: { css: '#seed' }, save: true },
    { action: 'expectText', target: { css: '#status' }, value: 'Saved' },
  ],
  observe: { records: whole('records'), details: whole('details'), setting: { source: 'indexedDB', database: 'record-vault', store: 'settings', key: 'app_settings', field: 'value', jsonPath: ['value'] } },
  expected: { setting: { theme: 'dark' } },
  checks: ['backup-roundtrip'],
  backupRoundtrip: {
    isolation: 'browser-local',
    export: { steps: [{ action: 'click', target: { css: '#export' } }], maxBytes: 65536, statePaths: { records: ['records'], details: ['details'], setting: ['settings'] } },
    restore: {
      path: '/', prepare: [{ action: 'click', target: { css: '#open' } }],
      ready: [{ action: 'expectVisible', target: { css: '#file' } }],
      empty: { records: [], details: [], setting: { theme: 'system' } },
      target: { css: '#file' }, mimeType: 'application/json',
      success: { observe: { status: { source: 'text', target: { css: '#status' } } }, expected: { status: 'Restored' } },
    },
  },
};

async function fixture() {
  // Authored controls; no third-party app or saved user data is modified.
  const html = `<!doctype html><meta charset="utf-8"><button id="open">Open settings</button><button id="seed">Save full records</button><button id="export">Export</button><input id="file" type="file" hidden><p id="status">Loading</p><script>
    const mode = new URLSearchParams(location.search).get('mode');
    const outOfLine = mode?.startsWith('out-of-line');
    const behavior = outOfLine ? mode.slice('out-of-line-'.length) : mode;
    const done = tx => new Promise((resolve,reject) => {tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)});
    const get = r => new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
    const ready = mode === 'missing-db' ? Promise.resolve(null) : new Promise((resolve,reject)=>{
      const r=indexedDB.open('record-vault',1);
      r.onupgradeneeded=()=>{r.result.createObjectStore('records',outOfLine?{autoIncrement:behavior==='auto-increment'}:{keyPath:'id'});r.result.createObjectStore('details',{keyPath:'id'});r.result.createObjectStore('settings',{keyPath:'key'})};
      r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(r.error);
    });
    async function save(data) {
      const db=await ready;if(!db)return;
      const tx=db.transaction(['records','details','settings'],'readwrite');
      tx.objectStore('records').clear();tx.objectStore('details').clear();
      for(const value of data.records) {
        const externalKey=behavior==='key-mismatch'?String(value.id)+'-wrong':behavior==='key-type-mismatch'?['external',value.id]:value.id??'missing-identity-key';
        outOfLine?tx.objectStore('records').put(value,externalKey):tx.objectStore('records').put(value);
      }
      for(const value of data.details)tx.objectStore('details').put(value);
      tx.objectStore('settings').put({key:'app_settings',value:data.settings});await done(tx);
    }
    async function snapshot() {
      const db=await ready;if(!db)return{records:[],details:[],settings:null};
      const tx=db.transaction(['records','details','settings'],'readonly');
      const [records,details,settings]=await Promise.all([get(tx.objectStore('records').getAll()),get(tx.objectStore('details').getAll()),get(tx.objectStore('settings').get('app_settings'))]);
      return {records,details,settings:settings?.value??null};
    }
    document.querySelector('#open').onclick=async()=>{
      if(behavior==='prepare-dialog')confirm('PRIVATE_UNEXPECTED_DIALOG');
      const db=await ready;
      if(db){const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put({key:'app_settings',value:{theme:'system'}});await done(tx)}
      document.querySelector('#file').hidden=false;document.querySelector('#status').textContent='Ready';
    };
    document.querySelector('#seed').onclick=async()=>{
      const data={records:${JSON.stringify(records)},details:${JSON.stringify(details)},settings:{theme:'dark'}};
      if(behavior==='undefined')data.records[0].optional=undefined;
      if(behavior==='negative-zero')data.records[0].special=-0;
      if(behavior==='date')data.records[0].special=new Date();
      if(behavior==='cycle')data.records[0].cycle=data.records[0];
      if(behavior==='binary')data.records[0].special=new Uint8Array([1]).buffer;
      if(behavior==='mixed-keys')data.records=[{id:2,title:'number'},{id:'2',title:'string'},{id:['a',2],title:'array'}];
      if(behavior==='unicode')data.records[0].title='日本語🍵';
      if(behavior==='empty-records'){data.records=[];data.details=[]}
      if(behavior==='atomic-race'){data.records=[{id:'one',epoch:1}];data.details=[{id:'meta',epoch:1}]}
      if(behavior==='missing-identity')delete data.records[0].id;
      await save(data);
      if(behavior==='atomic-race'){
        const open=IDBObjectStore.prototype.openCursor;let queued=false;
        IDBObjectStore.prototype.openCursor=function(...args){
          const r=open.apply(this,args);
          if(!queued){
            queued=true;const tx=this.transaction.db.transaction(['records','details'],'readwrite');
            tx.objectStore('records').put({id:'one',epoch:2});tx.objectStore('details').put({id:'meta',epoch:2});
          }
          return r;
        };
      }
      if(['cursor-error','cursor-abort','cursor-stall'].includes(behavior)){
        const open=IDBObjectStore.prototype.openCursor;
        IDBObjectStore.prototype.openCursor=function(...args){
          if(behavior==='cursor-stall')return {};
          const r=open.apply(this,args),tx=this.transaction;
          if(behavior==='cursor-error')queueMicrotask(()=>r.dispatchEvent(new Event('error')));
          if(behavior==='cursor-abort')r.addEventListener('success',()=>{try{tx.abort()}catch{}});
          return r;
        };
      }
      if(behavior==='wrong-inline-key'){
        const original=Object.getOwnPropertyDescriptor(IDBCursorWithValue.prototype,'value').get;
        Object.defineProperty(IDBCursorWithValue.prototype,'value',{get(){return {...original.call(this),id:'wrong'}}});
      }
      document.querySelector('#status').textContent='Saved';
    };
    document.querySelector('#export').onclick=async()=>{
      const data=await snapshot();data.records.reverse();
      if(behavior==='duplicate-export')data.records.push(data.records[0]);
      if(behavior==='missing-export')data.records.pop();
      if(behavior==='extra-export')data.records.push({id:'extra',title:'PRIVATE_EXTRA'});
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.download='PRIVATE_FILENAME.json';a.click();
    };
    document.querySelector('#file').onchange=async event=>{
      const data=JSON.parse(await event.target.files[0].text());
      if(behavior==='drop-import')data.records.pop();
      if(behavior==='rewrite-id')data.records[0].id='rewritten';
      if(behavior==='drift-import')data.records[0].nested.amount++;
      if(behavior==='field-loss')delete data.records[0].nested.tags;
      if(behavior==='field-extra')data.records[0].unexpected=true;
      await save(data);sessionStorage.setItem('restored','yes');document.querySelector('#status').textContent='Restored';
    };
    ready.then(async db=>{
      if(behavior==='broken-reload'&&sessionStorage.getItem('restored')){const data=await snapshot();data.records.pop();await save(data)}
      document.querySelector('#status').textContent='Ready';
    });
  </script>`;
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

test('records contract bounds and fresh preparation are explicit opt-ins', () => {
  assert.doesNotThrow(() => validateContract(base));
  const bad = change => { const c = structuredClone(base); change(c); assert.throws(() => validateContract(c), /Invalid contract/); };
  for (const field of ['keyPath', 'maxEntries', 'maxBytes']) bad(c => delete c.observe.records[field]);
  for (const [key, value] of [['key', 'a'], ['parse', 'json'], ['jsonPath', ['title']], ['keyPath', 'nested.id'], ['maxEntries', 0], ['maxEntries', 4097], ['maxBytes', 1], ['maxBytes', 1048577], ['keyMode', 'mixed'], ['keyMode', null]]) bad(c => { c.observe.records[key] = value; });
  bad(c => { c.observe.setting.keyMode = 'out-of-line'; });
  bad(c => { c.backupRoundtrip.restore.success.observe.status.keyMode = 'out-of-line'; });
  bad(c => { c.observe.duplicate = structuredClone(c.observe.records); });
  bad(c => { c.observe.oneRecord = { source: 'indexedDB', database: 'record-vault', store: 'records', key: 'a' }; });
  for (const action of ['goto', 'request', 'setFile']) bad(c => { c.backupRoundtrip.restore.prepare = [{ action, path: '/', target: { css: '#file' }, file: { name: 'a', mimeType: 'text/plain', text: '' } }]; });
  bad(c => { c.backupRoundtrip.restore.prepare = Array.from({ length: 33 }, () => ({ action: 'click', target: { css: '#open' } })); });
});

test('whole records preserve IDs, values and fresh preparation through real backup flow', { timeout: 300000 }, async t => {
  const app = await fixture();
  const browser = await chromium.launch();
  await mkdir(join(root, '.crash-lab'), { recursive: true });
  const dir = await mkdtemp(join(root, '.crash-lab/records-test-'));
  const contract = (mode = '', change = () => {}) => {
    const c = structuredClone(base); c.baseURL = app.origin; c.path = c.backupRoundtrip.restore.path = `/?mode=${mode}`; change(c); return validateContract(c);
  };
  const run = (mode, change) => executeBackupRoundtrip(browser, contract(mode, change));
  try {
    await t.test('normal UI initialization, unordered export and exact full records pass', async () => {
      const r = await run(''); assert.equal(r.status, 'pass', JSON.stringify(r));
      assert.ok(r.events.some(e => e.phase === 'target-prepare' && e.status === 'completed'));
      const serialized = JSON.stringify(r);
      for (const privateValue of ['PRIVATE_RECORD', 'PRIVATE_DETAIL', 'PRIVATE_FILENAME', 'PRIVATE_UNEXPECTED']) assert.equal(serialized.includes(privateValue), false);
    });
    const external = change => c => { c.observe.records.keyMode = 'out-of-line'; change?.(c); };
    await t.test('source-ready projections use the same complete IndexedDB records and remain source-only', async () => {
      const ready = c => { c.backupRoundtrip.sourceReady = {
        observe: {
          firstId: { observation: 'records', jsonPath: [0, 'id'] },
          firstAmount: { observation: 'records', jsonPath: [0, 'nested', 'amount'] },
          detailEpoch: { observation: 'details', jsonPath: [0, 'epoch'] },
        },
        expected: { firstId: 'a', firstAmount: 12, detailEpoch: 1 },
      }; };
      for (const [mode, change] of [['', ready], ['out-of-line', external(ready)]]) {
        assert.equal((await run(mode, change)).status, 'pass');
      }
      assert.equal((await run('field-loss', ready)).status, 'fail');
      assert.equal((await run('out-of-line-broken-reload', external(ready))).status, 'fail');
    });
    await t.test('out-of-line keys require explicit mode and retain full typed identities', async () => {
      for (const mode of ['out-of-line', 'out-of-line-mixed-keys']) {
        const r = await run(mode, external()); assert.equal(r.status, 'pass', JSON.stringify(r));
      }
      for (const mode of ['out-of-line-key-mismatch', 'out-of-line-key-type-mismatch', 'out-of-line-missing-identity', 'out-of-line-auto-increment', 'out-of-line-undefined', 'out-of-line-date', 'out-of-line-binary']) {
        const r = await run(mode, external()); assert.equal(r.status, 'inconclusive', JSON.stringify(r));
        for (const marker of ['PRIVATE_RECORD', 'PRIVATE_DETAIL', 'PRIVATE_FILENAME', 'b-wrong', 'a-wrong']) assert.equal(JSON.stringify(r).includes(marker), false);
      }
      const inline = await run('', external()); assert.equal(inline.status, 'inconclusive');
      const wrongMode = await run('out-of-line', c => { c.observe.records.keyMode = 'inline'; }); assert.equal(wrongMode.status, 'inconclusive');
    });
    await t.test('out-of-line import and reload losses still fail', async () => {
      for (const mode of ['drop-import', 'rewrite-id', 'drift-import', 'field-loss', 'field-extra', 'broken-reload', 'duplicate-export', 'missing-export', 'extra-export']) {
        const r = await run(`out-of-line-${mode}`, external()); assert.equal(r.status, 'fail', JSON.stringify(r));
      }
      for (const change of [c => { c.observe.records.maxEntries = 1; }, c => { c.observe.records.maxBytes = 20; }, c => { c.observe.records.keyPath = 'absent'; }]) {
        const r = await run('out-of-line', external(change)); assert.equal(r.status, 'inconclusive', JSON.stringify(r));
      }
    });
    await t.test('explicit inline mode and expected record sets retain the same identity semantics', async () => {
      const r = await run('', c => { c.expected.records = records; c.observe.records.keyMode = 'inline'; }); assert.equal(r.status, 'pass', JSON.stringify(r));
    });
    await t.test('numeric/string/array keys remain distinct and empty existing stores remain readable', async () => {
      for (const mode of ['mixed-keys', 'empty-records']) { const r = await run(mode); assert.equal(r.status, 'pass', JSON.stringify(r)); }
    });
    await t.test('empty/default mismatch and unexpected native preparation never pass', async () => {
      const r = await run('', c => { c.backupRoundtrip.restore.empty.setting = { theme: 'wrong' }; }); assert.equal(r.status, 'inconclusive'); assert.equal(r.error, 'FRESH_TARGET_NOT_EMPTY');
      const dialog = await run('prepare-dialog'); assert.equal(dialog.status, 'inconclusive'); assert.equal(dialog.error, 'UNEXPECTED_NATIVE_DIALOG');
    });
    for (const mode of ['drop-import', 'rewrite-id', 'drift-import', 'field-loss', 'field-extra', 'broken-reload', 'duplicate-export', 'missing-export', 'extra-export']) {
      await t.test(`${mode} is a failure, never a success from counts alone`, async () => {
        const r = await run(mode); assert.equal(r.status, 'fail', JSON.stringify(r));
      });
    }
    for (const mode of ['undefined', 'negative-zero', 'date', 'cycle', 'binary', 'missing-db', 'out-of-line', 'cursor-error', 'cursor-abort', 'cursor-stall', 'wrong-inline-key']) {
      await t.test(`${mode} remains unsupported/inconclusive`, async () => {
        const r = await run(mode); assert.equal(r.status, 'inconclusive', JSON.stringify(r));
      });
    }
    await t.test('entry/UTF8 byte bounds and declared keyPath cannot be bypassed', async () => {
      for (const change of [c => { c.observe.records.maxEntries = 1; }, c => { c.observe.records.maxBytes = 20; }, c => { c.observe.records.keyPath = 'other'; }, c => { c.observe.records.store = 'absent'; }]) {
        const r = await run('', change); assert.equal(r.status, 'inconclusive', JSON.stringify(r));
      }
    });
    await t.test('UTF8 array byte boundary includes delimiters and multibyte characters', async () => {
      const unicode = structuredClone(records); unicode[0].title = '日本語🍵';
      const bytes = Buffer.byteLength(JSON.stringify(unicode), 'utf8');
      const pass = await run('unicode', c => { c.observe.records.maxBytes = bytes; }); assert.equal(pass.status, 'pass', JSON.stringify(pass));
      const fail = await run('unicode', c => { c.observe.records.maxBytes = bytes - 1; }); assert.equal(fail.status, 'inconclusive', JSON.stringify(fail));
    });
    await t.test('observer does not create a missing DB', async () => {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        await confineContext(context, app.origin); const page = await context.newPage();
        const c = contract('missing-db'); c.checks = ['reload']; c.timeoutMs = 250; delete c.backupRoundtrip;
        const r = await executeCheck(page, validateContract(c), 'reload'); assert.equal(r.status, 'inconclusive');
        assert.deepEqual(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name)), []);
      } finally { await context.close(); }
    });
    await t.test('a concurrent writer cannot split two stores within one observed snapshot', async () => {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        await confineContext(context, app.origin); const page = await context.newPage();
        const c = contract('atomic-race'); c.checks = ['reload']; c.timeoutMs = 1000; delete c.backupRoundtrip;
        const r = await executeCheck(page, validateContract(c), 'reload');
        assert.equal(r.status, 'fail', JSON.stringify(r)); // The deliberately queued writer really changed data.
        assert.equal(r.before.records[0].epoch, 1); assert.equal(r.before.details[0].epoch, 1);
        assert.equal(r.after.records[0].epoch, 2); assert.equal(r.after.details[0].epoch, 2);
      } finally { await context.close(); }
    });
    await t.test('CLI report and actual standalone spec share protocol and omit captured records', async () => {
      for (const mode of ['', 'out-of-line']) {
        const c = contract(mode, mode ? external() : () => {}); const out = join(dir, mode || 'pack');
        const r = await runContract(c, { out }); assert.equal(r.exitCode, 0, JSON.stringify(r));
        for (const name of ['report.json', 'index.html']) {
          const body = await readFile(join(out, name), 'utf8');
          assert.equal(body.includes('PRIVATE_RECORD'), false); assert.equal(body.includes('PRIVATE_DETAIL'), false); assert.equal(body.includes('PRIVATE_FILENAME'), false);
        }
        const result = await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', join(out, 'playwright.config.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
          let output = ''; child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
          const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Standalone spec timed out')); }, 60000);
          child.on('error', reject); child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
        });
        assert.equal(result.code, 0, result.output);
        const spec = await readFile(join(out, 'repro.spec.mjs'), 'utf8');
        assert.ok(spec.includes("backup?.restore.prepare?.length")); assert.ok(spec.includes('function canonicalRecords'));
        assert.ok(spec.includes("probe.keyMode === 'out-of-line'"));
      }
    });
  } finally { await browser.close(); await app.close(); await rm(dir, { recursive: true, force: true }); }
});
