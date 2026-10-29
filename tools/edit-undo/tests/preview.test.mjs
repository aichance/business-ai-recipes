import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { begin, seal, preview, renderPreview, writePreviewHTML } from '../preview.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'edit-undo-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, 'project'), session = join(root, 'session');
  await mkdir(project);
  return { root, project, session, file: join(project, 'note.txt') };
}

const source = () => Array.from({ length: 18 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
async function window(f, before, agent) {
  if (before !== null) await writeFile(f.file, before);
  await begin({ project: f.project, paths: ['note.txt'], session: f.session });
  if (agent === null) await rm(f.file); else await writeFile(f.file, agent);
  await seal(f.session);
}

test('inverse merge retains later edits in the same file and changes neither project nor index', async t => {
  const f = await fixture(t), original = source();
  await writeFile(f.file, original);
  execFileSync('git', ['init', '-q'], { cwd: f.project });
  execFileSync('git', ['add', 'note.txt'], { cwd: f.project });
  const index = await readFile(join(f.project, '.git/index'));
  await begin({ project: f.project, paths: ['note.txt'], session: f.session });
  await writeFile(f.file, original.replace('line 2\n', 'AI change\n'));
  await seal(f.session);
  const current = (await readFile(f.file, 'utf8')).replace('line 16\n', 'HUMAN change\n');
  await writeFile(f.file, current);
  const result = await preview(f.session);
  assert.equal(result.status, 'READY_TO_REVIEW');
  assert.equal(result.entries[0].status, 'MERGE');
  assert.equal(result.entries[0].proposed.content, original.replace('line 16\n', 'HUMAN change\n'));
  assert.equal(await readFile(f.file, 'utf8'), current);
  assert.deepEqual(await readFile(join(f.project, '.git/index')), index);
});

test('conflicting same-line edits remain untouched and have no proposed file', async t => {
  const f = await fixture(t);
  await window(f, 'value=1\n', 'value=2\n');
  await writeFile(f.file, 'value=3\n');
  const result = await preview(f.session);
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.entries[0].proposed, null);
  assert.equal(await readFile(f.file, 'utf8'), 'value=3\n');
});

test('unmodified agent-created file can be proposed absent, later user content cannot', async t => {
  const f = await fixture(t);
  await window(f, null, 'AI new file\n');
  assert.equal((await preview(f.session)).entries[0].proposed.exists, false);
  await writeFile(f.file, 'AI new file\nHUMAN extra\n');
  assert.equal((await preview(f.session)).status, 'CONFLICT');
  assert.equal(await readFile(f.file, 'utf8'), 'AI new file\nHUMAN extra\n');
});

test('later deletion is preserved; an agent deletion is proposed restored', async t => {
  const f = await fixture(t);
  await window(f, 'original\n', null);
  assert.equal((await preview(f.session)).entries[0].proposed.content, 'original\n');
  await writeFile(f.file, 'HUMAN replacement\n');
  assert.equal((await preview(f.session)).status, 'CONFLICT');
});

test('later deletion of an AI-modified file is kept', async t => {
  const f = await fixture(t);
  await window(f, 'original\n', 'AI\n');
  await rm(f.file);
  const result = await preview(f.session);
  assert.equal(result.entries[0].status, 'KEEP');
  assert.equal(result.entries[0].proposed.exists, false);
});

test('unchanged window preserves later human changes', async t => {
  const f = await fixture(t);
  await window(f, 'original\n', 'original\n');
  await writeFile(f.file, 'HUMAN\n');
  assert.equal((await preview(f.session)).entries[0].proposed.content, 'HUMAN\n');
});

test('reject traversal, Git internals, environment files, duplicate paths, target-local session', async t => {
  const f = await fixture(t);
  for (const paths of [['../outside'], ['.git/config'], ['.GIT/config'], ['.env'], ['.ENV'], ['src/.EnV.local'], ['a', 'a']]) {
    await assert.rejects(begin({ project: f.project, paths, session: f.session }));
  }
  await assert.rejects(begin({ project: f.project, paths: ['note.txt'], session: join(f.project, 'session') }));
});

test('reject selected symlink, including a parent directory', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'outside'), 'outside\n');
  await symlink(join(f.root, 'outside'), f.file);
  await assert.rejects(begin({ project: f.project, paths: ['note.txt'], session: f.session }), /Symlink/);
  await symlink(f.root, join(f.project, 'dir'));
  await assert.rejects(begin({ project: f.project, paths: ['dir/outside'], session: f.session }), /Symlink/);
});

test('session and HTML cannot enter the project through a symlinked parent', async t => {
  const f = await fixture(t);
  await symlink(f.project, join(f.root, 'alias'));
  await assert.rejects(begin({ project: f.project, paths: ['note.txt'], session: join(f.root, 'alias/session') }), /outside/);
  await window(f, 'original\n', 'AI\n');
  const result = await preview(f.session);
  await assert.rejects(writePreviewHTML(result, join(f.root, 'alias/report.html')), /outside/);
});

test('reject binary and invalid UTF8 inputs', async t => {
  const f = await fixture(t);
  for (const bytes of [Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xfe])]) {
    await writeFile(f.file, bytes);
    await assert.rejects(begin({ project: f.project, paths: ['note.txt'], session: f.session }));
  }
});

test('preserve a UTF8 BOM and detect its removal as an edit', async t => {
  const f = await fixture(t);
  await window(f, '\ufeffvalue=1\n', 'value=1\n');
  const result = await preview(f.session);
  assert.equal(result.entries[0].status, 'REVERT');
  assert.equal(result.entries[0].proposed.content, '\ufeffvalue=1\n');
});

test('reject FIFO before attempting a blocking open', { timeout: 3000 }, async t => {
  const f = await fixture(t);
  execFileSync('mkfifo', [f.file], { timeout: 1000 });
  await assert.rejects(begin({ project: f.project, paths: ['note.txt'], session: f.session }), /Unsupported file/);
});

test('modified session is rejected; sealed window cannot be overwritten', async t => {
  const f = await fixture(t);
  await window(f, 'original\n', 'AI\n');
  await assert.rejects(seal(f.session), /already sealed/);
  const p = join(f.session, 'session.json'), record = JSON.parse(await readFile(p, 'utf8'));
  record.before[0].content = 'forged';
  await writeFile(p, JSON.stringify(record));
  await assert.rejects(preview(f.session), /modified/);
});

test('required before snapshot cannot be null even with a consistent digest', async t => {
  const f = await fixture(t);
  await writeFile(f.file, 'original\n');
  await begin({ project: f.project, paths: ['note.txt'], session: f.session });
  const path = join(f.session, 'session.json'), data = JSON.parse(await readFile(path, 'utf8'));
  const { digest, ...record } = data; record.before = null;
  const changed = { ...record, digest: createHash('sha256').update(JSON.stringify(record)).digest('hex') };
  await writeFile(path, JSON.stringify(changed));
  await assert.rejects(seal(f.session), /required snapshots/);
  assert.equal(await readFile(f.file, 'utf8'), 'original\n');
});

test('HTML escapes selected app source, cannot overwrite a file or write into target', async t => {
  const f = await fixture(t);
  await window(f, '<script>alert(1)</script>\n', 'AI\n');
  const result = await preview(f.session), html = renderPreview(result);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  await assert.rejects(writePreviewHTML(result, join(f.project, 'report.html')));
  const out = join(f.root, 'report.html');
  await writePreviewHTML(result, out);
  await assert.rejects(writePreviewHTML(result, out));
});

test('the actual CLI records and previews one edit window without target changes', async t => {
  const f = await fixture(t), cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  const run = args => JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 5000 }));
  await writeFile(f.file, 'original\n');
  assert.equal(run(['begin', '--project', f.project, '--session', f.session, '--paths', 'note.txt']).targetWrites, 0);
  await writeFile(f.file, 'AI change\n');
  assert.equal(run(['seal', '--session', f.session]).targetWrites, 0);
  const result = run(['preview', '--session', f.session]);
  assert.equal(result.entries[0].proposed.content, 'original\n');
  assert.equal(await readFile(f.file, 'utf8'), 'AI change\n');
});
