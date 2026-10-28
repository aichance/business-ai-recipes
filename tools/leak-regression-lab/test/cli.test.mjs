import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, mkdir, symlink, readFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const cli = resolve(dirname(fileURLToPath(import.meta.url)), '../cli.mjs');
const exec = (args) => spawnSync(process.execPath, [cli, ...args], {encoding: 'utf8', timeout: 5000});

test('without --live the CLI refuses before opening config/env or creating output', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'leak-cli-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const out = join(dir, 'never-created');
  const p = exec(['check', '--config', join(dir, 'missing.json'), '--env', join(dir, 'missing.env'), '--out', out]);
  assert.equal(p.status, 1); assert.match(p.stderr, /EXPLICIT_CHECK_CONFIG_OUT_AND_LIVE_REQUIRED/);
  await assert.rejects(access(out));
});

test('existing output directory and its files are preserved', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'leak-cli-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const input = JSON.parse(await readFile(resolve(dirname(cli), 'examples/test-config.json'), 'utf8'));
  input.objects.forEach((x) => { x.sha256 = '0'.repeat(64); });
  const config = join(dir, 'config.json'); await writeFile(config, JSON.stringify(input));
  const out = join(dir, 'existing'); await mkdir(out); await writeFile(join(out, 'sentinel'), 'preserve');
  const p = exec(['check', '--config', config, '--out', out, '--live']);
  assert.equal(p.status, 1); assert.match(p.stderr, /NEW_OUTPUT_DIRECTORY_REQUIRED/);
  assert.equal(await readFile(join(out, 'sentinel'), 'utf8'), 'preserve');
});

test('npm-style symlink executes help rather than silently importing and exiting', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'leak-cli-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const bin = join(dir, 'leak-check'); await symlink(cli, bin);
  const p = spawnSync(process.execPath, [bin, '--help'], {encoding: 'utf8', timeout: 5000});
  const {version} = JSON.parse(await readFile(resolve(dirname(cli), 'package.json'), 'utf8'));
  assert.equal(p.status, 0); assert.ok(p.stdout.startsWith(`Leak Regression Lab${version} —`));
});
