import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { defineConfig } = require('@playwright/test');

export default defineConfig({
  testDir: dirname(fileURLToPath(import.meta.url)),
  testMatch: 'share-url.spec.mjs', workers: 1, retries: 0,
  reporter: 'line',
  outputDir: resolve(process.env.NUMBERPLACE_OUTPUT || '.crash-lab/numberplace-native'),
});
