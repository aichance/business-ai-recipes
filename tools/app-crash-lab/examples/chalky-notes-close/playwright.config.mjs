export default {
  testDir: '.',
  testMatch: 'notes-close.spec.mjs',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { browserName: 'chromium', headless: true, serviceWorkers: 'block', trace: 'on' },
};
