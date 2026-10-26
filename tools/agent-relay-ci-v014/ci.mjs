import {appendFile, lstat, mkdir, mkdtemp, readFile, realpath, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {delimiter, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

export const COMMON_VERSION = '0.1.4';
export const CODEX_VERSION = '0.164.0';
export const ZIP_SHA256 = 'd21cf2f75c069b244b212f8988085d952b2159e4e07842ed806235c52998dcda';
const ZIP_BYTES = 54863;
const ZIP_URL = 'https://aichance.github.io/business-ai-recipes/agent-relay-check-v0.1.4.zip';
const SAFE_METHODS = new Set(['initialize', 'config/read', 'thread/start']);

class CheckFailure extends Error {
  constructor(code, rejected = false) { super(code); this.rejected = rejected; }
}

function inside(root, path) {
  const suffix = relative(root, path);
  return suffix === '' || suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

export function requiredFiles(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new CheckFailure('invalid_required_files', true);
  const files = value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!files.length || files.length > 32 || new Set(files).size !== files.length
      || files.some(x => isAbsolute(x) || /[\x00-\x1f\x7f\\]/.test(x)
        || x.split('/').some(part => !part || part === '.' || part === '..'))) {
    throw new CheckFailure('invalid_required_files', true);
  }
  return files;
}

export function childEnvironment(source, context = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'RUNNER_TRACKING_ID']) {
    if (typeof source[key] === 'string') env[key] = source[key];
  }
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_OPTIONAL_LOCKS = '0';
  if (context.codexHome) env.CODEX_HOME = context.codexHome;
  if (context.cliBin) env.PATH = `${context.cliBin}${delimiter}${env.PATH ?? ''}`;
  return env;
}

export function runSubprocess(command, args, {env, cwd, timeout = 10000, signal, graceMs = 5000}) {
  return new Promise(resolveResult => {
    let child, timer, forceTimer, drainTimer, ended = false, interrupted = null, bytes = 0;
    const output = {stdout: [], stderr: []};
    const finish = (status, exitSignal = null) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer); clearTimeout(forceTimer); clearTimeout(drainTimer);
      signal?.removeEventListener('abort', abort);
      resolveResult({status, signal: exitSignal, interrupted,
        stdout: Buffer.concat(output.stdout).toString('utf8'), stderr: Buffer.concat(output.stderr).toString('utf8')});
    };
    const interrupt = reason => {
      if (ended || interrupted) return;
      interrupted = reason;
      if (child?.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      forceTimer = setTimeout(() => {
        if (child?.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        child?.stdout?.destroy(); child?.stderr?.destroy();
        drainTimer = setTimeout(() => finish(child?.exitCode ?? null, child?.signalCode ?? null), 1000);
      }, graceMs);
    };
    const abort = () => interrupt('cancelled');
    if (signal?.aborted) { interrupted = 'cancelled'; finish(null); return; }
    try { child = spawn(command, args, {env, cwd, stdio: ['ignore', 'pipe', 'pipe']}); }
    catch { interrupted = 'spawn_error'; finish(null); return; }
    child.once('error', () => { interrupted ??= 'spawn_error'; finish(null); });
    child.once('close', finish);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) interrupt('output_limit');
      else output[stream].push(chunk);
    });
    signal?.addEventListener('abort', abort, {once: true});
    timer = setTimeout(() => interrupt('timeout'), timeout);
    if (signal?.aborted) abort();
  });
}

async function run(command, args, options) {
  const result = await runSubprocess(command, args, options);
  if (result.interrupted || result.signal || result.status === null) throw new CheckFailure('subprocess_incomplete');
  return result;
}

export async function projectContext(workspaceValue, projectValue, env, signal) {
  if (typeof projectValue !== 'string' || !projectValue.trim() || projectValue.length > 2048
      || isAbsolute(projectValue) || /[\x00-\x1f\x7f\\]/.test(projectValue)) {
    throw new CheckFailure('invalid_project_directory', true);
  }
  const workspace = await realpath(workspaceValue);
  const requested = resolve(workspace, projectValue);
  if (!inside(workspace, requested)) throw new CheckFailure('project_outside_workspace', true);
  const project = await realpath(requested);
  if (!inside(workspace, project)) throw new CheckFailure('project_outside_workspace', true);
  const git = await run('git', ['-C', project, 'rev-parse', '--show-toplevel'], {env, cwd: workspace, signal});
  if (git.status !== 0) throw new CheckFailure('project_git_root_unavailable', true);
  const root = await realpath(git.stdout.trim());
  if (!inside(workspace, root) || !inside(root, project)) throw new CheckFailure('git_root_outside_workspace', true);
  return {workspace, project, root, startup: relative(root, project).split(sep).join('/') || '.'};
}

export function judgeReport(report, expected, startup, commandExit = 0) {
  const o = report?.observation, e = report?.estimate;
  const contract = commandExit === 0 && report?.schema_version === '1'
    && report.tool === 'agent-relay-check' && report.tool_version === COMMON_VERSION
    && report.client_version === `codex-cli ${CODEX_VERSION}` && report.status === 'INSPECTED'
    && report.receipt === 'NOT_TESTED' && report.compliance === 'NOT_TESTED'
    && o?.kind === 'native-startup-source-paths' && o.model_turn_requests === 0
    && o.requested_model === 'gpt-6.1-sol' && o.resolved_model === 'gpt-6.1-sol'
    && o.requested_effort === 'max' && o.resolved_effort === 'max'
    && o.fresh_ephemeral_thread === true && o.single_local_environment === true
    && o.cleanup_confirmed === true && o.native_servers_started === 2 && o.native_servers_closed === 2
    && Array.isArray(o.request_methods) && o.request_methods.every(x => SAFE_METHODS.has(x))
    && [...SAFE_METHODS].every(x => o.request_methods.includes(x))
    && e?.state === 'NATIVE_PATHS_MATCH_LOCAL_ESTIMATE'
    && e.basis === 'local-snapshot-and-rust-v0.164.0-loader'
    && e.native_path_membership_is_not_full_bytes_or_cause === true
    && e.startup_directory === startup && e.snapshot_stable === true
    && e.selection_matches_native_paths === true && e.other_native_source_count === 0
    && e.unknown_external_source_count === 0 && Array.isArray(e.issues) && e.issues.length === 0
    && Number.isSafeInteger(e.effective_project_doc_max_bytes) && e.effective_project_doc_max_bytes >= 0
    && Array.isArray(e.rows) && e.rows.every(x => x && typeof x.path === 'string')
    && new Set(e.rows.map(x => x.path)).size === e.rows.length
    && Array.isArray(e.native_project_sources) && e.native_project_sources.every(x => typeof x === 'string')
    && new Set(e.native_project_sources).size === e.native_project_sources.length;
  if (!contract) return {status: 'INCONCLUSIVE', failures: [{code: 'inspection_contract_unconfirmed'}]};
  const rows = new Map(e.rows.map(row => [row.path, row]));
  const checks = expected.map(path => {
    const row = rows.get(path);
    const native = row?.native_listed === true && e.native_project_sources.includes(path);
    const full = row?.selected === true && row.estimated_status === 'FULL'
      && Number.isSafeInteger(row.file_bytes) && row.file_bytes > 0
      && row.examined_bytes === row.file_bytes && row.estimated_budget_used === row.file_bytes;
    return {path, native_listed: native, estimated_status: row?.estimated_status ?? 'MISSING',
      file_bytes: row?.file_bytes ?? null, examined_bytes: row?.examined_bytes ?? null, full_estimate: full};
  });
  const failures = checks.filter(x => !x.native_listed || !x.full_estimate)
    .map(x => ({path: x.path, code: !x.native_listed ? 'required_source_not_listed' : 'required_source_not_full'}));
  return {status: failures.length ? 'REJECTED' : 'PASSED', failures, required: checks,
    effective_project_doc_max_bytes: e.effective_project_doc_max_bytes,
    inspection: {status: report.status, model_turn_requests: 0, native_servers_started: 2,
      native_servers_closed: 2, cleanup_confirmed: true, snapshot_stable: true}};
}

export function verifyPackage(data) {
  if (!Buffer.isBuffer(data) || data.length !== ZIP_BYTES
      || createHash('sha256').update(data).digest('hex') !== ZIP_SHA256) {
    throw new CheckFailure('package_checksum_mismatch');
  }
  return data;
}

async function downloadPackage(destination, signal) {
  const response = await fetch(ZIP_URL, {signal: AbortSignal.any([signal, AbortSignal.timeout(30000)])});
  if (!response.ok || !response.body) throw new CheckFailure('package_download_failed');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > ZIP_BYTES) throw new CheckFailure('package_size_mismatch');
    chunks.push(chunk);
  }
  await writeFile(destination, verifyPackage(Buffer.concat(chunks)));
}

async function publishResult(env, work, result) {
  const reportPath = join(work, 'result.json');
  await writeFile(reportPath, JSON.stringify(result, null, 2) + '\n');
  if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `status=${result.status}\nreport_path=${reportPath}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    const safeJson = JSON.stringify(result, null, 2).replaceAll('`', '\\u0060').replaceAll('<', '\\u003c');
    await appendFile(env.GITHUB_STEP_SUMMARY,
      `## Agent Relay Check CI: ${result.status}\n\nNative file selection and a separate local byte estimate. `
      + 'Model receipt and instruction compliance were **not tested**.\n\n```json\n' + safeJson + '\n```\n');
  }
  console.log(`Agent Relay Check CI: ${result.status}; receipt/compliance NOT_TESTED.`);
}

export async function main(env = process.env) {
  let work;
  const cancellation = new AbortController();
  const stop = () => cancellation.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const result = {schema_version: '1', tool: 'agent-relay-ci', status: 'INCONCLUSIVE',
    common_version: COMMON_VERSION, codex_version: CODEX_VERSION,
    package_sha256: ZIP_SHA256, package_download_started: false, cli_install_started: false,
    inspection_started: false, receipt: 'NOT_TESTED', compliance: 'NOT_TESTED'};
  try {
    if (process.platform !== 'linux' || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_OS !== 'Linux' || env.RUNNER_ENVIRONMENT !== 'github-hosted'
        || !['push', 'pull_request', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
        || typeof env.RUNNER_TRACKING_ID !== 'string' || !env.RUNNER_TRACKING_ID) {
      throw new CheckFailure('requires_unprivileged_github_hosted_linux_job', true);
    }
    const temporary = await realpath(env.RUNNER_TEMP);
    if (/[\r\n]/.test(temporary)) throw new CheckFailure('invalid_runner_temp', true);
    work = await mkdtemp(join(temporary, 'relay-ci-'));
    const expected = requiredFiles(env.RELAY_REQUIRED_FILES ?? 'AGENTS.md');
    const codexHome = join(work, 'codex-home'), prefix = join(work, 'codex-cli');
    const cliBin = join(prefix, 'node_modules', '.bin');
    const childEnv = childEnvironment(env, {codexHome, cliBin});
    const context = await projectContext(env.GITHUB_WORKSPACE, env.RELAY_PROJECT_DIRECTORY ?? '.', childEnv, cancellation.signal);
    result.runner_tracking_inherited = childEnv.RUNNER_TRACKING_ID === env.RUNNER_TRACKING_ID;
    await mkdir(codexHome);
    await writeFile(join(codexHome, 'config.toml'), 'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "max"\n'
      + `[projects.${JSON.stringify(context.root)}]\ntrust_level = "trusted"\n`);
    const userConfig = join(work, 'npm-user.conf'), globalConfig = join(work, 'npm-global.conf');
    await writeFile(userConfig, ''); await writeFile(globalConfig, '');
    const archive = join(work, 'common.zip');
    result.package_download_started = true;
    await downloadPackage(archive, cancellation.signal);
    const extraction = await run('unzip', ['-q', archive, '-d', join(work, 'common')],
      {env: childEnv, cwd: work, signal: cancellation.signal});
    if (extraction.status !== 0) throw new CheckFailure('package_extraction_failed');
    const tool = join(work, 'common', 'agent-relay-check');
    if (JSON.parse(await readFile(join(tool, 'package.json'), 'utf8')).version !== COMMON_VERSION) {
      throw new CheckFailure('common_version_mismatch');
    }
    result.cli_install_started = true;
    const install = await run('npm', ['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund',
      '--registry=https://registry.npmjs.org', '--userconfig', userConfig, '--globalconfig', globalConfig,
      '--cache', join(work, 'npm-cache'), '--package-lock=false', `@openai/codex@${CODEX_VERSION}`],
    {env: childEnv, cwd: work, timeout: 150000, signal: cancellation.signal});
    if (install.status !== 0) throw new CheckFailure('official_cli_install_failed');
    result.inspection_started = true;
    const inspection = await run(process.execPath, [join(tool, 'cli.mjs'), 'inspect', '--project', context.project,
      '--timeout-seconds', '30'], {env: childEnv, cwd: context.project, timeout: 70000, signal: cancellation.signal});
    let report;
    try { report = JSON.parse(inspection.stdout); }
    catch { throw new CheckFailure('inspection_output_unconfirmed'); }
    try {
      await lstat(join(codexHome, 'auth.json'));
      throw new CheckFailure('unexpected_auth_file');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    result.auth_file_created = false;
    Object.assign(result, judgeReport(report, expected, context.startup, inspection.status));
  } catch (error) {
    result.status = error instanceof CheckFailure && error.rejected ? 'REJECTED' : 'INCONCLUSIVE';
    result.failures = [{code: error instanceof CheckFailure ? error.message : 'ci_execution_unconfirmed'}];
  }
  if (cancellation.signal.aborted) { result.status = 'INCONCLUSIVE'; result.failures = [{code: 'ci_cancelled'}]; }
  try {
    if (work) await publishResult(env, work, result);
    else console.error('Agent Relay Check CI could not start in the required runner context.');
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
  return result.status === 'PASSED' && !cancellation.signal.aborted ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(() => {
    console.error('Agent Relay Check CI result could not be saved.'); process.exitCode = 1;
  });
}
