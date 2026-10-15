import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'roundtrip.spec.mjs',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: './test-results',
  use: {
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
