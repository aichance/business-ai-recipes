import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const reference = JSON.parse(await readFile(join(here, 'SOURCE.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
export const CASES = [
  { file: 'preservation.json', exit: 0, results: [['reload', 'pass', 'compare'], ['rejected-update', 'pass', 'compare']] },
  { file: 'roundtrip.json', exit: 0, results: [['backup-roundtrip', 'pass', 'complete']] },
  { file: 'changed-goal-control.json', exit: 1, results: [['reload', 'fail', 'compare']] },
  { file: 'wrong-baseline-control.json', exit: 2, results: [['reload', 'inconclusive', 'baseline']] },
];

export function options(args) {
  const { values } = parseArgs({ args, options: {
    'fetch-source': { type: 'boolean', default: false },
    'app-ref': { type: 'string', default: reference.source_commit },
    out: { type: 'string' },
  } });
  requireThat(values['fetch-source'], 'Explicit --fetch-source is required; this trial downloads public LifePilot source');
  requireThat(/^[a-f0-9]{40}$/.test(values['app-ref']), '--app-ref must be a full lowercase 40-character commit SHA');
  requireThat(values.out && values.out.trim(), '--out must name a new output directory');
  return { commit: values['app-ref'], out: resolve(values.out) };
}

export async function limitedGet(url, maxBytes, fetchImpl = fetch) {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'AppCrashLab-LifePilot-Public-Trial' } });
  requireThat(response.ok, `Public source request returned HTTP ${response.status}`);
  const declared = response.headers.get('content-length');
  if (declared && (!Number.isSafeInteger(Number(declared)) || Number(declared) < 0 || Number(declared) > maxBytes)) {
    await response.body?.cancel();
    throw new Error('Public response exceeds its byte limit');
  }
  const pieces = []; let length = 0;
  for await (const piece of response.body) {
    length += piece.byteLength;
    requireThat(length <= maxBytes, 'Public response exceeds its byte limit');
    pieces.push(Buffer.from(piece));
  }
  return Buffer.concat(pieces);
}

export async function loadSource(commit, fetchImpl = fetch) {
  requireThat(/^[a-f0-9]{40}$/.test(commit), 'Invalid commit SHA');
  const owner = JSON.parse(await limitedGet('https://api.github.com/users/gregmoulton', 65536, fetchImpl));
  requireThat(owner.type === 'User' && owner.id === reference.owner_id && owner.login.toLowerCase() === 'gregmoulton', 'LifePilot personal owner scope changed');
  const repo = JSON.parse(await limitedGet('https://api.github.com/repos/gregmoulton/LifePilot', 65536, fetchImpl));
  requireThat(repo.id === reference.repo_id && repo.private === false && repo.owner?.type === 'User' && repo.owner.id === reference.owner_id, 'LifePilot public personal repository scope changed');
  const files = new Map(); const measured = [];
  for (const item of reference.files) {
    requireThat(['index.html', 'execution.js'].includes(item.path), 'Unexpected source path in the reference');
    const bytes = await limitedGet(`https://raw.githubusercontent.com/gregmoulton/LifePilot/${commit}/${item.path}`, 2 * 1024 * 1024, fetchImpl);
    const sha256 = digest(bytes);
    if (commit === reference.source_commit) requireThat(sha256 === item.sha256, 'Original pinned source hash changed');
    files.set(`/${item.path}`, bytes);
    measured.push({ path: item.path, bytes: bytes.length, sha256, matches_original_reference: sha256 === item.sha256 });
  }
  return { files, source: { owner_id: owner.id, repo_id: repo.id, commit, files: measured } };
}

export async function serve(files) {
  let origin;
  const server = createServer((req, res) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (req.headers.host !== new URL(origin).host) { res.writeHead(403, headers); res.end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, headers); res.end(); return; }
    const pathname = new URL(req.url, origin).pathname;
    const path = pathname === '/' ? '/index.html' : pathname;
    const bytes = files.get(path);
    if (!bytes) { res.writeHead(path === '/favicon.ico' ? 204 : 404, headers); res.end(); return; }
    res.writeHead(200, { ...headers, 'Content-Type': path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: async () => { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); } };
}

export function checkReport(testCase, exit, report) {
  requireThat(exit === testCase.exit, `${testCase.file}: expected exit ${testCase.exit}, observed ${exit}`);
  requireThat(Array.isArray(report.results) && report.results.length === testCase.results.length, `${testCase.file}: missing or extra results`);
  for (const [i, expected] of testCase.results.entries()) {
    const actual = report.results[i];
    requireThat(JSON.stringify([actual.check, actual.status, actual.phase]) === JSON.stringify(expected), `${testCase.file}: unexpected result or phase`);
    if (actual.status === 'pass') requireThat(actual.differences?.length === 0, `${testCase.file}: PASS has differences`);
  }
  if (testCase.file === 'changed-goal-control.json') requireThat(report.results[0].differences?.some(d => d.path === '$["profile"]["goals"]["1"]["status"]' && d.before === 'active' && d.after === 'paused'), 'Changed-goal control did not detect the expected full-profile goal status change');
  if (testCase.file === 'wrong-baseline-control.json') requireThat(report.results[0].error === 'Known-good baseline did not match expected values; no preservation verdict', 'Wrong-baseline control did not finish at the intended baseline assertion');
  return report.results.map(r => ({ check: r.check, status: r.status, phase: r.phase, differences: r.differences }));
}

function processTable() {
  if (process.platform === 'linux') {
    return readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap(name => {
      try {
        const stat = readFileSync(`/proc/${name}/stat`, 'utf8');
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        return [{ pid: Number(name), parent: Number(fields[1]), group: Number(fields[2]) }];
      } catch (error) { if (['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) return []; throw error; }
    });
  }
  requireThat(process.platform === 'darwin', 'The trial process cleanup supports Linux and macOS only');
  return execFileSync('/bin/ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 2000, maxBuffer: 4 * 1024 * 1024 })
    .trim().split('\n').map(line => {
      const [pid, parent, group] = line.trim().split(/\s+/).map(Number);
      requireThat([pid, parent, group].every(Number.isSafeInteger), 'Invalid process ownership snapshot');
      return { pid, parent, group };
    });
}

function killOwnedTree(root) {
  const kill = pid => { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
  try {
    const table = processTable();
    const owned = new Set([root]);
    for (let changed = true; changed;) {
      changed = false;
      for (const row of table) if (owned.has(row.parent) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; }
    }
    // Chromium may create a separate process group. Only signal a whole group
    // when its leader belongs to this exact child tree, never our parent's group.
    const groups = new Set(table.filter(row => owned.has(row.pid) && owned.has(row.group)).map(row => row.group));
    for (const group of groups) if (group !== root) kill(-group);
    for (const row of table) if (row.pid !== root && owned.has(row.pid) && !groups.has(row.group)) kill(row.pid);
  } finally { kill(-root); }
}

export async function invoke(args, milliseconds = 120000) {
  requireThat(['linux', 'darwin'].includes(process.platform), 'The trial process cleanup supports Linux and macOS only');
  const child = spawn(process.execPath, args, { stdio: 'inherit', detached: true });
  const exited = once(child, 'exit');
  let timedOut = false; let interruption; let cleanupError; let stopping = false;
  const stop = () => {
    if (stopping || !child.pid) return;
    stopping = true;
    try { killOwnedTree(child.pid); } catch (error) { cleanupError = error; }
  };
  const onInt = () => { interruption = 'SIGINT'; stop(); };
  const onTerm = () => { interruption = 'SIGTERM'; stop(); };
  process.once('SIGINT', onInt); process.once('SIGTERM', onTerm);
  const timer = setTimeout(() => { timedOut = true; stop(); }, milliseconds);
  try {
    const [code, signal] = await exited;
    requireThat(!cleanupError, `CLI cleanup incomplete: ${cleanupError?.message}`);
    requireThat(!interruption, `CLI trial interrupted by ${interruption}`);
    requireThat(!timedOut && !signal, 'CLI exceeded its deadline or ended by signal');
    return code;
  } finally { clearTimeout(timer); process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); }
}

export async function main(args) {
  const config = options(args);
  requireThat(process.platform !== 'win32', 'Use the GitHub Linux workflow for this helper; the regular App Crash Lab CLI is separate');
  await mkdir(dirname(config.out), { recursive: true });
  await mkdir(config.out, { recursive: false });
  const runner = JSON.parse(await readFile(resolve(here, '../../package.json'), 'utf8'));
  const summary = { schemaVersion: 1, status: 'inconclusive', runner_version: runner.version,
    github_context: { actor: process.env.GITHUB_ACTOR ?? null, repository: process.env.GITHUB_REPOSITORY ?? null, run_id: process.env.GITHUB_RUN_ID ?? null },
    adoption: 'Not inferred here. Verify the actual public run actor, app ownership and report before counting independent use.', cases: [] };
  let app;
  try {
    const loaded = await loadSource(config.commit);
    summary.source = loaded.source;
    await writeFile(join(config.out, 'source-check.json'), JSON.stringify(loaded.source, null, 2) + '\n');
    app = await serve(loaded.files);
    for (const testCase of CASES) {
      const name = testCase.file.replace('.json', '');
      const out = join(config.out, name);
      const exit = await invoke([resolve(here, '../../cli.mjs'), 'run', join(here, testCase.file), '--base-url', app.origin, '--out', out]);
      const report = JSON.parse(await readFile(join(out, 'report.json'), 'utf8'));
      requireThat(Array.isArray(report.results), 'CLI did not write a result array');
      const record = { contract: testCase.file, exit, expected_outcome_verified: false,
        observations: report.results.map(r => ({ check: r.check, status: r.status, phase: r.phase, differences: r.differences })), report: `${name}/report.json` };
      summary.cases.push(record);
      try { checkReport(testCase, exit, report); }
      catch (error) {
        record.error = error.message;
        summary.error = error.message;
        summary.status = exit === 2 ? 'inconclusive' : 'unexpected-outcomes';
        return exit === 2 ? 2 : 1;
      }
      record.expected_outcome_verified = true;
    }
    summary.status = 'expected-outcomes-verified';
    return 0;
  } catch (error) {
    summary.error = error.message;
    throw error;
  } finally {
    if (app) await app.close();
    await writeFile(join(config.out, 'trial-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
    console.error(`LifePilot trial INCONCLUSIVE: ${error.message}`); process.exitCode = 2;
  });
}
