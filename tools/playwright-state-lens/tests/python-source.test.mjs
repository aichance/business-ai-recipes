import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test('the committed Python collector and viewer reproduce from the common source', async () => {
  const { stdout } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('../python/build.mjs', import.meta.url)), '--check'],
    { timeout: 10000, maxBuffer: 65536 });
  assert.match(stdout, /Python generated collector\/renderer: EXACT/);
});
