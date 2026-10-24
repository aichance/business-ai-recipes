import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';

export const LOADER_VERSION = 'codex-cli 0.163.0';
export const LOADER_VERSIONS = Object.freeze([LOADER_VERSION, 'codex-cli 0.164.0']);
const MAX_DEPTH = 128;
const MAX_BYTES = 4 * 1024 * 1024;
const whitespace = /^\p{White_Space}+|\p{White_Space}+$/gu;
const trim = value => value.replace(whitespace, '');
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (root, path) => { const r = relative(root, path); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
const display = (root, path) => relative(root, path).split(sep).join('/') || '.';
const metadata = s => [s.size, s.mtimeMs, s.ctimeMs, s.ino, s.dev, s.mode];
const sameMetadata = (a, b) => JSON.stringify(metadata(a)) === JSON.stringify(metadata(b));

export function discoverySettings(config, platform = process.platform) {
  const budget = config.project_doc_max_bytes ?? 32768;
  const markers = config.project_root_markers ?? ['.git'];
  const fallback = config.project_doc_fallback_filenames ?? [];
  if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('invalid_project_budget');
  if (!Array.isArray(markers) || markers.length > 64 || markers.some(x => typeof x !== 'string')) throw new Error('invalid_root_markers');
  if (!Array.isArray(fallback) || fallback.length > 64 || fallback.some(x => typeof x !== 'string')) throw new Error('invalid_fallback_filenames');
  for (const marker of markers) {
    // Never use a configured marker to probe a foreign/absolute/parent path.
    if (!marker || marker.includes('\0') || isAbsolute(marker) || /^[A-Za-z]:[\\/]/.test(marker) || marker.startsWith('\\\\') || marker.split(/[\\/]/).includes('..') || platform === 'win32' && marker.includes(':')) {
      throw new Error('unsupported_root_marker_path');
    }
  }
  const names = ['AGENTS.override.md', 'AGENTS.md'];
  let ignoredFallbacks = 0;
  for (const raw of fallback) {
    const name = raw;
    if (!name || name === '.' || name === '..' || /[\/\0]/.test(name) || platform === 'win32' && /[\\:]/.test(name)) { ignoredFallbacks++; continue; }
    if (!names.includes(name)) names.push(name);
  }
  return {budget, markers, names, ignoredFallbacks};
}

async function getMeta(path) {
  try { return {stat: await lstat(path)}; }
  catch (error) { return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? {missing: true} : {error: true}; }
}

async function prefix(path, expectedStat, bytes) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || !sameMetadata(expectedStat, before)) throw new Error('snapshot_changed');
    const data = Buffer.alloc(bytes);
    let read = 0;
    while (read < bytes) {
      const result = await handle.read(data, read, bytes - read, read);
      if (result.bytesRead === 0) throw new Error('snapshot_changed');
      read += result.bytesRead;
    }
    if (!sameMetadata(before, await handle.stat())) throw new Error('snapshot_changed');
    return data;
  } finally { await handle.close(); }
}

export async function inventorySnapshot(cwd, config, {signal} = {}) {
  const settings = discoverySettings(config);
  const issues = [];
  const signatures = [];
  const checkAbort = () => { if (signal?.aborted) throw new Error('cancelled_or_timeout'); };
  let root = cwd;
  if (settings.markers.length) {
    let cursor = cwd;
    let found = false;
    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      checkAbort();
      for (const marker of settings.markers) {
        const path = join(cursor, marker);
        if (!inside(cursor, path)) throw new Error('unsupported_root_marker_path');
        const meta = await getMeta(path);
        signatures.push(['root-marker', path, meta.missing ? 'missing' : meta.error ? 'error' : meta.stat.isSymbolicLink() ? 'symlink' : 'exists']);
        if (meta.error || meta.stat?.isSymbolicLink()) {
          issues.push(meta.error ? 'root_marker_metadata_unavailable' : 'root_marker_symlink_unconfirmed');
          root = cursor; found = true; break;
        }
        if (meta.stat && !meta.stat.isSymbolicLink()) { root = cursor; found = true; break; }
      }
      if (found || dirname(cursor) === cursor) break;
      cursor = dirname(cursor);
      if (depth === MAX_DEPTH - 1) issues.push('root_search_depth_limit');
    }
  }
  const chain = [];
  for (let cursor = cwd; ; cursor = dirname(cursor)) {
    checkAbort(); chain.push(cursor);
    if (cursor === root) break;
    if (chain.length >= MAX_DEPTH || dirname(cursor) === cursor) throw new Error('instruction_chain_unconfirmed');
  }
  chain.reverse();
  for (const directory of chain) {
    const meta = await getMeta(directory);
    if (!meta.stat?.isDirectory() || meta.stat?.isSymbolicLink()) issues.push('instruction_directory_unconfirmed');
  }
  if (issues.length) return {root, cwd, settings, rows: [], issues: [...new Set(issues)],
    signature: hash(JSON.stringify([settings, root, chain, signatures])), directory_count: chain.length, examined_bytes: 0};
  const rows = [];
  let remaining = settings.budget;
  let readBytes = 0;
  let readFailed = false;
  for (const directory of chain) {
    let selected = false;
    let uncertainSelection = false;
    for (const name of settings.names) {
      checkAbort();
      const absolute = join(directory, name);
      const meta = await getMeta(absolute);
      signatures.push(['candidate', absolute, meta.missing ? 'missing' : meta.error ? 'error' : metadata(meta.stat)]);
      if (meta.missing) continue;
      const row = {path: display(root, absolute), file_bytes: meta.stat?.size ?? null, selected: false,
        estimated_status: 'UNKNOWN', examined_bytes: 0, estimated_budget_used: 0,
        remaining_before: remaining, remaining_after: remaining, _absolute: absolute, _expected: false};
      rows.push(row);
      if (meta.error) {
        if (!selected) { issues.push('candidate_metadata_unavailable'); readFailed = true; uncertainSelection = true; row.selected = null; }
        else row.estimated_status = 'UNINSPECTED_SHADOWED';
        continue;
      }
      if (meta.stat.isSymbolicLink()) {
        row.file_bytes = null;
        if (selected) { row.estimated_status = 'SHADOWED'; continue; }
        issues.push('guidance_symlink_unconfirmed'); readFailed = true; uncertainSelection = true;
        row.selected = null; row.estimated_status = 'UNCONFIRMED_SYMLINK'; continue;
      }
      if (!meta.stat.isFile()) { row.estimated_status = 'NOT_A_FILE'; continue; }
      if (selected) { row.estimated_status = 'SHADOWED'; continue; }
      if (uncertainSelection) { row.selected = null; row.estimated_status = 'UNCONFIRMED_SELECTION'; continue; }
      selected = true; row.selected = true;
      if (readFailed) { row.estimated_status = 'UNCONFIRMED_PRIOR_READ'; continue; }
      if (remaining === 0) { row.estimated_status = 'SKIPPED_BUDGET'; continue; }
      const count = Math.min(meta.stat.size, remaining);
      if (!Number.isSafeInteger(count) || count < 0 || readBytes + count > MAX_BYTES) {
        issues.push('text_snapshot_limit'); readFailed = true; continue;
      }
      try {
        const data = await prefix(absolute, meta.stat, count);
        readBytes += data.length; row.examined_bytes = data.length;
        signatures.push(['prefix', absolute, hash(data)]);
        // Rust char::is_whitespace excludes BOM and includes U+0085; JS trim differs.
        if (!trim(data.toString('utf8'))) {
          row.estimated_status = 'SKIPPED_EMPTY_OR_WHITESPACE_PREFIX'; continue;
        }
        row._expected = true;
        row.estimated_budget_used = data.length;
        remaining -= data.length;
        row.remaining_after = remaining;
        row.estimated_status = meta.stat.size > data.length ? 'TRUNCATED' : 'FULL';
      } catch {
        issues.push('guidance_read_unconfirmed'); readFailed = true;
      }
    }
  }
  return {root, cwd, settings, rows, issues: [...new Set(issues)],
    signature: hash(JSON.stringify([settings, root, chain, signatures])),
    directory_count: chain.length, examined_bytes: readBytes};
}

export function budgetReport(snapshot, nativeSources = null, knownGlobalSources = [], clientVersion = LOADER_VERSION) {
  if (!LOADER_VERSIONS.includes(clientVersion)) throw new Error('unsupported_loader_version');
  const observed = nativeSources !== null;
  if (observed && (!Array.isArray(nativeSources) || nativeSources.some(x => typeof x !== 'string' || !isAbsolute(x)))) throw new Error('invalid_native_source_paths');
  const native = new Set((nativeSources ?? []).map(x => normalize(x)));
  const projectPaths = [...native].filter(x => inside(snapshot.root, x));
  const globals = new Set(knownGlobalSources.map(x => normalize(x)));
  const unknownOutside = [...native].filter(x => !inside(snapshot.root, x) && !globals.has(x));
  const expected = snapshot.rows.filter(x => x._expected).map(x => normalize(x._absolute));
  const matches = unknownOutside.length === 0 && native.size === nativeSources?.length && projectPaths.length === expected.length && projectPaths.every(x => expected.includes(x));
  return {basis: `local-snapshot-and-${clientVersion.replace('codex-cli ', 'rust-v')}-loader`,
    native_path_membership_is_not_full_bytes_or_cause: true,
    effective_project_doc_max_bytes: snapshot.settings.budget,
    startup_directory: display(snapshot.root, snapshot.cwd),
    directory_count: snapshot.directory_count,
    ignored_fallback_entries: snapshot.settings.ignoredFallbacks,
    native_project_sources: observed ? projectPaths.map(x => display(snapshot.root, x)) : null,
    other_native_source_count: observed ? nativeSources.length - projectPaths.length : null,
    unknown_external_source_count: observed ? unknownOutside.length : null,
    selection_matches_native_paths: observed ? matches : null,
    issues: snapshot.issues,
    rows: snapshot.rows.map(({_absolute, _expected, ...row}) => ({...row, native_listed: observed ? native.has(normalize(_absolute)) : null}))};
}
