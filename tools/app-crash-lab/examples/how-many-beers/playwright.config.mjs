import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'backup.spec.mjs',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: process.env.ACL_HMB_OUTPUT || '../../.crash-lab/how-many-beers',
  use: { browserName: 'chromium', headless: true, trace: 'off', screenshot: 'only-on-failure' },
});
