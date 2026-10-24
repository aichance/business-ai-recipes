import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, realpath, rm, symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {childEnvironment, judgeReport, projectContext, requiredFiles, runSubprocess, verifyPackage} from './ci.mjs';

function report() {
  return {schema_version: '1', tool: 'agent-relay-check', tool_version: '0.1.3', status: 'INSPECTED',
    client_version: 'codex-cli 0.164.0', receipt: 'NOT_TESTED', compliance: 'NOT_TESTED',
    observation: {kind: 'native-startup-source-paths', model_turn_requests: 0,
      requested_model: 'gpt-6.1-sol', resolved_model: 'gpt-6.1-sol', requested_effort: 'max', resolved_effort: 'max',
      fresh_ephemeral_thread: true, single_local_environment: true, cleanup_confirmed: true,
      native_servers_started: 2, native_servers_closed: 2, request_methods: ['initialize', 'config/read', 'thread/start']},
    estimate: {state: 'NATIVE_PATHS_MATCH_LOCAL_ESTIMATE', basis: 'local-snapshot-and-rust-v0.164.0-loader',
      native_path_membership_is_not_full_bytes_or_cause: true, startup_directory: 'child',
      snapshot_stable: true, selection_matches_native_paths: true, other_native_source_count: 0,
      unknown_external_source_count: 0, issues: [], effective_project_doc_max_bytes: 32768,
      native_project_sources: ['AGENTS.md', 'child/AGENTS.md'], rows: [
        {path: 'AGENTS.md', selected: true, native_listed: true, estimated_status: 'FULL',
          file_bytes: 40, examined_bytes: 40, estimated_budget_used: 40},
        {path: 'child/AGENTS.md', selected: true, native_listed: true, estimated_status: 'FULL',
          file_bytes: 80, examined_bytes: 80, estimated_budget_used: 80}]}};
}
const expected = ['AGENTS.md', 'child/AGENTS.md'];

test('only the exact published common ZIP is accepted; modified, shortened and extended bytes are refused', async () => {
  const data = await readFile(new URL('../../docs/agent-relay-check-v0.1.3.zip', import.meta.url));
  assert.equal(verifyPackage(data), data);
  const changed = Buffer.from(data); changed[changed.length - 1] ^= 1;
  for (const candidate of [changed, data.subarray(1), Buffer.concat([data, Buffer.from('x')])]) {
    assert.throws(() => verifyPackage(candidate), /package_checksum_mismatch/);
  }
});

test('a completed source inspection passes only when both required files have a full local estimate', () => {
  const result = judgeReport(report(), expected, 'child');
  assert.equal(result.status, 'PASSED');
  assert.equal(result.required.length, 2);
  assert.equal(result.inspection.model_turn_requests, 0);
});

test('INSPECTED with both native paths is rejected when the child is locally estimated partial', () => {
  const data = report();
  Object.assign(data.estimate.rows[1], {estimated_status: 'TRUNCATED', examined_bytes: 24, estimated_budget_used: 24});
  data.estimate.effective_project_doc_max_bytes = 64;
  const result = judgeReport(data, expected, 'child');
  assert.equal(result.status, 'REJECTED');
  assert.deepEqual(result.failures, [{path: 'child/AGENTS.md', code: 'required_source_not_full'}]);
});

test('a missing or unlisted required instruction does not inherit another file success', () => {
  assert.equal(judgeReport(report(), ['missing.md'], 'child').status, 'REJECTED');
  const data = report(); data.estimate.rows[1].native_listed = false;
  assert.equal(judgeReport(data, expected, 'child').status, 'REJECTED');
});

test('wrong startup scope, incomplete cleanup, inference, or a nonzero command cannot certify CI', () => {
  assert.equal(judgeReport(report(), expected, '.', 0).status, 'INCONCLUSIVE');
  assert.equal(judgeReport(report(), expected, 'child', 3).status, 'INCONCLUSIVE');
  const cleanup = report(); cleanup.observation.cleanup_confirmed = false;
  assert.equal(judgeReport(cleanup, expected, 'child').status, 'INCONCLUSIVE');
  const inference = report(); inference.observation.request_methods.push('turn/start');
  assert.equal(judgeReport(inference, expected, 'child').status, 'INCONCLUSIVE');
});

test('unknown outside sources and duplicated rows fail rather than selecting a convenient match', () => {
  const outside = report(); outside.estimate.unknown_external_source_count = 1;
  assert.equal(judgeReport(outside, expected, 'child').status, 'INCONCLUSIVE');
  const duplicate = report(); duplicate.estimate.rows.push({...duplicate.estimate.rows[0]});
  assert.equal(judgeReport(duplicate, expected, 'child').status, 'INCONCLUSIVE');
});

test('the result never promotes a model receipt or compliance assertion', () => {
  for (const key of ['receipt', 'compliance']) {
    const data = report(); data[key] = 'RECEIVED';
    assert.equal(judgeReport(data, expected, 'child').status, 'INCONCLUSIVE');
  }
});

test('required paths are literal relative paths, without traversal, empty lists or duplicates', () => {
  assert.deepEqual(requiredFiles('AGENTS.md\nchild dir/AGENTS.md\n'), ['AGENTS.md', 'child dir/AGENTS.md']);
  for (const value of ['', '../AGENTS.md', '/AGENTS.md', 'child/../AGENTS.md', 'a\\b.md',
    'AGENTS.md\nAGENTS.md', 'bad\0.md']) assert.throws(() => requiredFiles(value));
});

test('all subprocess environments omit provider, GitHub and npm credentials and preload configuration', () => {
  const env = childEnvironment({PATH: '/bin', HOME: '/normal', LANG: 'C.UTF-8',
    CODEX_HOME: '/normal/profile', OPENAI_API_KEY: 'SYNTHETIC_NOT_A_CREDENTIAL',
    GITHUB_TOKEN: 'SYNTHETIC_NOT_A_CREDENTIAL', NPM_CONFIG_USERCONFIG: '/normal/npm.conf',
    NODE_OPTIONS: '--require /synthetic/preload.mjs', BASH_ENV: '/synthetic/shell', RUNNER_TRACKING_ID: 'synthetic-job-marker'},
  {codexHome: '/temporary/actual-cli-home', cliBin: '/temporary/official-cli/bin'});
  assert.equal(env.CODEX_HOME, '/temporary/actual-cli-home');
  assert.equal(env.PATH, '/temporary/official-cli/bin:/bin');
  assert.equal(env.RUNNER_TRACKING_ID, 'synthetic-job-marker');
  for (const key of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'NPM_CONFIG_USERCONFIG', 'NODE_OPTIONS', 'BASH_ENV']) {
    assert.equal(Object.hasOwn(env, key), false);
  }
});

test('caller workspace selection supports spaces and rejects outside and symlink escapes', async t => {
  const parent = process.env.RELAY_TEST_TEMP || tmpdir();
  await mkdir(parent, {recursive: true});
  const scratch = await mkdtemp(join(parent, 'relay-ci-test-'));
  t.after(() => rm(scratch, {recursive: true, force: true}));
  const workspace = join(scratch, 'caller workspace'), project = join(workspace, 'app with spaces');
  const outside = join(scratch, 'outside');
  await mkdir(project, {recursive: true}); await mkdir(outside);
  const env = childEnvironment(process.env);
  assert.equal(spawnSync('git', ['-c', 'init.defaultBranch=main', 'init', '-q', workspace], {env}).status, 0);
  const found = await projectContext(workspace, 'app with spaces', env);
  assert.equal(found.root, await realpath(workspace));
  assert.equal(found.startup, 'app with spaces');
  await assert.rejects(projectContext(workspace, '../outside', env), /project_outside_workspace/);
  await symlink(outside, join(workspace, 'escape'), 'dir');
  await assert.rejects(projectContext(workspace, 'escape', env), /project_outside_workspace/);
});

const cooperativeChild = `
  const {spawn} = require('node:child_process');
  const kid = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 6000)'],
    {detached: true, stdio: 'ignore'});
  process.stdout.write(String(kid.pid) + '\\n');
  const stay = setInterval(() => {}, 1000);
  process.on('SIGTERM', () => {
    clearInterval(stay);
    if (kid.exitCode !== null || kid.signalCode !== null) process.exit(0);
    kid.once('exit', () => process.exit(0));
    kid.kill('SIGTERM');
  });
`;

async function assertOwnedChildStopped(result) {
  const pid = Number(result.stdout.split('\n')[0]);
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'synthetic child reported its owned descendant');
  assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'});
}

test('outer timeout lets a cooperative child close its detached descendant and never reports success', async () => {
  const result = await runSubprocess(process.execPath, ['-e', cooperativeChild],
    {env: childEnvironment(process.env), timeout: 1500, graceMs: 5000});
  assert.equal(result.interrupted, 'timeout');
  await assertOwnedChildStopped(result);
});

test('cancellation is forwarded while awaiting a child, without waiting for its normal deadline', async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const result = await runSubprocess(process.execPath, ['-e', cooperativeChild],
      {env: childEnvironment(process.env), timeout: 10000, signal: controller.signal, graceMs: 5000});
    assert.equal(result.interrupted, 'cancelled');
    await assertOwnedChildStopped(result);
  } finally { clearTimeout(timer); }
});

test('output overflow is not accepted and still allows cooperative descendant cleanup', async () => {
  const script = cooperativeChild + '\nprocess.stdout.write(Buffer.alloc(3 * 1024 * 1024, 120));';
  const result = await runSubprocess(process.execPath, ['-e', script],
    {env: childEnvironment(process.env), timeout: 10000, graceMs: 5000});
  assert.equal(result.interrupted, 'output_limit');
  await assertOwnedChildStopped(result);
});

test('an already cancelled operation does not start a subprocess', async () => {
  const controller = new AbortController(); controller.abort();
  const result = await runSubprocess(process.execPath, ['-e', 'process.stdout.write("must not run")'],
    {env: childEnvironment(process.env), signal: controller.signal});
  assert.equal(result.interrupted, 'cancelled');
  assert.equal(result.status, null);
  assert.equal(result.stdout, '');
});

test('a direct child ignoring termination is killed and reaped, without a successful result', async () => {
  const script = 'process.on("SIGTERM", () => {}); process.stdout.write(String(process.pid)); setInterval(() => {}, 1000);';
  const result = await runSubprocess(process.execPath, ['-e', script],
    {env: childEnvironment(process.env), timeout: 1500, graceMs: 100});
  assert.equal(result.interrupted, 'timeout');
  assert.equal(result.signal, 'SIGKILL');
  await assertOwnedChildStopped(result);
});
