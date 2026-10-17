import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { validateContract, PACK } from './contract.mjs';
import { executeCheck, executeBackupRoundtrip, confineContext } from './protocol.mjs';
import { renderReport } from './report.mjs';

export const VERSION = '0.12.0-dev.2';

export async function reproductionSpec(contract, hash) {
  const runtime = (await readFile(new URL('./protocol.mjs', import.meta.url), 'utf8'))
    .replace("import { expect } from '@playwright/test';", "import { test, expect } from '@playwright/test';")
    .replace(/^export /gm, '');
  return `// App Crash Lab ${VERSION}; ${PACK}; contract SHA-256 ${hash}
// Standalone: requires @playwright/test, not App Crash Lab. Start the app first.
// Source: https://github.com/aichance/business-ai-recipes/tree/main/tools/app-crash-lab
${runtime}
const contract = ${JSON.stringify(contract, null, 2)};
// Each check gets fresh contexts. Run with the included workers=1 config.
test.describe.configure({ mode: 'default' });
for (const check of contract.checks) {
  test(contract.name + ' / ' + check, async ({ browser }, testInfo) => {
    const backup = contract.backupRoundtrip;
    const stepCount = contract.setup.length + contract.reset.length + (contract.afterReload?.length ?? 0) + (contract.rejectedUpdate?.steps.length ?? 0) + (backup?.export.steps.length ?? 0) + (backup?.restore.prepare?.length ?? 0) + (backup?.restore.ready.length ?? 0) + (backup?.restore.after?.length ?? 0) + (backup?.restore.commit ? backup.restore.commit.ready.length + 1 : 0);
    test.setTimeout(Math.max(60000, contract.timeoutMs * (stepCount + 24) + 5 * contract.stabilityMs));
    let result;
    if (check === 'backup-roundtrip') result = await executeBackupRoundtrip(browser, contract);
    else {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1120, height: 760 } });
      try {
        await confineContext(context, contract.baseURL);
        result = await executeCheck(await context.newPage(), contract, check);
      } finally { await context.close(); }
    }
    // Close app contexts before assertion failure can capture page state.
    await testInfo.attach('state-diff', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    expect(result.status, JSON.stringify(result, null, 2)).toBe('pass');
  });
}
`;
}

export async function runContract(input, options = {}) {
  const contract = validateContract(input);
  const out = resolve(options.out ?? `.crash-lab/run-${Date.now()}`);
  // Refuse to mix new evidence with an older run's files.
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out);
  const contractBytes = JSON.stringify(contract, null, 2) + '\n';
  await writeFile(join(out, 'contract.json'), contractBytes, { flag: 'wx' });
  const hash = createHash('sha256').update(contractBytes).digest('hex');
  await writeFile(join(out, 'repro.spec.mjs'), await reproductionSpec(contract, hash));
  await writeFile(join(out, 'playwright.config.mjs'), `export default { testDir: '.', testMatch: 'repro.spec.mjs', workers: 1, reporter: 'line', outputDir: 'repro-results', use: { trace: 'off', screenshot: 'off', video: 'off' } };\n`);
  const report = { version: VERSION, pack: PACK, name: contract.name, baseURL: contract.baseURL, contractHash: hash, createdAt: new Date().toISOString(), results: [] };
  let browser;
  try {
    browser = await chromium.launch({ headless: options.headless !== false });
    for (const check of contract.checks) {
      if (check === 'backup-roundtrip') {
        const result = await executeBackupRoundtrip(browser, contract);
        report.results.push(result);
        if (options.onResult) options.onResult(result);
        continue;
      }
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1120, height: 760 } });
      try {
        await confineContext(context, contract.baseURL);
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
        const page = await context.newPage();
        const result = await executeCheck(page, contract, check);
        try { await page.screenshot({ path: join(out, `${check}.png`), fullPage: true }); result.screenshot = `${check}.png`; } catch (error) { result.screenshotError = error.message; }
        await context.tracing.stop({ path: join(out, `${check}.trace.zip`) });
        report.results.push(result);
        if (options.onResult) options.onResult(result);
      } finally { await context.close(); }
    }
  } catch (error) {
    report.infrastructureError = error.message;
  } finally { if (browser) await browser.close(); }
  report.completedAt = new Date().toISOString();
  report.exitCode = report.infrastructureError || report.results.some(r => r.status === 'inconclusive') ? 2 : report.results.some(r => r.status === 'fail') ? 1 : 0;
  // A launch failure must never look like an empty passing test suite.
  if (report.results.length !== contract.checks.length) report.exitCode = 2;
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(out, 'index.html'), renderReport(report));
  return { ...report, out };
}
