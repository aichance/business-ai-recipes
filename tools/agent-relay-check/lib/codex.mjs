import { spawn } from 'node:child_process';
import { question, receiptSchema, evaluate } from './protocol.mjs';
import { RpcClient } from './rpc.mjs';
import { TurnObservation } from './observation.mjs';

export const MODEL = 'gpt-6.1-sol';
export const EFFORT = 'max';
export const DISABLED_FEATURES = [
  'shell_tool', 'apps', 'plugins', 'multi_agent', 'multi_agent_v2',
  'browser_use', 'browser_use_external', 'computer_use', 'image_generation',
  'view_image', 'memories', 'skill_search', 'hooks', 'code_mode', 'code_mode_host',
  'sleep_tool', 'tool_suggest',
];

export function probeConfig(config) {
  const servers = config.mcp_servers ?? {};
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) throw new Error('Invalid MCP configuration.');
  const overrides = {
    model_reasoning_effort: EFFORT,
    web_search: 'disabled',
    features: Object.fromEntries(DISABLED_FEATURES.map((key) => [key, false])),
    mcp_servers: Object.fromEntries(Object.keys(servers).map((key) => [key, {enabled: false}])),
  };
  for (const name of Object.keys(servers)) {
    if (!name || name.length > 200 || /[\x00-\x1f]/.test(name)) throw new Error('Unsupported MCP server identifier.');
  }
  return overrides;
}

export function threadParams(project, config) {
  return {cwd: project, model: MODEL, allowProviderModelFallback: false,
    approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
    config: probeConfig(config)};
}

export function runProcess(command, args, {cwd, timeoutMs = 120000, signal, maxBytes = 1024 * 1024} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) throw new Error('Invalid process timeout.');
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(command, args, {cwd, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
    const output = {stdout: '', stderr: '', exit_code: null, timeout: false, cancelled: false, error: false};
    let bytes = 0;
    let ended = false;
    let stopping = false;
    let cleanupTimer;
    const finish = () => resolve({...output, duration_ms: Math.round(performance.now() - started)});
    function stop(kind) {
      if (ended || stopping) return;
      stopping = true;
      output[kind] = true;
      clearTimeout(timer);
      cleanupTimer = setTimeout(() => {
        output.error = true;
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        signal?.removeEventListener('abort', cancel);
        finish();
      }, 2000);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch (e) {
          if (e.code !== 'ESRCH') { output.error = true; try { child.kill('SIGKILL'); } catch {} }
        }
      }
    }
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const cancel = () => stop('cancelled');
    signal?.addEventListener('abort', cancel, {once: true});
    if (signal?.aborted) cancel();
    function append(name, chunk) {
      bytes += chunk.length;
      if (bytes > maxBytes) { stop('error'); return; }
      output[name] += chunk.toString('utf8');
    }
    child.stdout.on('data', (c) => append('stdout', c));
    child.stderr.on('data', (c) => append('stderr', c));
    child.on('error', () => { output.error = true; });
    child.on('close', (code) => {
      ended = true;
      clearTimeout(timer); clearTimeout(cleanupTimer);
      signal?.removeEventListener('abort', cancel);
      output.exit_code = code;
      finish();
    });
  });
}

export function tomlValue(value) {
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return `{ ${Object.entries(value).map(([key, v]) => `${JSON.stringify(key)} = ${tomlValue(v)}`).join(', ')} }`;
  }
  throw new Error('Unsupported diagnostic override value.');
}

const startupArgs = (config = {}) => ['app-server', '--stdio',
  ...DISABLED_FEATURES.flatMap((key) => ['--disable', key]),
  ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${tomlValue(value)}`]),
];

async function initialize(rpc) {
  await rpc.request('initialize', {clientInfo: {name: 'agent-relay-check', version: '0.1.0'}, capabilities: {experimentalApi: true}});
  rpc.send({method: 'initialized', params: {}});
}

export function checkRestrictedConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('invalid_effective_config');
  for (const name of DISABLED_FEATURES) {
    if (config.features?.[name] !== false) throw new Error('feature_restriction_not_honored');
  }
  const servers = config.mcp_servers ?? {};
  if (Object.values(servers).some((v) => !v || v.enabled !== false)) throw new Error('mcp_restriction_not_honored');
}

export async function runCodex({project, challenge, timeoutMs = 120000, signal, binary = 'codex'}) {
  if (process.platform === 'win32') throw new Error('The bounded live adapter currently supports macOS and Linux.');
  const version = await runProcess(binary, ['--version'], {timeoutMs: 10000, signal});
  const match = version.stdout.trim().match(/^codex-cli (\d+)\.(\d+)\.(\d+)(?:\S*)?$/);
  if (version.exit_code !== 0 || !match || Number(match[1]) === 0 && Number(match[2]) < 163) {
    throw new Error('Live mode requires installed, authenticated Codex CLI 0.163.0 or newer. No login or upgrade was attempted.');
  }
  if (signal?.aborted) throw new Error('Cancelled before model invocation.');
  const started = performance.now();
  const execution = {adapter: 'codex-app-server', exit_code: null, completed: false, tool_calls: 0, thread_count: 0,
    message: '', configuration: 'guidance-with-tools-and-hooks-disabled',
    client_version: version.stdout.trim(), model_requested: MODEL, effort_requested: EFFORT};
  let rpc;
  let observer;
  let complete;
  let rejectCompletion;
  const completion = new Promise((resolve, reject) => { complete = resolve; rejectCompletion = reject; });
  completion.catch(() => {});
  const remaining = () => Math.max(1, timeoutMs - Math.round(performance.now() - started));
  const notifications = (event) => {
    observer?.accept(event);
    if (event.method === 'turn/completed') complete();
  };
  try {
    // Discovery only: no thread, no turn, no MCP start/list/auth-status request.
    rpc = new RpcClient(binary, startupArgs(), {cwd: project, timeoutMs: remaining(), signal});
    await initialize(rpc);
    const discovered = await rpc.request('config/read', {cwd: project, includeLayers: false});
    const overrides = probeConfig(discovered.config);
    rpc.stop();
    await rpc.closed;
    if (rpc.failure) throw new Error(rpc.failure);
    // Startup restrictions apply before any thread; then read them back. This
    // preserves guidance settings while preventing configured MCP connections.
    rpc = new RpcClient(binary, startupArgs(overrides), {cwd: project, timeoutMs: remaining(), signal, onNotification: notifications});
    rpc.onFailure = rejectCompletion;
    await initialize(rpc);
    const restricted = await rpc.request('config/read', {cwd: project, includeLayers: false});
    checkRestrictedConfig(restricted.config);
    const response = await rpc.request('thread/start', threadParams(project, restricted.config));
    if (response.model !== MODEL || response.reasoningEffort !== EFFORT || response.sandbox?.type !== 'readOnly' || response.approvalPolicy !== 'never') {
      throw new Error('requested_execution_settings_not_honored');
    }
    if (typeof response.thread?.id !== 'string') throw new Error('missing_fresh_thread');
    observer = new TurnObservation(response.thread.id);
    execution.thread_count = 1;
    execution.model_observed = response.model;
    execution.effort_observed = response.reasoningEffort;
    const turn = await rpc.request('turn/start', {threadId: response.thread.id, input: [{type: 'text', text: question(challenge)}],
      model: MODEL, effort: EFFORT, outputSchema: receiptSchema(challenge)});
    if (typeof turn.turn?.id !== 'string' || observer.turnId && observer.turnId !== turn.turn.id) throw new Error('mismatched_turn');
    await completion;
    Object.assign(execution, observer.result);
    execution.exit_code = execution.completed && !rpc.failure ? 0 : null;
  } catch (error) {
    if (observer) Object.assign(execution, observer.result);
    execution.timeout = rpc?.failure === 'timeout';
    execution.cancelled = rpc?.failure === 'cancelled';
    execution.error = true;
    // Allowlisted diagnostic names only; no provider errors/configuration bodies.
    const allowed = ['invalid_effective_config', 'feature_restriction_not_honored', 'mcp_restriction_not_honored',
      'requested_execution_settings_not_honored', 'missing_fresh_thread', 'mismatched_turn', 'rpc_error'];
    execution.failure_kind = rpc?.failure ?? (allowed.includes(error.message) ? error.message : 'preflight_error');
  } finally {
    if (rpc) { rpc.stop(); await rpc.closed; }
  }
  // Include late protocol/cleanup observations before producing a shareable
  // receipt. A successful turn does not erase a failed transport cleanup.
  if (observer) Object.assign(execution, observer.result);
  if (rpc?.failure) {
    execution.error = true;
    execution.failure_kind = rpc.failure;
    execution.exit_code = null;
  }
  execution.cleanup_confirmed = rpc?.closeObserved === true;
  execution.duration_ms = Math.round(performance.now() - started);
  return evaluate(challenge, execution);
}
