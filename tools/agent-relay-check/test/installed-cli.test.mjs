import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolveCodexInvocation } from '../lib/process.mjs';
import { RpcClient } from '../lib/rpc.mjs';
import { runProcess, DISABLED_FEATURES, probeConfig, checkRestrictedConfig } from '../lib/codex.mjs';
import { LOADER_VERSIONS } from '../lib/inventory.mjs';

const expectedVersion = 'codex-cli ' + (process.env.RELAY_TEST_CODEX_VERSION ?? '0.163.0');

// Opt-in CI capability smoke only: no credentials, no thread and no model turn.
test('installed official Codex starts and reads restricted config without a model call', {
  skip: process.env.RELAY_TEST_INSTALLED_CODEX !== '1', timeout: 45000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay official cli '));
  const invocation = await resolveCodexInvocation();
  const version = await runProcess(invocation.command, [...invocation.prefixArgs, '--version'], {timeoutMs: 10000});
  assert.equal(version.exit_code, 0);
  assert(LOADER_VERSIONS.includes(expectedVersion), 'CI must name an exact supported version');
  assert.equal(version.stdout.trim(), expectedVersion);
  let rpc;
  try {
    for (const config of [{}, probeConfig({})]) {
      const overrides = Object.entries(config).filter(([key]) => key !== 'features' && key !== 'mcp_servers')
        .flatMap(([key, value]) => ['-c', key + '=' + JSON.stringify(value)]);
      rpc = new RpcClient(invocation.command, [...invocation.prefixArgs, 'app-server', '--stdio',
        ...DISABLED_FEATURES.flatMap((key) => ['--disable', key]), ...overrides], {
        cwd: root, env: {...process.env, CODEX_HOME: root}, timeoutMs: 15000,
      });
      await rpc.request('initialize', {clientInfo: {name: 'relay-no-turn-ci', version: '0.1.3'}, capabilities: {experimentalApi: true}});
      rpc.send({method: 'initialized', params: {}});
      const result = await rpc.request('config/read', {cwd: root, includeLayers: false});
      checkRestrictedConfig(result.config);
      rpc.stop(); await rpc.closed;
      assert.equal(rpc.failure, null);
      assert.equal(rpc.closeObserved, true);
    }
    console.log(expectedVersion + ' initialize/config-read/cleanup passed; zero thread/start and zero turn/start.');
  } finally { if (rpc) { rpc.stop(); await rpc.closed; } await rm(root, {recursive: true, force: true}); }
});

// The second opt-in check creates one synthetic ephemeral thread, never a turn.
test('installed official Codex inspects partial guidance through the common CLI without inference', {
  skip: process.env.RELAY_TEST_INSTALLED_CODEX !== '1', timeout: 50000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay native inspect '));
  const project = join(root, 'project'); const child = join(project, 'child'); const home = join(root, 'codex-home');
  try {
    await mkdir(join(project, '.git'), {recursive: true}); await mkdir(child); await mkdir(home);
    await writeFile(join(project, 'AGENTS.md'), 'R'.repeat(40)); await writeFile(join(child, 'AGENTS.md'), 'C'.repeat(200));
    await writeFile(join(home, 'config.toml'), 'model="gpt-6.1-sol"\nmodel_reasoning_effort="max"\nproject_doc_max_bytes=128\n[projects.' + JSON.stringify(project) + ']\ntrust_level="trusted"\n');
    const env = {...process.env, CODEX_HOME: home};
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_ACCESS_TOKEN', 'CHATGPT_ACCESS_TOKEN']) delete env[key];
    const {stdout} = await promisify(execFile)(process.execPath,
      [fileURLToPath(new URL('../cli.mjs', import.meta.url)), 'inspect', '--project', child, '--timeout-seconds', '30'],
      {cwd: child, env, timeout: 40000, maxBuffer: 1024 * 1024});
    const report = JSON.parse(stdout);
    assert.equal(report.status, 'INSPECTED'); assert.equal(report.client_version, expectedVersion);
    assert.equal(report.estimate.basis, 'local-snapshot-and-rust-v' + expectedVersion.split(' ')[1] + '-loader');
    assert.equal(report.observation.model_turn_requests, 0);
    assert.equal(report.observation.cleanup_confirmed, true); assert.equal(report.observation.single_local_environment, true);
    assert.deepEqual(report.estimate.rows.map(x => [x.path, x.estimated_status, x.examined_bytes, x.native_listed]),
      [['AGENTS.md', 'FULL', 40, true], ['child/AGENTS.md', 'TRUNCATED', 88, true]]);
    assert.equal(report.receipt, 'NOT_TESTED'); assert(!stdout.includes(root));
    console.log('Installed Codex native inspection passed; one synthetic ephemeral thread, zero model turns.');
  } finally { await rm(root, {recursive: true, force: true}); }
});
