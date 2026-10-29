import http from 'node:http';

export const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draft Desk · synthetic app</title>
<style>body{margin:0;background:#edf0e8;color:#1a302a;font:17px system-ui}main{max-width:900px;margin:70px auto;padding:32px}.tag{letter-spacing:.15em;font-size:12px}h1{font-size:56px;margin:20px 0}article{background:white;border-radius:22px;padding:32px;box-shadow:0 8px 40px #132b1d12}label{display:block;font-weight:600;margin:12px 0}textarea{box-sizing:border-box;width:100%;height:180px;padding:18px;font:20px/1.6 system-ui;border:1px solid #cbd6c4;border-radius:12px}button{background:#1d4539;color:white;border:0;border-radius:25px;padding:14px 24px;font:inherit;margin:20px 10px 0 0}#status{display:inline-block;padding:8px 16px;background:#e8f4d3;border-radius:30px;font-weight:600}small{color:#5b7267}.meta{display:flex;justify-content:space-between;align-items:center}</style>
<main><span class="tag">SYNTHETIC DEMO · LOCAL DATA ONLY</span><h1>Draft Desk</h1><p>A small app that says it saved your draft.</p><article><div class="meta"><h2>Launch notes</h2><span id="status">Loading</span></div><label for="draft">Your draft</label><textarea id="draft" placeholder="Write a note…"></textarea><button id="save" type="button">Save draft</button><button id="reload" type="button">Reload page</button><p><small id="detail"></small></p></article></main>
<script type="module">
const mode=new URLSearchParams(location.search).get('mode')||'good', area=document.getElementById('draft'), status=document.getElementById('status'), key='demo-draft';
const get=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const open=indexedDB.open('drafts',1);open.onupgradeneeded=()=>open.result.createObjectStore('notes');const db=await get(open);db.onversionchange=()=>db.close();
const read=()=>get(db.transaction('notes').objectStore('notes').get('current'));
async function put(value){return new Promise((res,rej)=>{const tx=db.transaction('notes','readwrite');tx.objectStore('notes').put(value,'current');tx.oncomplete=res;tx.onabort=()=>rej(tx.error)})}
let loaded=await read();
if(mode==='reload-loss' && sessionStorage.getItem('loaded')==='yes' && loaded){loaded={body:'',revision:loaded.revision+1};await put(loaded);localStorage.setItem(key,JSON.stringify(loaded))}
sessionStorage.setItem('loaded','yes');let loadedRevision=loaded?.revision||0;area.value=loaded?.body||'';status.textContent='Ready';document.getElementById('detail').textContent='Mode: '+mode+' · the displayed saved status is not proof of persistence.';
document.getElementById('save').onclick=async()=>{const current=await read();if(mode==='stale-safe' && current && current.revision!==loadedRevision){status.textContent='Newer draft found';return}const value={body:area.value,revision:(current?.revision||0)+1};await put(value);localStorage.setItem(key,JSON.stringify(value));loadedRevision=value.revision;status.textContent='Saved'};
document.getElementById('reload').onclick=()=>location.reload();
window.fixture={ready:true,read,async seed(value){await put(value);localStorage.setItem(key,JSON.stringify(value));area.value=value.body;loadedRevision=value.revision},db};
</script></html>`;

export async function startFixture() {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(html); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
