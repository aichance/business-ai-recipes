import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCodexInvocation } from '../lib/process.mjs';
import { RpcClient } from '../lib/rpc.mjs';
import { runProcess, DISABLED_FEATURES, probeConfig, checkRestrictedConfig } from '../lib/codex.mjs';

// Opt-in CI capability smoke only: no credentials, no thread and no model turn.
test('installed official Codex starts and reads restricted config without a model call', {
  skip: process.env.RELAY_TEST_INSTALLED_CODEX !== '1', timeout: 45000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), 'relay official cli '));
  const invocation = await resolveCodexInvocation();
  const version = await runProcess(invocation.command, [...invocation.prefixArgs, '--version'], {timeoutMs: 10000});
  assert.equal(version.exit_code, 0);
  assert.match(version.stdout, /^codex-cli 0\.163\.0\s*$/);
  let rpc;
  try {
    for (const config of [{}, probeConfig({})]) {
      const overrides = Object.entries(config).filter(([key]) => key !== 'features' && key !== 'mcp_servers')
        .flatMap(([key, value]) => ['-c', key + '=' + JSON.stringify(value)]);
      rpc = new RpcClient(invocation.command, [...invocation.prefixArgs, 'app-server', '--stdio',
        ...DISABLED_FEATURES.flatMap((key) => ['--disable', key]), ...overrides], {
        cwd: root, env: {...process.env, CODEX_HOME: root}, timeoutMs: 15000,
      });
      await rpc.request('initialize', {clientInfo: {name: 'relay-no-turn-ci', version: '0.1.1'}, capabilities: {experimentalApi: true}});
      rpc.send({method: 'initialized', params: {}});
      const result = await rpc.request('config/read', {cwd: root, includeLayers: false});
      checkRestrictedConfig(result.config);
      rpc.stop(); await rpc.closed;
      assert.equal(rpc.failure, null);
      assert.equal(rpc.closeObserved, true);
    }
    console.log('Installed Codex 0.163.0 initialize/config-read/cleanup passed; zero thread/start and zero turn/start.');
  } finally { if (rpc) { rpc.stop(); await rpc.closed; } await rm(root, {recursive: true, force: true}); }
});
