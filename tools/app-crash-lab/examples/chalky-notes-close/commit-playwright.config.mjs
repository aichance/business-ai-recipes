export default {
  testDir: '.',
  testMatch: 'commit-paths.spec.mjs',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'commit-test-results',
  use: { browserName: 'chromium', headless: true, serviceWorkers: 'block', trace: 'on' },
};
