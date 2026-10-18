export default {
  testDir: '.', testMatch: 'optional-history.spec.mjs', workers: 1,
  reporter: [['json', { outputFile: 'results.json' }]],
  outputDir: 'test-results', use: { trace: 'off', screenshot: 'off', video: 'off' },
};
