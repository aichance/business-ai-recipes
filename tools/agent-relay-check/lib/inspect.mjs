import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { RpcClient } from './rpc.mjs';
import { resolveCodexInvocation } from './process.mjs';
import { MODEL, EFFORT, initialize, startupArgs, threadParams, probeConfig, checkRestrictedConfig, runProcess } from './codex.mjs';
import { LOADER_VERSION, LOADER_VERSIONS, inventorySnapshot, budgetReport, discoverySettings } from './inventory.mjs';

const LAYER_TYPES = new Set(['packagedDefaults', 'mdm', 'system', 'enterpriseManaged', 'user', 'project', 'sessionFlags', 'legacyManagedConfigTomlFromFile', 'legacyManagedConfigTomlFromMdm']);
const ALLOWED = new Set(['initialize', 'config/read', 'thread/start']);
const SAFE_FAILURES = new Set(['invalid_project_budget', 'invalid_root_markers', 'invalid_fallback_filenames',
  'unsupported_root_marker_path', 'instruction_chain_unconfirmed', 'cancelled_or_timeout',
  'invalid_native_source_paths', 'snapshot_unconfirmed', 'snapshot_changed', 'settings_changed',
  'native_prediction_mismatch', 'source_version_unverified', 'config_provenance_unconfirmed', 'project_root_override_unconfirmed', 'unexpected_request', 'unexpected_turn',
  'requested_settings_not_honored', 'invalid_fresh_thread', 'startup_directory_mismatch', 'environment_scope_unconfirmed',
  'cleanup_unconfirmed', 'rpc_error', 'timeout', 'cancelled', 'transport_error', 'cleanup_timeout', 'termination_error',
  'invalid_event_stream', 'unexpected_response', 'unexpected_exit', 'server_request', 'output_limit']);

// The pinned loader excludes Project layers when selecting root markers.
// Do not probe ancestors if that effective value cannot be used faithfully.
function inspectionScope(response) {
  if (!Array.isArray(response.layers)) throw new Error('config_provenance_unconfirmed');
  const globals = new Set();
  for (const layer of response.layers) {
    if (!layer?.name || !LAYER_TYPES.has(layer.name.type) || !layer.config || typeof layer.config !== 'object' || Array.isArray(layer.config)) throw new Error('config_provenance_unconfirmed');
    if (layer.disabledReason != null) continue;
    if (layer.name.type === 'project') {
      const profiles = layer.config.profiles;
      if (Object.hasOwn(layer.config, 'project_root_markers') || profiles && typeof profiles === 'object' && Object.values(profiles).some(x => x && typeof x === 'object' && Object.hasOwn(x, 'project_root_markers'))) throw new Error('project_root_override_unconfirmed');
    }
    if (layer.name.type === 'user') {
      const file = layer.name.file;
      if (typeof file !== 'string' || !isAbsolute(file)) throw new Error('config_provenance_unconfirmed');
      globals.add(join(dirname(file), 'AGENTS.override.md'));
      globals.add(join(dirname(file), 'AGENTS.md'));
    }
  }
  if (response.origins?.project_root_markers?.name?.type === 'project') throw new Error('project_root_override_unconfirmed');
  return [...globals].sort();
}

function baseReport(clientVersion) {
  return {schema_version: '1', tool: 'agent-relay-check', tool_version: '0.1.4', status: 'INCONCLUSIVE',
    client_version: clientVersion, observation: {kind: 'native-startup-source-paths', model_turn_requests: 0,
      requested_model: MODEL, requested_effort: EFFORT, resolved_model: null, resolved_effort: null,
      fresh_ephemeral_thread: false, cleanup_confirmed: false, request_methods: []},
    estimate: {state: 'NOT_AVAILABLE'}, receipt: 'NOT_TESTED', compliance: 'NOT_TESTED',
    limits: ['Native path membership does not prove full-byte inclusion, omission cause or model receipt.',
      'Byte counts and skip reasons are local snapshot estimates for the pinned loader, not native API fields.',
      'Codex initialization may communicate or write local metadata; zero model turns is not offline or zero side effects.'],
    next: 'For actual marker receipt, use prepare then run --live on shareable guidance; each live run uses one existing model/quota turn.'};
}

export async function inspectNative({project, clientVersion, createClient, timeoutMs = 120000, signal}) {
  const report = baseReport(clientVersion);
  const started = performance.now();
  const deadline = AbortSignal.timeout(timeoutMs);
  const boundedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const cleanups = [];
  let rpc;
  let threadRequests = 0;
  let startedClients = 0;
  let unexpectedTurn = false;
  let snapshot;
  const remaining = () => Math.max(1, timeoutMs - Math.round(performance.now() - started));
  const request = (client, method, params) => {
    if (boundedSignal.aborted) throw new Error('cancelled_or_timeout');
    if (!ALLOWED.has(method) || method === 'thread/start' && threadRequests++ !== 0) throw new Error('unexpected_request');
    report.observation.request_methods.push(method);
    return client.request(method, params);
  };
  const connect = async overrides => {
    if (boundedSignal.aborted) throw new Error('cancelled_or_timeout');
    rpc = createClient({overrides, timeoutMs: remaining(), signal: boundedSignal,
      onNotification: event => { if (event.method === 'turn/started' || event.method === 'turn/completed') unexpectedTurn = true; }});
    startedClients++;
    await initialize({request: (m, p) => request(rpc, m, p), send: value => rpc.send(value)});
  };
  const close = async () => {
    const client = rpc; rpc = undefined;
    if (!client) return;
    client.stop(); await client.closed;
    const ok = !client.failure && client.closeObserved === true && client.terminationDone && client.terminationSucceeded;
    cleanups.push(ok);
    if (!ok) throw new Error('cleanup_unconfirmed');
  };
  try {
    await connect({});
    const discovered = await request(rpc, 'config/read', {cwd: project, includeLayers: false});
    const overrides = probeConfig(discovered.config);
    await close();
    await connect(overrides);
    const effective = await request(rpc, 'config/read', {cwd: project, includeLayers: true});
    checkRestrictedConfig(effective.config);
    const knownGlobalSources = inspectionScope(effective);
    if (LOADER_VERSIONS.includes(clientVersion)) {
      snapshot = await inventorySnapshot(project, effective.config, {signal: boundedSignal});
      report.estimate = {state: 'INCONCLUSIVE', ...budgetReport(snapshot, null, [], clientVersion)};
      if (snapshot.issues.length) throw new Error('snapshot_unconfirmed');
    }
    const response = await request(rpc, 'thread/start', threadParams(project, effective.config));
    if (response.model !== MODEL || response.reasoningEffort !== EFFORT || response.approvalPolicy !== 'never' || response.sandbox?.type !== 'readOnly') throw new Error('requested_settings_not_honored');
    if (!response.thread?.ephemeral || typeof response.thread.id !== 'string' || !Array.isArray(response.thread.turns) || response.thread.turns.length !== 0) throw new Error('invalid_fresh_thread');
    if (normalize(response.cwd ?? '') !== normalize(project)) throw new Error('startup_directory_mismatch');
    const environments = response.thread.environments;
    if (!Array.isArray(environments) || environments.length !== 1 || environments[0]?.environmentId !== 'local' || typeof environments[0].cwd !== 'string' || !isAbsolute(environments[0].cwd) || normalize(environments[0].cwd) !== normalize(project)) throw new Error('environment_scope_unconfirmed');
    report.observation.single_local_environment = true;
    if (!Array.isArray(response.instructionSources) || response.instructionSources.some(x => typeof x !== 'string' || !isAbsolute(x))) throw new Error('invalid_native_source_paths');
    Object.assign(report.observation, {resolved_model: MODEL, resolved_effort: EFFORT, fresh_ephemeral_thread: true});
    if (!snapshot) {
      // A newer/alpha loader is not silently treated as the pinned byte algorithm.
      const local = response.instructionSources.filter(path => { const r = relative(project, path); return r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r); });
      report.observation.native_sources_within_startup_directory = local.map(x => relative(project, x).split(sep).join('/') || '.');
      report.observation.other_native_source_count = response.instructionSources.length - local.length;
      report.estimate = {state: 'UNSUPPORTED_SOURCE_VERSION', required_version: LOADER_VERSION, required_versions: LOADER_VERSIONS};
      throw new Error('source_version_unverified');
    }
    report.estimate = {state: 'INCONCLUSIVE', ...budgetReport(snapshot, response.instructionSources, knownGlobalSources, clientVersion)};
    const afterConfig = await request(rpc, 'config/read', {cwd: project, includeLayers: true});
    checkRestrictedConfig(afterConfig.config);
    if (JSON.stringify(knownGlobalSources) !== JSON.stringify(inspectionScope(afterConfig))) throw new Error('settings_changed');
    if (JSON.stringify(discoverySettings(effective.config)) !== JSON.stringify(discoverySettings(afterConfig.config))) throw new Error('settings_changed');
    const after = await inventorySnapshot(project, afterConfig.config, {signal: boundedSignal});
    report.estimate.snapshot_stable = snapshot.signature === after.signature && after.issues.length === 0;
    if (!report.estimate.snapshot_stable) throw new Error('snapshot_changed');
    if (!report.estimate.selection_matches_native_paths) throw new Error('native_prediction_mismatch');
    if (unexpectedTurn) throw new Error('unexpected_turn');
    report.estimate.state = 'NATIVE_PATHS_MATCH_LOCAL_ESTIMATE';
    report.status = 'INSPECTED';
  } catch (error) {
    report.failure_kind = SAFE_FAILURES.has(error.message) ? error.message : 'inspection_unconfirmed';
  } finally {
    try { await close(); }
    catch { report.status = 'INCONCLUSIVE'; report.failure_kind = 'cleanup_unconfirmed'; }
  }
  report.observation.native_servers_started = startedClients;
  report.observation.native_servers_closed = cleanups.length;
  report.observation.cleanup_confirmed = cleanups.length === startedClients && cleanups.every(Boolean);
  if (!report.observation.cleanup_confirmed || unexpectedTurn || boundedSignal.aborted) {
    report.status = 'INCONCLUSIVE';
    report.failure_kind ??= unexpectedTurn ? 'unexpected_turn' : boundedSignal.aborted ? 'cancelled_or_timeout' : 'cleanup_unconfirmed';
  }
  report.duration_ms = Math.round(performance.now() - started);
  return report;
}

export async function inspectCodex({project, timeoutMs = 120000, signal, binary = 'codex'}) {
  const invocation = await resolveCodexInvocation(binary);
  const version = await runProcess(invocation.command, [...invocation.prefixArgs, '--version'], {timeoutMs: Math.min(timeoutMs, 10000), signal});
  const text = version.stdout.trim();
  const match = text.match(/^codex-cli (\d+)\.(\d+)\.(\d+)(?:[-+][a-zA-Z0-9.-]+)?$/);
  if (version.exit_code !== 0 || version.error || version.timeout || version.cancelled || !match || Number(match[1]) === 0 && Number(match[2]) < 163) {
    const report = baseReport(null); report.failure_kind = 'unsupported_or_unavailable_cli'; return report;
  }
  return inspectNative({project, clientVersion: text, timeoutMs, signal,
    createClient: ({overrides, ...options}) => new RpcClient(invocation.command, [...invocation.prefixArgs, ...startupArgs(overrides)], {cwd: project, ...options})});
}
