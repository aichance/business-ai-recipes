import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectNative } from '../lib/inspect.mjs';
import { DISABLED_FEATURES } from '../lib/codex.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'relay-inspect-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const child = join(root, 'child'); await mkdir(join(root, '.git')); await mkdir(child);
  await writeFile(join(root, 'AGENTS.md'), 'R'.repeat(40)); await writeFile(join(child, 'AGENTS.md'), 'C'.repeat(200));
  return {root, child};
}

function transport({root, child}, options = {}) {
  const calls = []; const clients = [];
  const config = {project_doc_max_bytes: 128,
    features: Object.fromEntries(DISABLED_FEATURES.map(x => [x, false])),
    mcp_servers: {private_name: {enabled: false, url: 'PRIVATE-CONFIG', token: 'PRIVATE-CREDENTIAL'}}};
  const createClient = settings => {
    const client = {failure: null, closeObserved: false, terminationDone: false, terminationSucceeded: false,
      closed: Promise.resolve(0), send(value) { assert.equal(value.method, 'initialized'); },
      async request(method, params) {
        calls.push({method, params, server: clients.length});
        if (method === 'initialize') return {};
        if (method === 'config/read') {
          if (options.configError) throw new Error('PRIVATE-CREDENTIAL');
          const count = calls.filter(x => x.method === 'config/read').length;
          return {config: options.changedConfig && count === 3 ? {...config, project_doc_max_bytes: 256} : config,
            layers: options.missingLayers ? undefined : options.unknownLayer ? [{name: {type: 'unrecognized-layer'}, config: {}}] : [{name: {type: 'user', file: join(tmpdir(), 'PRIVATE-HOME', 'config.toml')}, config: {}},
              ...(options.projectRootOverride ? [{name: {type: 'project'}, config: {project_root_markers: ['FOREIGN-MARKER']}}] : [])]};
        }
        if (method === 'thread/start') {
          await options.onThreadStart?.();
          if (options.unexpectedTurn) settings.onNotification({method: 'turn/started'});
          return {model: options.wrongModel ? 'unexpected' : 'gpt-6.1-sol', reasoningEffort: 'max',
            approvalPolicy: 'never', sandbox: {type: 'readOnly'}, cwd: child,
            thread: {id: 'synthetic-fresh', ephemeral: true, turns: [], environments: options.environments ?? [{environmentId: 'local', cwd: child, runtimeWorkspaceRoots: []}]},
            instructionSources: options.sources ?? [join(root, 'AGENTS.md'), join(child, 'AGENTS.md'), join(tmpdir(), 'PRIVATE-HOME', 'AGENTS.md')]};
        }
        throw new Error('Unexpected request, including any model turn');
      },
      stop() { this.closeObserved = true; this.terminationDone = true; this.terminationSucceeded = !options.cleanupFailure; if (options.cleanupFailure) this.failure = 'cleanup_timeout'; },
    };
    if (clients.length === 1) {
      assert.equal(settings.overrides.mcp_servers.private_name.enabled, false);
      assert(!JSON.stringify(settings.overrides).includes('PRIVATE-CREDENTIAL'));
      assert(!JSON.stringify(settings.overrides).includes('PRIVATE-CONFIG'));
    }
    clients.push(client); return client;
  };
  return {createClient, calls, clients};
}

test('native inspection distinguishes estimated bytes from source membership, with no model turn', async t => {
  for (const clientVersion of ['codex-cli 0.163.0', 'codex-cli 0.164.0']) {
    const f = await fixture(t); const x = transport(f);
    const r = await inspectNative({project: f.child, clientVersion, createClient: x.createClient});
    assert.equal(r.estimate.basis, `local-snapshot-and-rust-v${clientVersion.split(' ')[1]}-loader`);
    assert.equal(r.status, 'INSPECTED'); assert.equal(r.estimate.rows[1].estimated_status, 'TRUNCATED');
    assert.equal(r.estimate.rows[1].native_listed, true); assert.equal(r.estimate.rows[1].examined_bytes, 88);
    assert.equal(r.receipt, 'NOT_TESTED'); assert.equal(r.compliance, 'NOT_TESTED');
    assert.equal(r.observation.model_turn_requests, 0); assert.equal(r.observation.cleanup_confirmed, true);
    assert.equal(x.calls.filter(x => x.method === 'thread/start').length, 1);
    assert(x.calls.every(x => ['initialize', 'config/read', 'thread/start'].includes(x.method)));
    const start = x.calls.find(x => x.method === 'thread/start').params;
    assert.equal(start.model, 'gpt-6.1-sol'); assert.equal(start.config.model_reasoning_effort, 'max');
    assert.equal(start.sandbox, 'read-only'); assert.equal(start.approvalPolicy, 'never');
    assert.equal(start.allowProviderModelFallback, false);
    for (const secret of [f.root, 'PRIVATE-CREDENTIAL', 'PRIVATE-CONFIG', 'PRIVATE-HOME']) assert(!JSON.stringify(r).includes(secret));
  }
});

test('untrusted/other native selection mismatch is inconclusive, not proof of size loss', async t => {
  const f = await fixture(t); const x = transport(f, {sources: []});
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.failure_kind, 'native_prediction_mismatch');
  assert.equal(r.estimate.selection_matches_native_paths, false); assert.equal(r.estimate.rows[1].native_listed, false);
});

test('changing guidance during native startup invalidates byte estimates', async t => {
  const f = await fixture(t); const x = transport(f, {onThreadStart: () => writeFile(join(f.root, 'AGENTS.md'), 'changed')});
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.failure_kind, 'snapshot_changed');
  assert.equal(r.estimate.snapshot_stable, false); assert.equal(r.observation.cleanup_confirmed, true);
});

test('changing discovery settings is inconclusive', async t => {
  const f = await fixture(t); const x = transport(f, {changedConfig: true});
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.failure_kind, 'settings_changed');
});

test('unknown loader keeps native-only observations and never claims budget parity', async t => {
  for (const clientVersion of ['codex-cli 0.165.0', 'codex-cli 0.164.0-alpha.1', 'codex-cli 0.163.0+custom']) {
    const f = await fixture(t); const x = transport(f);
    const r = await inspectNative({project: f.child, clientVersion, createClient: x.createClient});
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.estimate.state, 'UNSUPPORTED_SOURCE_VERSION');
    assert.deepEqual(r.observation.native_sources_within_startup_directory, ['AGENTS.md']);
    assert(!JSON.stringify(r).includes('PRIVATE-HOME')); assert(!('rows' in r.estimate));
    assert.deepEqual(r.estimate.required_versions, ['codex-cli 0.163.0', 'codex-cli 0.164.0']);
    assert.equal(r.observation.cleanup_confirmed, true);
  }
});

test('native cleanup failure cannot leave INSPECTED', async t => {
  const f = await fixture(t); const x = transport(f, {cleanupFailure: true});
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.observation.cleanup_confirmed, false);
  assert.equal(x.clients.length, 1); assert(!x.calls.some(x => x.method === 'thread/start'));
});

test('provider/config errors do not expose their bodies or trigger retries', async t => {
  const f = await fixture(t); const x = transport(f, {configError: true});
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
  assert.equal(r.status, 'INCONCLUSIVE'); assert(!JSON.stringify(r).includes('PRIVATE-CREDENTIAL'));
  assert.equal(x.clients.length, 1); assert.equal(r.observation.cleanup_confirmed, true);
});

test('unexpected model settings or an unsolicited turn cannot be accepted', async t => {
  const f = await fixture(t);
  for (const options of [{wrongModel: true}, {unexpectedTurn: true}]) {
    const x = transport(f, options); const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.observation.model_turn_requests, 0);
  }
});

test('already cancelled inspection starts no server or model turn', async t => {
  const f = await fixture(t); const x = transport(f); const controller = new AbortController(); controller.abort();
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient, signal: controller.signal});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.failure_kind, 'cancelled_or_timeout');
  assert.equal(x.clients.length, 0); assert.equal(x.calls.length, 0);
});

test('unknown outside native paths are inconclusive and redacted', async t => {
  const f = await fixture(t); const x = transport(f, {sources: [join(f.root, 'AGENTS.md'), join(f.child, 'AGENTS.md'), join(tmpdir(), 'UNKNOWN-PRIVATE', 'credentials.txt')]});
  const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.failure_kind, 'native_prediction_mismatch');
  assert.equal(r.estimate.unknown_external_source_count, 1); assert(!JSON.stringify(r).includes('UNKNOWN-PRIVATE'));
});

test('multiple, remote or mismatched environments cannot certify a local estimate', async t => {
  const f = await fixture(t);
  for (const environments of [[], [{environmentId: 'remote', cwd: f.child}], [{environmentId: 'local', cwd: f.root}], [{environmentId: 'local', cwd: f.child}, {environmentId: 'other', cwd: f.child}]]) {
    const x = transport(f, {environments});
    const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.failure_kind, 'environment_scope_unconfirmed');
  }
});

test('project marker overrides or missing provenance stop before guidance scanning and thread creation', async t => {
  const f = await fixture(t);
  for (const options of [{projectRootOverride: true}, {missingLayers: true}, {unknownLayer: true}]) {
    const x = transport(f, options);
    const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.163.0', createClient: x.createClient});
    assert.equal(r.status, 'INCONCLUSIVE'); assert(!('rows' in r.estimate));
    assert(!x.calls.some(x => x.method === 'thread/start'));
    assert.equal(r.observation.cleanup_confirmed, true);
  }
});

// Recheck guards on the newly supported exact CLI version, without weakening the old ones.
test('Codex 0.164 inspection keeps provenance, mutation, model and cleanup guards', async t => {
  const f = await fixture(t);
  const cases = [
    {sources: []}, {changedConfig: true}, {cleanupFailure: true},
    {projectRootOverride: true}, {missingLayers: true}, {unknownLayer: true},
    {wrongModel: true}, {unexpectedTurn: true},
  ];
  for (const options of cases) {
    const x = transport(f, options);
    const r = await inspectNative({project: f.child, clientVersion: 'codex-cli 0.164.0', createClient: x.createClient});
    assert.equal(r.status, 'INCONCLUSIVE', JSON.stringify(options));
    assert.equal(r.observation.model_turn_requests, 0);
    assert(!JSON.stringify(r).includes('PRIVATE-CREDENTIAL'));
    if (options.cleanupFailure) assert.equal(r.observation.cleanup_confirmed, false);
    else assert.equal(r.observation.cleanup_confirmed, true);
    if (options.projectRootOverride || options.missingLayers || options.unknownLayer) {
      assert(!('rows' in r.estimate));
      assert(!x.calls.some(call => call.method === 'thread/start'));
    }
  }
});
