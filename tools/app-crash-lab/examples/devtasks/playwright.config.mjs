import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'backup-roundtrip.spec.mjs',
  timeout: 20000, expect: { timeout: 5000 },
  workers: 1, retries: 0, reporter: 'list',
  outputDir: process.env.CRASH_LAB_RESULTS_DIR || '.crash-lab-results',
  use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } },
});
