export default {
  testDir: '.', testMatch: 'stale-settings.spec.mjs', workers: 1, retries: 0,
  reporter: 'line', outputDir: '.crash-lab/native-results',
  use: { browserName: 'chromium', headless: true },
};
