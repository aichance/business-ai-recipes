import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverySettings, inventorySnapshot, budgetReport } from '../lib/inventory.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'relay-inventory-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, '.git')); await mkdir(join(root, 'child'));
  return root;
}

test('native counterexample: listed does not distinguish full and partial child bytes', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  await writeFile(join(root, 'AGENTS.md'), 'R'.repeat(40));
  const reports = [];
  for (const size of [60, 200]) {
    await writeFile(join(child, 'AGENTS.md'), 'C'.repeat(size));
    reports.push(budgetReport(await inventorySnapshot(child, {project_doc_max_bytes: 128}), [join(root, 'AGENTS.md'), join(child, 'AGENTS.md')]));
  }
  assert.deepEqual(reports[0].native_project_sources, reports[1].native_project_sources);
  assert.equal(reports[0].rows[1].estimated_status, 'FULL');
  assert.equal(reports[1].rows[1].estimated_status, 'TRUNCATED');
  assert.equal(reports[1].rows[1].examined_bytes, 88);
  assert(reports.every(x => x.selection_matches_native_paths));
});

test('parent exhaustion versus empty child override: native absence alone is ambiguous', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  await writeFile(join(root, 'AGENTS.md'), 'R'.repeat(128)); await writeFile(join(child, 'AGENTS.md'), 'C');
  const a = budgetReport(await inventorySnapshot(child, {project_doc_max_bytes: 128}), [join(root, 'AGENTS.md')]);
  await writeFile(join(root, 'AGENTS.md'), 'R'.repeat(40)); await writeFile(join(child, 'AGENTS.override.md'), '');
  const b = budgetReport(await inventorySnapshot(child, {project_doc_max_bytes: 128}), [join(root, 'AGENTS.md')]);
  assert.deepEqual(a.native_project_sources, b.native_project_sources);
  assert.equal(a.rows[1].estimated_status, 'SKIPPED_BUDGET');
  assert.equal(b.rows[1].estimated_status, 'SKIPPED_EMPTY_OR_WHITESPACE_PREFIX');
  assert.equal(b.rows[2].estimated_status, 'SHADOWED');
});

test('empty/whitespace prefixes cost no budget, even when the whole file exceeds it', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  await writeFile(join(root, 'AGENTS.md'), ' '.repeat(20) + 'outside prefix');
  await writeFile(join(child, 'AGENTS.md'), 'child');
  const s = await inventorySnapshot(child, {project_doc_max_bytes: 8});
  assert.equal(s.rows[0].estimated_status, 'SKIPPED_EMPTY_OR_WHITESPACE_PREFIX');
  assert.equal(s.rows[0].estimated_budget_used, 0);
  assert.equal(s.rows[1].estimated_status, 'FULL');
});

test('Rust whitespace handling preserves BOM while ignoring U+0085', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'AGENTS.md'), '\uFEFF');
  let s = await inventorySnapshot(root, {});
  assert.equal(s.rows[0].estimated_status, 'FULL'); assert.equal(s.rows[0].estimated_budget_used, 3);
  await writeFile(join(root, 'AGENTS.md'), '\u0085'); s = await inventorySnapshot(root, {});
  assert.equal(s.rows[0].estimated_status, 'SKIPPED_EMPTY_OR_WHITESPACE_PREFIX');
});

test('byte accounting handles a split UTF8 character and exhausted next directory', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  await writeFile(join(root, 'AGENTS.md'), 'あ'); await writeFile(join(child, 'AGENTS.md'), 'child');
  const s = await inventorySnapshot(child, {project_doc_max_bytes: 2});
  assert.equal(s.rows[0].estimated_status, 'TRUNCATED'); assert.equal(s.rows[0].examined_bytes, 2);
  assert.equal(s.rows[1].estimated_status, 'SKIPPED_BUDGET');
});

test('custom root markers and ordered fallback files, without scanning siblings', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  await writeFile(join(root, 'workspace.marker'), ''); await writeFile(join(root, 'TEAM.md'), 'root');
  await writeFile(join(root, ' TEAM.md '), 'spaced-name');
  await writeFile(join(child, 'TEAM.md'), 'child'); await mkdir(join(child, 'AGENTS.override.md'));
  const s = await inventorySnapshot(child, {project_root_markers: ['workspace.marker'], project_doc_fallback_filenames: [' TEAM.md ', 'TEAM.md', '../secret', '', '.']});
  assert.equal(s.root, root); assert.equal(s.directory_count, 2);
  assert.equal(s.rows.find(x => x.selected).path, ' TEAM.md ');
  assert.equal(s.rows.find(x => x.path === 'TEAM.md').estimated_status, 'SHADOWED');
  assert.equal(s.settings.ignoredFallbacks, 3); assert.equal(s.rows.filter(x => x.selected).length, 2);
  assert.equal(s.rows.find(x => x.path === 'child/AGENTS.override.md').estimated_status, 'NOT_A_FILE');
});

test('no marker, and explicit empty markers, inspect only the startup directory', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  await writeFile(join(root, 'AGENTS.md'), 'root'); await writeFile(join(child, 'AGENTS.md'), 'child');
  for (const config of [{project_root_markers: []}, {project_root_markers: ['not-present']}]) {
    const s = await inventorySnapshot(child, config); assert.equal(s.root, child); assert.equal(s.rows.length, 1);
  }
});

test('native mismatch is explicit and global/outside sources are count-only', async t => {
  const root = await fixture(t); await writeFile(join(root, 'AGENTS.md'), 'PRIVATE-GUIDANCE');
  const s = await inventorySnapshot(root, {});
  const outside = join(tmpdir(), 'PRIVATE-HOME', 'AGENTS.md');
  const r = budgetReport(s, [outside]);
  assert.equal(r.selection_matches_native_paths, false); assert.equal(r.other_native_source_count, 1);
  assert(!JSON.stringify(r).includes('PRIVATE-HOME')); assert(!JSON.stringify(r).includes('PRIVATE-GUIDANCE'));
  assert(!JSON.stringify(r).includes(root));
  assert.throws(() => budgetReport(s, ['file:///unhandled/AGENTS.md']));
});

test('content and selection changes invalidate the local snapshot', async t => {
  const root = await fixture(t); await writeFile(join(root, 'AGENTS.md'), 'before');
  const a = await inventorySnapshot(root, {}); await writeFile(join(root, 'AGENTS.md'), 'after!');
  const b = await inventorySnapshot(root, {}); assert.notEqual(a.signature, b.signature);
  await writeFile(join(root, 'AGENTS.override.md'), ''); const c = await inventorySnapshot(root, {});
  assert.notEqual(b.signature, c.signature);
});

test('invalid or unsafe discovery settings do not become guessed defaults', () => {
  for (const config of [{project_doc_max_bytes: -1}, {project_doc_max_bytes: Infinity}, {project_root_markers: 'bad'}, {project_root_markers: ['../outside']}, {project_root_markers: ['/outside']}, {project_doc_fallback_filenames: [7]}]) assert.throws(() => discoverySettings(config));
  assert.deepEqual(discoverySettings({project_doc_fallback_filenames: ['C:\\x', 'safe.md']}, 'win32').names, ['AGENTS.override.md', 'AGENTS.md', 'safe.md']);
});

test('unreadable selected guidance retains uncertainty', async t => {
  if (process.platform === 'win32' || process.getuid?.() === 0) return t.skip('POSIX permission control unavailable');
  const root = await fixture(t); const path = join(root, 'AGENTS.md'); await writeFile(path, 'private');
  await chmod(path, 0); t.after(() => chmod(path, 0o600).catch(() => {}));
  const s = await inventorySnapshot(root, {});
  assert(s.issues.includes('guidance_read_unconfirmed')); assert.equal(s.rows[0].estimated_status, 'UNKNOWN');
});

test('uncertain root marker never causes a wider ancestor content read', async t => {
  const root = await fixture(t); const child = join(root, 'child');
  try { await symlink(join(root, '.git'), join(child, 'root-link'), 'dir'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink privilege unavailable'); throw error; }
  await writeFile(join(root, 'AGENTS.md'), 'PRIVATE-PARENT');
  const s = await inventorySnapshot(child, {project_root_markers: ['root-link']});
  assert.equal(s.root, child); assert.equal(s.examined_bytes, 0); assert.equal(s.rows.length, 0);
  assert(s.issues.includes('root_marker_symlink_unconfirmed'));
});

test('a guidance symlink is unconfirmed, not a guessed fallback or external read', async t => {
  const root = await fixture(t); await writeFile(join(root, 'AGENTS.md'), 'fallback');
  try { await symlink(join(root, 'AGENTS.md'), join(root, 'AGENTS.override.md'), 'file'); }
  catch (error) { if (error.code === 'EPERM') return t.skip('Symlink privilege unavailable'); throw error; }
  const s = await inventorySnapshot(root, {});
  assert.equal(s.examined_bytes, 0); assert(s.issues.includes('guidance_symlink_unconfirmed'));
  assert.equal(s.rows[0].selected, null); assert.equal(s.rows[1].estimated_status, 'UNCONFIRMED_SELECTION');
});

test('unknown outside native paths invalidate a matching project estimate without reading them', async t => {
  const root = await fixture(t); await writeFile(join(root, 'AGENTS.md'), 'root');
  const snapshot = await inventorySnapshot(root, {});
  const global = join(tmpdir(), 'PRIVATE-HOME', 'AGENTS.md');
  const known = budgetReport(snapshot, [join(root, 'AGENTS.md'), global], [global]);
  assert.equal(known.selection_matches_native_paths, true); assert.equal(known.unknown_external_source_count, 0);
  const unknown = budgetReport(snapshot, [join(root, 'AGENTS.md'), global, join(tmpdir(), 'UNKNOWN-PRIVATE', 'credentials.txt')], [global]);
  assert.equal(unknown.selection_matches_native_paths, false); assert.equal(unknown.unknown_external_source_count, 1);
  assert(!JSON.stringify(unknown).includes('UNKNOWN-PRIVATE')); assert(!JSON.stringify(unknown).includes('credentials.txt'));
});
