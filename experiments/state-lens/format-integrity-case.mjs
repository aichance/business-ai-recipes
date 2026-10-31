// Authored synthetic fixture. No external app, account, or model calls.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStateLens } from '../../tools/playwright-state-lens/lens.mjs';

const require = createRequire(new URL('../../tools/playwright-state-lens/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const RAW = 1234.567, KEY = 'precision-pad-document';
const output = process.argv[2] ?? await mkdtemp(join(tmpdir(), 'state-lens-format-'));
if (process.argv[2]) await mkdir(output); // Never overwrite an existing report.
const hash = data => createHash('sha256').update(data).digest('hex');
const fixture = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Precision Pad</title>
<style>*{box-sizing:border-box}body{margin:0;background:#edf1f5;color:#18242e;font:18px system-ui,sans-serif}main{max-width:640px;margin:70px auto;padding:38px;background:white;border:1px solid #ced8e0;border-radius:20px}small{color:#536574;letter-spacing:.12em}h1{font-size:32px;margin:16px 0}p{line-height:1.55}output{display:block;font-size:54px;font-weight:700;font-variant-numeric:tabular-nums;margin:26px 0}label{display:block}select,button{font:inherit;padding:10px 16px;border:1px solid #6d7e8c;border-radius:8px;background:white}select{margin:10px 18px 0 0}button{background:#173f60;color:white;cursor:pointer}#status{min-height:30px;color:#306343}footer{font-size:14px;color:#536574;margin-top:32px}@media(max-width:680px){main{margin:20px 12px;padding:24px}output{font-size:44px}}</style>
<main><small>SYNTHETIC MEASUREMENT NOTE</small><h1>Precision Pad</h1><p>Change the display precision. Keep the original measurement for later calculations.</p><output aria-label="Measurement"></output><label>Decimal places<br><select aria-label="Decimal places"><option value="3">3 decimal places</option><option value="2">2 decimal places</option></select><button>Save display format</button></label><p id="status" role="status" aria-label="Save status">Saved</p><footer>Local demo · one measurement · no external requests</footer></main>
<script>
const key=${JSON.stringify(KEY)}, broken=new URL(location.href).searchParams.get('mode')==='regression';
if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify({value:${RAW},digits:3}));
let documentValue=JSON.parse(localStorage.getItem(key));
const select=document.querySelector('select'), output=document.querySelector('output'), status=document.querySelector('#status');
select.value=String(documentValue.digits);
function render(){output.textContent=new Intl.NumberFormat('en-US',{minimumFractionDigits:Number(select.value),maximumFractionDigits:Number(select.value)}).format(documentValue.value)}
select.onchange=()=>{render();status.textContent='Unsaved format'};
document.querySelector('button').onclick=()=>{documentValue.digits=Number(select.value);if(broken)documentValue.value=Number(documentValue.value.toFixed(documentValue.digits));localStorage.setItem(key,JSON.stringify(documentValue));render();status.textContent='Saved'};
render();document.querySelector('main').dataset.ready='true';
</script></html>`;
const server = createServer((request, response) => {
  if (new URL(request.url, 'http://localhost').pathname !== '/') { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(fixture);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];

async function run(mode, observed) {
  const context = await browser.newContext({ viewport: { width: 1080, height: 780 }, locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const native = [], screens = {};
  const name = `${mode}-${observed ? 'lens' : 'native'}`;
  if (!observed) await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  try {
    await page.goto(`${origin}/?mode=${mode}`);
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByLabel('Measurement')).toHaveText('1,234.567');
    const lens = observed ? createStateLens(page, { title: `Precision Pad: ${mode} (authored synthetic fixture)`,
      probes: ['value', 'digits'].map(field => ({ name: field, source: 'localStorage', key: KEY, json: true, pointer: '/' + field })) }) : null;
    async function snapshot(label) {
      const state = await context.storageState();
      const entry = state.origins.find(item => item.origin === origin)?.localStorage.find(item => item.name === KEY);
      assert.ok(entry, 'Native storage snapshot must include the selected key');
      const value = JSON.parse(entry.value);
      assert.deepEqual(value, await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY));
      native.push({ label, value });
    }
    async function step(label, action) {
      await snapshot(label + ' · before');
      if (lens) await lens.step(label, action); else await action();
      await snapshot(label + ' · after');
    }
    await page.getByLabel('Decimal places').selectOption('2');
    await step('Save format', async () => {
      await page.getByRole('button', { name: 'Save display format' }).click();
      await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
      await expect(page.getByLabel('Measurement')).toHaveText('1,234.57');
    });
    screens.save = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    await step('Reload', async () => {
      await page.reload();
      await expect(page.locator('main')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByRole('status', { name: 'Save status' })).toHaveText('Saved');
      await expect(page.getByLabel('Measurement')).toHaveText('1,234.57');
      await expect(page.getByLabel('Decimal places')).toHaveValue('2');
    });
    screens.reload = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    const invariantChecks = [1, 3].map(index => {
      const actual = native[index].value.value;
      let passed = false;
      try { assert.equal(actual, RAW); passed = true; }
      catch (error) {
        // Only this deliberately introduced mismatch is the expected negative control.
        if (!(error instanceof assert.AssertionError) || mode !== 'regression' || actual !== 1234.57) throw error;
      }
      assert.equal(passed, mode === 'normal');
      return { after: index === 1 ? 'save' : 'reload', expected: RAW, actual, passed };
    });
    for (const [index, point] of native.entries()) {
      assert.deepEqual(point.value, { value: mode === 'regression' && index > 0 ? 1234.57 : RAW, digits: index === 0 ? 3 : 2 });
    }
    if (lens) {
      const report = lens.report();
      assert.equal(report.checkpoints.length, 4);
      for (const [index, point] of report.checkpoints.entries()) {
        assert.ok(point.screenshot, 'Every report checkpoint has an actual screenshot');
        for (const field of ['value', 'digits']) {
          const value = point.values[field];
          assert.equal(value.status, 'OBSERVED'); assert.equal(value.exists, true); assert.equal(value.selection.exists, true);
          assert.equal(value.value, native[index].value[field]);
        }
      }
      await lens.writeHTML(join(output, `state-lens-format-${mode}.html`));
      await writeFile(join(output, `${name}-report.json`), JSON.stringify(report, null, 2) + '\n');
    } else await context.tracing.stop({ path: join(output, `${name}-trace.zip`) });
    for (const [phase, data] of Object.entries(screens)) await writeFile(join(output, `${name}-${phase}.png`), data);
    return { mode, observed, uiChecks: 'PASS: initial value, saved status/display, reloaded status/display/precision',
      savedValueInvariants: invariantChecks, native,
      screenSHA256: Object.fromEntries(Object.entries(screens).map(([phase, data]) => [phase, hash(data)])) };
  } finally { await context.close(); }
}

try {
  browser = await chromium.launch();
  const runs = [];
  for (const mode of ['normal', 'regression']) for (const observed of [false, true]) runs.push(await run(mode, observed));
  for (const phase of ['save', 'reload']) assert.equal(new Set(runs.map(run => run.screenSHA256[phase])).size, 1, `All four independently captured ${phase} screenshots must match`);
  for (const mode of ['normal', 'regression']) assert.deepEqual(runs.find(run => run.mode === mode && !run.observed).native, runs.find(run => run.mode === mode && run.observed).native);
  assert.deepEqual(errors, []);
  const measurement = { observedAt: new Date().toISOString(), kind: 'AUTHORED_SYNTHETIC_OPERATOR_FIXTURE_NOT_ADOPTION',
    node: process.version, playwright: require('@playwright/test/package.json').version, chromium: browser.version(),
    libraryVersion: JSON.parse(await readFile(new URL('../../tools/playwright-state-lens/package.json', import.meta.url))).version,
    librarySHA256: hash(await readFile(new URL('../../tools/playwright-state-lens/lens.mjs', import.meta.url))),
    selectedKey: KEY, freshContexts: runs.length, snapshotsPerContext: 4, nativeAndLensValuesEqual: true,
    identicalScreenshots: { save: true, reload: true }, consoleErrors: errors, runs, independentUseCredit: 0 };
  await writeFile(join(output, 'state-lens-format-measurements.json'), JSON.stringify(measurement, null, 2) + '\n');
  await writeFile(join(output, 'state-lens-format.png'), await readFile(join(output, 'normal-lens-reload.png')));
  const good = runs.find(run => run.mode === 'normal' && run.observed).savedValueInvariants.at(-1);
  const bad = runs.find(run => run.mode === 'regression' && run.observed).savedValueInvariants.at(-1);
  const comparison = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Same screen. Different saved data. — State Lens</title>
<style>*{box-sizing:border-box}body{margin:0;color:#eaf0f6;background:#101920;font:17px/1.6 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:48px 24px}a{color:#8fd9ff}small{color:#aac0cf}.eyebrow{letter-spacing:.13em;font-size:12px}h1{font-size:clamp(36px,6vw,68px);line-height:1.05;max-width:900px;margin:18px 0 22px}h2{font-size:21px;margin:0 0 12px}p{max-width:880px}.lead{font-size:21px;color:#c5d6e2}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:28px 0}.card{background:#1b2933;border:1px solid #3b5364;border-radius:14px;padding:20px;min-width:0}.card img{width:100%;border-radius:8px;display:block}button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:12px 20px;background:#9fe5c8;color:#10281f;font-weight:700}.evidence{margin:18px 0 0;padding:18px;border:1px solid #647e90;border-radius:8px}code,pre{font:14px/1.6 ui-monospace,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere}strong{color:#fff}.tag{color:#a6eacb}.warn{color:#ffd7a0}footer{border-top:1px solid #3b5364;margin-top:36px;padding-top:20px}.links{display:flex;flex-wrap:wrap;gap:10px 22px}@media(max-width:700px){main{padding:28px 16px}.grid{grid-template-columns:1fr}.lead{font-size:18px}}</style>
<main><small class="eyebrow">STATE LENS · RECORDED SYNTHETIC COMPARISON · NO SETUP TO VIEW</small><h1>Same screen.<br>Different saved data.</h1><p class="lead">Change display precision from 3 decimal places to 2. Save. Reload.<br>Both app screens show <strong>1,234.57</strong>. Did both preserve the original value?</p>
<div class="grid"><section class="card"><h2>Normal save</h2><img src="state-lens-format.png" alt="Actual normal fixture after reload: 1,234.57, 2 decimal places, Saved"><p class="tag">UI checks: passed</p></section><section class="card"><h2>Authored regression</h2><img src="state-lens-format.png" alt="Actual regression fixture had the same screenshot bytes after reload: 1,234.57, 2 decimal places, Saved"><p class="tag">The same UI checks: passed</p></section></div>
<p>The two screenshots were captured independently and matched byte for byte at this viewport, after save and after reload. This page uses that shared image.</p><button id="reveal" aria-expanded="false" aria-controls="stored">Reveal the saved values</button>
<section id="stored" class="evidence" hidden><h2>The format changed. One original value changed too.</h2><div class="grid"><div><strong>Normal</strong><pre>{ "value": ${good.actual}, "digits": 2 }</pre><span class="tag">Original-value assertion: passed</span></div><div><strong>Authored regression</strong><pre>{ "value": ${bad.actual}, "digits": 2 }</pre><span class="warn">Original-value assertion: failed after save and reload</span></div></div><p>The intentionally broken save rounds the stored value, rather than changing display precision alone. This is an authored example, not a bug found in another developer's app.</p></section>
<h2 style="margin-top:32px">See the steps beside their selected data</h2><p>State Lens puts selected field differences and screenshots into one local HTML report. Open either recorded timeline and choose the save or reload checkpoint:</p><div class="links"><a href="state-lens-format-normal.html">Normal timeline →</a><a href="state-lens-format-regression.html">Regression timeline →</a><a href="state-lens-format-measurements.json">Actual measurements</a></div>
<p><strong>Standard Playwright catches this too.</strong> The same explicit saved-value assertions passed in the normal branch and failed in the regression branch, with and without State Lens. The helper organizes observations; it does not replace your assertions. A timeline action marked COMPLETED means its callback returned, not that the saved data is correct.</p><pre>const saved = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('precision-pad-document')));
assert.equal(saved.value, 1234.567); // Keep this assertion.</pre>
<section class="card" aria-labelledby="try" style="margin-top:32px"><h2 id="try">Try it in your own Playwright test</h2><p>Already use Playwright? Download the common experimental package, or copy its single module. Add checkpoints around your own save and reload actions; keep your existing assertions.</p><div class="links"><a href="https://github.com/aichance/business-ai-recipes/releases/tag/state-lens-v0.6.0-experimental.1">Download experimental v0.6 →</a><a href="https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-install.md">Installation and minimal test →</a></div></section>
<footer><div class="links"><a href="https://github.com/aichance/business-ai-recipes">Source and updates on GitHub</a><a href="https://github.com/aichance/business-ai-recipes/blob/main/docs/state-lens-manual.md">Record without writing a test</a><a href="https://github.com/aichance/business-ai-recipes/blob/main/experiments/state-lens/format-integrity-case.mjs">Reproduce this comparison</a></div><p>Useful for a future save/reload bug? You can star the repository to find it again.</p><p><small>Node22+ and caller-installed Playwright/Chromium are required for capture. Common library ${measurement.libraryVersion}; ${measurement.freshContexts} fresh contexts, ${measurement.snapshotsPerContext} selected-state checkpoints per context. Observations and screenshots are sequential, not an atomic capture or commit-time proof. No measured time-saving claim. This static replay does not access your app or browser storage. AI-authored project; synthetic operator verification, not independent adoption.</small></p></footer></main>
<script>document.querySelector('#reveal').onclick=function(){const expanded=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',String(!expanded));document.querySelector('#stored').hidden=expanded;this.textContent=expanded?'Reveal the saved values':'Hide the saved values'};</script></html>`;
  await writeFile(join(output, 'state-lens-format.html'), comparison);
  console.log(JSON.stringify({ output, ...measurement }));
} finally {
  try { if (browser) await browser.close(); } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
