export default {
  testDir: '.',
  testMatch: 'stale-tab.spec.mjs',
  workers: 1,
  reporter: 'line',
  outputDir: '.crash-lab/native-results',
  use: { browserName: 'chromium', headless: true },
};
