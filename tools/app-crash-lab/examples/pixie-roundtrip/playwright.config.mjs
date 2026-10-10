import { resolve } from 'node:path';

const target = new URL(process.env.PIXIE_BASE_URL || 'http://127.0.0.1:49731/');
if (!['http:', 'https:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)
    || target.username || target.password) {
  throw new Error('PIXIE_BASE_URL must be a disposable loopback HTTP(S) URL');
}

const output = resolve(process.env.PIXIE_TEST_OUTPUT_DIR || '.crash-lab/pixie-roundtrip');
export default {
  testDir: '.', testMatch: 'roundtrip.spec.mjs', workers: 1, retries: 0,
  timeout: 30_000, expect: { timeout: 4_000 },
  outputDir: resolve(output, 'results'),
  reporter: [['list'], ['json', { outputFile: resolve(output, 'results.json') }]],
  use: {
    baseURL: target.href, browserName: 'chromium', headless: true,
    serviceWorkers: 'block', acceptDownloads: true,
    actionTimeout: 4_000, navigationTimeout: 4_000,
    trace: 'on', screenshot: 'on'
  }
};
