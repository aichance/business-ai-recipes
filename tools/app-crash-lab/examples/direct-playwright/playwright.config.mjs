import { fileURLToPath } from 'node:url';

const here = name => fileURLToPath(new URL(name, import.meta.url));
export default {
  testDir: '.', testMatch: 'direct.spec.mjs', workers: 1, retries: 0,
  timeout: 60_000, expect: { timeout: 4_000 },
  outputDir: here('../../.crash-lab/direct-playwright/results'),
  reporter: [
    ['list'],
    ['json', { outputFile: here('../../.crash-lab/direct-playwright/results.json') }],
    ['html', { outputFolder: here('../../.crash-lab/direct-playwright/html'), open: 'never' }]
  ],
  use: {
    browserName: 'chromium', headless: true, serviceWorkers: 'block',
    viewport: { width: 1120, height: 760 },
    actionTimeout: 4_000, navigationTimeout: 4_000,
    trace: 'on', screenshot: 'on'
  }
};
