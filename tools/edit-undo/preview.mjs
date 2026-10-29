import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, mkdir, readFile, writeFile, mkdtemp, rm, rename } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const MAX_BYTES = 1024 * 1024;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const contained = (root, path) => { const p = relative(root, path); return p === '' || (!isAbsolute(p) && p !== '..' && !p.startsWith('../')); };

function validPath(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || /[\\\0:]/.test(path)
      || path.split('/').some(p => !p || p === '.' || p === '..')
      || path.split('/').some(p => { const name = p.toLowerCase(); return name === '.git' || name === '.env' || name.startsWith('.env.'); })) {
    throw new Error(`Unsupported selected path: ${path}`);
  }
  return path;
}

function state(exists, content = null, mode = null) {
  const record = { exists, content, mode };
  return { ...record, hash: hash(record) };
}

export async function observe(root, selectedPath) {
  validPath(selectedPath);
  const parts = selectedPath.split('/');
  let p = root;
  for (const [i, part] of parts.entries()) {
    p = join(p, part);
    let info;
    try { info = await lstat(p); } catch (error) {
      if (error.code === 'ENOENT') return state(false);
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Symlink is not supported: ${selectedPath}`);
    if (i < parts.length - 1 && !info.isDirectory()) throw new Error(`Non-directory parent: ${selectedPath}`);
    if (i === parts.length - 1 && (!info.isFile() || info.size > MAX_BYTES)) throw new Error(`Unsupported file: ${selectedPath}`);
  }
  const file = await open(p, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > MAX_BYTES) throw new Error(`Unsupported file: ${selectedPath}`);
    const bytes = await file.readFile();
    const after = await file.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length > MAX_BYTES) {
      throw new Error(`File changed while reading: ${selectedPath}`);
    }
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error(`Binary file is not supported: ${selectedPath}`);
    return state(true, text, before.mode & 0o777);
  } finally { await file.close(); }
}

async function saveSession(directory, record, exclusive = false) {
  const data = { ...record, digest: hash(record) };
  const destination = join(directory, 'session.json');
  const temporary = exclusive ? destination : join(directory, `.session-${randomUUID()}`);
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  if (!exclusive) {
    try { await rename(temporary, destination); }
    finally { await rm(temporary, { force: true }); }
  }
}

async function loadSession(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Session directory must be a real directory');
  const sessionFile = join(directory, 'session.json');
  if ((await lstat(sessionFile)).isSymbolicLink()) throw new Error('Session file cannot be a symlink');
  const data = JSON.parse(await readFile(sessionFile, 'utf8'));
  const { digest, ...record } = data;
  if (record.schema !== 1 || digest !== hash(record) || typeof record.project !== 'string' || !Array.isArray(record.paths)
      || record.paths.length === 0 || record.paths.length > 32 || new Set(record.paths).size !== record.paths.length) {
    throw new Error('Invalid or modified session');
  }
  record.paths.forEach(validPath);
  if (!Array.isArray(record.before) || record.after !== null && !Array.isArray(record.after)) throw new Error('Invalid required snapshots');
  if (await realpath(record.project) !== record.project || contained(record.project, await realpath(directory))) {
    throw new Error('Session/project boundary changed');
  }
  for (const snapshot of [record.before, record.after].filter(Boolean)) {
    if (!Array.isArray(snapshot) || snapshot.length !== record.paths.length) throw new Error('Invalid snapshot length');
    for (const entry of snapshot) {
      if (typeof entry?.exists !== 'boolean' || (entry.exists && (typeof entry.content !== 'string' || !Number.isInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777))
          || (!entry.exists && (entry.content !== null || entry.mode !== null))
          || state(entry.exists, entry.content, entry.mode).hash !== entry.hash) throw new Error('Invalid snapshot record');
    }
  }
  return record;
}

export async function begin({ project, paths, session }) {
  const root = await realpath(project);
  if (!(await lstat(root)).isDirectory()) throw new Error('Project must be a directory');
  if (paths.length < 1 || paths.length > 32 || new Set(paths).size !== paths.length) throw new Error('Select 1–32 unique files');
  paths.forEach(validPath);
  const absolute = resolve(session);
  const target = join(await realpath(dirname(absolute)), basename(absolute));
  if (contained(root, target)) throw new Error('Place the session outside the target project');
  const before = [];
  for (const path of paths) before.push(await observe(root, path));
  await mkdir(target, { mode: 0o700 });
  // A session cannot modify its target project; it contains only the explicitly selected files.
  await saveSession(target, { schema: 1, project: root, paths, before, after: null }, true);
  return { session: target, files: paths.length, targetWrites: 0 };
}

export async function seal(session) {
  const record = await loadSession(session);
  if (record.after) throw new Error('Session is already sealed');
  const after = [];
  for (const path of record.paths) after.push(await observe(record.project, path));
  await saveSession(session, { ...record, after });
  return { files: after.length, targetWrites: 0 };
}

async function inverseMerge(current, agent, original) {
  const work = await mkdtemp(join(tmpdir(), 'edit-undo-merge-'));
  try {
    const files = ['current', 'agent', 'original'].map(name => join(work, name));
    await Promise.all(files.map((path, i) => writeFile(path, [current, agent, original][i], { mode: 0o600 })));
    try {
      const r = await exec('git', ['merge-file', '-p', ...files], { cwd: work, timeout: 5000, maxBuffer: 8 * MAX_BYTES });
      return { ok: true, content: r.stdout };
    } catch (error) {
      if (Number.isInteger(error.code) && error.code > 0 && error.code < 128) return { ok: false, reason: 'Overlapping changes require a human decision' };
      throw new Error(`Git merge failed: ${error.message}`);
    }
  } finally { await rm(work, { recursive: true, force: true }); }
}

export async function preview(session) {
  const record = await loadSession(session);
  if (!record.after) throw new Error('Seal the end of the AI edit window first');
  const entries = [];
  for (const [i, path] of record.paths.entries()) {
    const before = record.before[i], agent = record.after[i], current = await observe(record.project, path);
    let proposed = null, status, reason;
    if (before.hash === agent.hash) { status = 'KEEP'; proposed = current; reason = 'No change inside the recorded edit window'; }
    else if (current.hash === agent.hash) { status = 'REVERT'; proposed = before; reason = 'No later change to this file'; }
    else if (!current.exists && agent.exists) { status = 'KEEP'; proposed = current; reason = 'Preserve the later file deletion'; }
    else if (!before.exists || !agent.exists || current.mode !== agent.mode || before.mode !== agent.mode) {
      status = 'CONFLICT'; reason = 'Creation, deletion or mode change overlaps later edits';
    } else {
      const merged = await inverseMerge(current.content, agent.content, before.content);
      if (merged.ok) { status = 'MERGE'; proposed = state(true, merged.content, current.mode); reason = 'Inverse text change merged into the current file'; }
      else { status = 'CONFLICT'; reason = merged.reason; }
    }
    entries.push({ path, status, reason, before, agent, current, proposed });
  }
  return { schema: 1, project: record.project, previewOnly: true, targetWrites: 0,
    status: entries.some(x => x.status === 'CONFLICT') ? 'CONFLICT' : 'READY_TO_REVIEW', entries };
}

export function renderPreview(report) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edit Undo — preview</title><style>body{font:16px system-ui;margin:0;background:#101820;color:#edf4ed}main{max-width:1450px;margin:auto;padding:36px}h1{font-size:42px}small{color:#a7b7c2}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:#1b2934;padding:18px;border-radius:14px;overflow:auto}pre{font:14px/1.65 ui-monospace,monospace;white-space:pre-wrap}.proposed{border:2px solid #b8ef73}.badge{display:inline-block;background:#b8ef73;color:#142214;border-radius:30px;padding:8px 15px}.conflict{color:#ffc487}@media(max-width:900px){.grid{grid-template-columns:1fr}}</style>
<main><small>LOCAL EXPERIMENT · NO TARGET FILES CHANGED</small><h1>Undo the edit window.<br>Keep what came after.</h1><p class="badge">${escape(report.status)} · preview only</p><p>Three recorded states. Git text merge, not inferred authorship. Conflicts remain untouched.</p>
${report.entries.map(e => `<section><h2>${escape(e.path)} <small class="${e.status === 'CONFLICT' ? 'conflict' : ''}">${escape(e.status)}</small></h2><p>${escape(e.reason)}</p><div class="grid"><article class="card"><h3>Before the AI window</h3><pre>${escape(e.before.exists ? e.before.content : '(absent)')}</pre></article><article class="card"><h3>Current · includes later edits</h3><pre>${escape(e.current.exists ? e.current.content : '(absent)')}</pre></article><article class="card proposed"><h3>Proposed result</h3><pre>${escape(e.proposed ? (e.proposed.exists ? e.proposed.content : '(absent)') : 'CONFLICT — no result is applied')}</pre></article></div></section>`).join('')}
<p><small>Requires recording before and after the AI edit window. Concurrent human edits inside that window cannot be attributed. New-file overlaps are not merged. This prototype has no apply command.</small></p></main></html>`;
}

export async function writePreviewHTML(report, filename) {
  const absolute = resolve(filename);
  const target = join(await realpath(dirname(absolute)), basename(absolute));
  if (contained(report.project, target)) throw new Error('Keep preview output outside the target project');
  await writeFile(target, renderPreview(report), { flag: 'wx', mode: 0o600 });
}
