import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'drafts.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15000,
  outputDir: 'draft-results',
  reporter: [['line'], ['json', { outputFile: 'draft-results.json' }], ['html', { open: 'never', outputFolder: 'draft-report' }]],
});
