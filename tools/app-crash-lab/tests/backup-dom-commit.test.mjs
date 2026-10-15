import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runContract } from '../lib/runner.mjs';
import { validateContract } from '../lib/contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sentinel = 'DOM_CAPTURED_PRIVATE_4a8307';
const records = [{ title: 'Synthetic café 合成', nested: { hidden: sentinel }, flags: [true, false] }];
const bytes = Buffer.from('{\n  "saved" : ' + JSON.stringify(records) + ', "format": 1\n}\n');
const contract = {
  schemaVersion: 1, pack: 'state-preservation@1', name: 'Original backup with DOM commit',
  baseURL: 'http://127.0.0.1:1', path: '/', reset: [], timeoutMs: 3000, stabilityMs: 100,
  checks: ['backup-roundtrip'], setup: [{ action: 'click', target: { css: '#save' }, save: true }],
  observe: { records: { source: 'localStorage', key: 'saved', parse: 'json' }, count: { source: 'count', target: { css: '.item' } } },
  expected: { count: 1 },
  backupRoundtrip: {
    isolation: 'browser-local',
    export: { steps: [{ action: 'click', target: { css: '#export' } }], maxBytes: 65536, statePaths: { records: ['saved'] } },
    restore: {
      path: '/', ready: [{ action: 'expectVisible', target: { css: '#file' } }],
      empty: { records: null, count: 0 }, target: { css: '#file' }, mimeType: 'application/json',
      commit: { frame: { css: '.preview' }, target: { role: 'button', name: 'Confirm restore' }, ready: [{ action: 'expectText', target: { css: 'h2' }, value: 'Review imported backup' }] },
      success: { observe: { status: { source: 'text', target: { css: '#status' } } }, expected: { status: 'Restored' } },
    },
  },
};

test('DOM commit contracts name a frame and one action, with exact observation-only readiness', () => {
  assert.doesNotThrow(() => validateContract(contract));
  const invalid = change => { const c = structuredClone(contract); change(c); assert.throws(() => validateContract(c), /Invalid contract/); };
  invalid(c => delete c.backupRoundtrip.restore.commit.frame);
  invalid(c => delete c.backupRoundtrip.restore.commit.target);
  invalid(c => c.backupRoundtrip.restore.commit.ready = []);
  invalid(c => c.backupRoundtrip.restore.commit.ready = [{ action: 'expectVisible', target: { css: 'h2' } }]);
  for (const value of ['', '  \t']) invalid(c => c.backupRoundtrip.restore.commit.ready = [{ action: 'expectText', target: { css: 'h2' }, value }]);
  invalid(c => c.backupRoundtrip.restore.confirm = { message: 'Replace?', accept: true });
  for (const step of [
    { action: 'click', target: { css: '#repair' } },
    { action: 'goto', path: '/repair' },
    { action: 'request', path: '/repair', method: 'POST', expectStatus: 200 },
    { action: 'setFile', target: { css: '#file' }, file: { name: 'other.json', mimeType: 'application/json', text: '{}' } },
    { action: 'expectText', target: { css: 'h2' }, value: 'Review', save: true },
  ]) invalid(c => c.backupRoundtrip.restore.commit.ready.push(step));
});

async function fixture() {
  const uploads = [], clicks = [], visits = [];
  const html = `<!doctype html><meta charset="utf-8"><button id="save">Save</button><button id="export">Export</button><button id="choose">Import</button><input id="file" type="file"><p id="status">Ready</p><section id="items"></section><section class="preview" hidden><h2>Review imported backup</h2><p>${sentinel}</p><button>Confirm restore</button></section><script>
    const mode = new URLSearchParams(location.search).get('mode');
    const saved = ${JSON.stringify(records)};
    const preview = document.querySelector('.preview');
    const draw = () => document.querySelector('#items').innerHTML = JSON.parse(localStorage.getItem('saved') || '[]').map(() => '<p class="item">Record</p>').join('');
    if (mode === 'repair' && localStorage.getItem('saved')) localStorage.setItem('saved', JSON.stringify(saved));
    if (mode === 'reload-loss' && localStorage.getItem('saved')) { const a=JSON.parse(localStorage.getItem('saved')); a[0].flags[1]=true; localStorage.setItem('saved',JSON.stringify(a)); }
    if (mode === 'preexisting') preview.hidden = false;
    if (mode === 'ambiguous-before') document.body.append(preview.cloneNode(true));
    draw();
    document.querySelector('#save').onclick = () => { localStorage.setItem('saved',JSON.stringify(saved)); draw(); };
    document.querySelector('#export').onclick = () => { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([${JSON.stringify(bytes.toString('utf8'))}],{type:'application/json'})); a.download='private-${sentinel}.json'; a.click(); };
    const importFile = async e => {
      const file=e.target.files[0], raw=await file.arrayBuffer();
      await fetch('/received',{method:'POST',body:raw});
      if (mode==='missing') return;
      const payload=JSON.parse(new TextDecoder().decode(raw)).saved;
      if (mode==='early-state') localStorage.setItem('saved',JSON.stringify(payload));
      if (mode==='early-success') document.querySelector('#status').textContent='Restored';
      if (mode==='late-early-success') setTimeout(()=>document.querySelector('#status').textContent='Restored',250);
      if (mode==='small-timeout') await new Promise(resolve=>setTimeout(resolve,150));
      preview.hidden=false;
      if (mode==='wrong-text') preview.querySelector('h2').textContent=${JSON.stringify(sentinel)};
      const button=preview.querySelector('button');
      if (mode==='disabled') button.disabled=true;
      if (mode==='ambiguous-after') preview.append(button.cloneNode(true));
      if (mode==='ambiguous-frame-after') document.body.append(preview.cloneNode(true));
      if (mode==='ambiguous-ready-after') preview.append(preview.querySelector('h2').cloneNode(true));
      if (mode==='outside-target') { const outside=button.cloneNode(true); outside.id='outside'; outside.onclick=()=>fetch('/clicked',{method:'POST',body:'outside'}); document.body.append(outside); }
      if (mode==='outside-ready') { const outside=preview.querySelector('h2').cloneNode(true); outside.id='outside-heading'; document.body.append(outside); }
      let clickCount=0;
      button.onclick=async () => {
        clickCount++; await fetch('/clicked',{method:'POST',body:mode});
        if (mode==='native') { confirm(${JSON.stringify(sentinel)}); return; }
        if (mode==='two-clicks' && clickCount===1) return;
        if (['loss','loss-before-navigation','loss-no-success'].includes(mode)) delete payload[0].nested.hidden;
        localStorage.setItem('saved',JSON.stringify(payload)); draw(); preview.hidden=true;
        if (mode==='small-timeout') await new Promise(resolve=>setTimeout(resolve,150));
        if (!['no-success','loss-no-success'].includes(mode)) document.querySelector('#status').textContent='Restored';
      };
    };
    document.querySelector('#file').onchange=importFile;
    document.querySelector('#choose').onclick=()=>{const f=document.createElement('input');f.type='file';f.onchange=importFile;f.click();};
    if (mode==='chooser') document.querySelector('#file').remove();
  </script>`;
  const server = http.createServer(async (req, res) => {
    visits.push(req.url);
    if (['/received', '/clicked'].includes(req.url)) {
      const chunks=[]; for await (const chunk of req) chunks.push(chunk);
      if (req.url==='/received') uploads.push(Buffer.concat(chunks)); else clicks.push(Buffer.concat(chunks).toString());
      res.writeHead(204); res.end(); return;
    }
    res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(html);
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, uploads, clicks, visits, close: () => new Promise(resolve=>server.close(resolve)) };
}

async function filesBelow(path) {
  const paths=[];
  for (const e of await readdir(path,{withFileTypes:true})) { const p=join(path,e.name); paths.push(...(e.isDirectory()?await filesBelow(p):[p])); }
  return paths;
}

test('DOM preview, one commit, unchanged bytes, full saved state and private standalone parity', { timeout: 600000 }, async t => {
  const app=await fixture(), temp=await mkdtemp(join(root,'.crash-lab-dom-'));
  t.after(async()=>{await app.close();await rm(temp,{recursive:true,force:true});});
  const reports={};
  const run=async(mode,change=()=>{})=>{const c=structuredClone(contract);c.baseURL=app.baseURL;c.path=c.backupRoundtrip.restore.path='/?mode='+mode;change(c);const r=await runContract(c,{out:join(temp,mode)});reports[mode]=r;return r.results[0];};
  await t.test('input and on-demand chooser both deliver original bytes and one actual commit',async()=>{
    for (const mode of ['fixed','chooser']) {
      const n=app.uploads.length, before=app.clicks.length;
      const r=await run(mode,c=>{if(mode==='chooser'){delete c.backupRoundtrip.restore.target;c.backupRoundtrip.restore.fileChooser={css:'#choose'};c.backupRoundtrip.restore.ready=[{action:'expectVisible',target:{css:'#choose'}}];}});
      assert.equal(r.status,'pass',JSON.stringify(r));assert.deepEqual(app.uploads[n],bytes);assert.equal(app.clicks.length-before,1);
      assert.deepEqual(r.importCommit,{required:true,ready:true,attemptedCount:1,clicked:true});
      assert.deepEqual(r.comparisons.beforeCommit,{matched:true,changedObservations:[]});assert.equal(r.comparisons.reload.matched,true);
    }
  });
  await t.test('stale, ambiguous, missing, wrong and disabled previews never click',async()=>{
    for(const mode of ['preexisting','ambiguous-before','ambiguous-after','ambiguous-frame-after','ambiguous-ready-after','missing','wrong-text','disabled']) {
      const before=app.clicks.length,r=await run(mode);assert.equal(r.status,'inconclusive',JSON.stringify(r));assert.equal(app.clicks.length,before);
    }
  });
  await t.test('selectors that escape the preview cannot assert readiness or click an outside control',async()=>{
    for(const mode of ['outside-target','outside-ready']){
      const before=app.clicks.length,r=await run(mode,c=>{
        if(mode==='outside-target')c.backupRoundtrip.restore.commit.target={css:'xpath=ancestor::body//button[@id="outside"]'};
        else c.backupRoundtrip.restore.commit.ready=[{action:'expectText',target:{css:'xpath=ancestor::body//h2[@id="outside-heading"]'},value:'Review imported backup'}];
      });assert.equal(r.status,'inconclusive',JSON.stringify(r));assert.equal(app.clicks.length,before);assert.equal(r.importCommit.attemptedCount,0);
    }
  });
  await t.test('a low-timeout contract allows delayed preview and completion',async()=>{
    const r=await run('small-timeout',c=>c.timeoutMs=2000);assert.equal(r.status,'pass',JSON.stringify(r));
  });
  await t.test('saved changes or success before commit are unsupported, not a pass or a repair click',async()=>{
    for(const [mode,error]of[['early-state','IMPORT_STATE_CHANGED_BEFORE_COMMIT'],['early-success','IMPORT_SUCCESS_BEFORE_COMMIT'],['late-early-success','IMPORT_SUCCESS_BEFORE_COMMIT']]){
      const before=app.clicks.length,r=await run(mode,c=>{if(mode==='late-early-success')c.stabilityMs=500;});assert.equal(r.status,'inconclusive',JSON.stringify(r));assert.equal(r.error,error);assert.equal(app.clicks.length,before);
    }
  });
  await t.test('a second required click, missing completion or unexpected native dialog stays inconclusive',async()=>{
    for(const mode of ['two-clicks','no-success','native']){
      const before=app.clicks.length,r=await run(mode);assert.equal(r.status,'inconclusive',JSON.stringify(r));assert.equal(app.clicks.length-before,1);assert.equal(r.importCommit.attemptedCount,1);
    }
  });
  await t.test('hidden field loss, loss without a toast, and loss after reload fail',async()=>{
    for(const mode of ['loss','loss-no-success','reload-loss']){const r=await run(mode);assert.equal(r.status,'fail',JSON.stringify(r));assert.equal(reports[mode].exitCode,1);}
  });
  await t.test('post-import navigation cannot repair a committed record before its comparison',async()=>{
    const before=app.visits.filter(p=>p.includes('mode=repair')).length;
    const r=await run('loss-before-navigation',c=>c.backupRoundtrip.restore.after=[{action:'goto',path:'/?mode=repair'}]);
    assert.equal(r.status,'fail',JSON.stringify(r));assert.equal(r.error,'RESTORED_STATE_DIFFERS_BEFORE_NAVIGATION');assert.equal(app.visits.filter(p=>p.includes('mode=repair')).length,before);
  });
  await t.test('generated pass, IC and FAIL have identical decoded results and no captured preview data',async()=>{
    for(const mode of ['fixed','chooser','small-timeout','outside-target','early-state','two-clicks','loss','loss-no-success']){
      const r=reports[mode];
      const replay=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[join(root,'node_modules/@playwright/test/cli.js'),'test','--config',join(r.out,'playwright.config.mjs'),'--reporter=json'],{cwd:root,stdio:['ignore','pipe','pipe'],timeout:90000});let output='',stderr='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>resolve({code,output,stderr}));});
      assert.equal(replay.code,r.exitCode===0?0:1,replay.output);assert.ok(!replay.output.includes(sentinel));assert.ok(!replay.stderr.includes(sentinel));
      const attachments=[];const collect=s=>{for(const spec of s.specs??[])for(const test of spec.tests)for(const result of test.results)attachments.push(...result.attachments);for(const sub of s.suites??[])collect(sub);};for(const suite of JSON.parse(replay.output).suites)collect(suite);
      const attached=attachments.filter(a=>a.name==='state-diff');assert.equal(attached.length,1);
      const actual=JSON.parse(Buffer.from(attached[0].body,'base64').toString());
      for(const key of ['status','error','phase','importCommit','comparisons'])assert.deepEqual(actual[key],r.results[0][key],`${mode}:${key}`);
    }
  });
  await t.test('all CLI, HTML and decoded attachment artifacts remain metadata-only',async()=>{
    const files=await filesBelow(temp);assert.ok(!files.some(p=>/\.(png|webm|zip)$/.test(p)));
    for(const file of files)assert.ok(!(await readFile(file)).includes(Buffer.from(sentinel)),file);
    for(const r of Object.values(reports)){assert.equal(r.results[0].before,null);assert.equal(r.results[0].after,null);}
  });
});
