export default {
  testDir: '.',
  testMatch: 'controls.spec.mjs',
  workers: 1,
  reporter: 'line',
  outputDir: '.crash-lab/livepage-control-results',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
};
