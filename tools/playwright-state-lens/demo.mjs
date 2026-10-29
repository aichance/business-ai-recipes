import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { createStateLens } from './lens.mjs';
import { startFixture } from './demo/fixture.mjs';

const out = resolve(process.argv[2] || `.state-lens-output/demo-${Date.now()}`);
await mkdir(out, { recursive: true });
const probes = [{ name: 'localDraft', source: 'localStorage', key: 'demo-draft', json: true }, { name: 'persistedDraft', source: 'indexedDB', database: 'drafts', store: 'notes', key: 'current' }];
const server = await startFixture(), browser = await chromium.launch();
const outcomes = [];
try {
  for (const mode of ['reload-loss', 'good']) {
    const baseline = await browser.newContext({ viewport: { width: 1080, height: 780 }, serviceWorkers: 'block' });
    let raw;
    try {
      await baseline.tracing.start({ screenshots: true, snapshots: true, sources: true });
      const page = await baseline.newPage(); await page.goto(server.url + '/?mode=' + mode); await page.waitForFunction(() => window.fixture?.ready);
      raw = [];
      const capture = async label => raw.push({ label, state: await baseline.storageState({ indexedDB: true }) });
      await capture('Save · before');
      await page.locator('#draft').fill('Keep this launch draft'); await page.locator('#save').click(); await page.getByText('Saved', { exact: true }).waitFor();
      await capture('Save · after'); await capture('Reload · before');
      await page.reload(); await page.waitForFunction(() => window.fixture?.ready); await capture('Reload · after');
      await writeFile(join(out, `${mode}-standard-storage.json`), JSON.stringify(raw, null, 2) + '\n');
      await baseline.tracing.stop({ path: join(out, `${mode}-standard-trace.zip`) });
    } finally { await baseline.close(); }

    const context = await browser.newContext({ viewport: { width: 1080, height: 780 }, serviceWorkers: 'block' });
    try {
      const page = await context.newPage(); await page.goto(server.url + '/?mode=' + mode); await page.waitForFunction(() => window.fixture?.ready);
      const lens = createStateLens(page, { probes, title: mode === 'reload-loss' ? 'It said saved. Then reload happened.' : 'The same flow, with persistence intact.' });
      await lens.step('Save', async () => { await page.locator('#draft').fill('Keep this launch draft'); await page.locator('#save').click(); await page.getByText('Saved', { exact: true }).waitFor(); });
      await lens.step('Reload', async () => { await page.reload(); await page.waitForFunction(() => window.fixture?.ready); });
      const report = lens.report();
      await lens.writeHTML(join(out, `${mode}-state-lens.html`));
      await writeFile(join(out, `${mode}-state-lens.json`), JSON.stringify(report, null, 2) + '\n');
      const final = report.checkpoints.at(-1).values.persistedDraft.value;
      const standardFinal = raw.at(-1).state.origins.flatMap(x => x.indexedDB || []).flatMap(x => x.stores || []).flatMap(x => x.records || []).find(x => x.key === 'current')?.value;
      outcomes.push({ mode, baselineCheckpoints: raw.length, lensCheckpoints: report.checkpoints.length, baselineFinal: standardFinal,
        lensFinal: final, valuesAgree: JSON.stringify(final) === JSON.stringify(standardFinal),
        selectedChangePaths: report.checkpoints.at(-1).changes.map(x => x.path),
        standardAlsoContainsData: true, lensAdds: 'Selected per-step field differences and viewport in one local HTML; standard snapshots already contain the data.' });
    } finally { await context.close(); }
  }
} finally { await browser.close(); await server.close(); }
await writeFile(join(out, 'comparison.json'), JSON.stringify({ observedAt: new Date().toISOString(), scope: 'synthetic operator measurements, not external adoption', outcomes }, null, 2) + '\n');
console.log(JSON.stringify({ output: out, cases: outcomes.length, baselineAgreements: outcomes.filter(x => x.valuesAgree).length }));
if (outcomes.some(x => !x.valuesAgree)) process.exitCode = 1;
