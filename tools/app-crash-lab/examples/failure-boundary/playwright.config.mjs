import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'boundary.spec.mjs',
  timeout: 10000,
  expect: { timeout: 1000 },
  workers: 1,
  retries: 0,
  use: { browserName: 'chromium', serviceWorkers: 'block' },
});
