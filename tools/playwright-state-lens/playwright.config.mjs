export default {
  testDir: './examples',
  testMatch: 'consumer.spec.mjs',
  workers: 1,
  retries: 0,
  reporter: 'line',
  outputDir: '.state-lens-output/consumer-results',
  use: { viewport: { width: 1080, height: 780 }, serviceWorkers: 'block' },
};
