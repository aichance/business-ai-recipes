import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'autosave-abort.spec.mjs', timeout: 60000,
  expect: { timeout: 10000 }, retries: 0, workers: 1,
  use: { browserName: 'chromium', headless: true, viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1, serviceWorkers: 'block', trace: 'retain-on-failure' },
  outputDir: 'test-results',
});
