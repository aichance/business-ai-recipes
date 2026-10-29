import { mkdir, writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { begin, seal, preview, writePreviewHTML } from './preview.mjs';

const out = resolve(process.argv[2] || `.edit-undo-output/demo-${Date.now()}`);
await mkdir(out, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'edit-undo-comparison-'));
const original = Array.from({ length: 18 }, (_, i) => i === 1 ? 'headline = Original launch plan' : i === 15 ? 'editor_note = Keep the friendly copy' : `section_${i + 1} = unchanged`).join('\n') + '\n';
const cases = [
  { name: 'same-file-later-edit', a: original, b: original.replace('Original launch plan', 'AI experimental headline'), c: original.replace('Original launch plan', 'AI experimental headline').replace('Keep the friendly copy', 'Human revised this copy'), expected: 'READY_TO_REVIEW', expectedContent: original.replace('Keep the friendly copy', 'Human revised this copy') },
  { name: 'nearby-independent-lines', a: 'a=1\nb=1\nc=1\nd=1\n', b: 'a=2\nb=1\nc=1\nd=1\n', c: 'a=2\nb=1\nc=2\nd=1\n', expected: 'READY_TO_REVIEW', expectedContent: 'a=1\nb=1\nc=2\nd=1\n' },
  { name: 'same-line-conflict', a: 'value=1\n', b: 'value=2\n', c: 'value=3\n', expected: 'CONFLICT' },
  { name: 'new-file-later-edit', a: null, b: 'AI new file\n', c: 'AI new file\nHuman addition\n', expected: 'CONFLICT' },
  { name: 'utf8-bom-removal', a: '\ufeffvalue=1\n', b: 'value=1\n', c: 'value=1\n', expected: 'READY_TO_REVIEW', expectedContent: '\ufeffvalue=1\n' },
];
const results = [];
try {
  for (const [i, c] of cases.entries()) {
    const base = join(root, String(i)), project = join(base, 'project'), session = join(base, 'session');
    await mkdir(project, { recursive: true });
    const file = join(project, 'example.txt');
    if (c.a !== null) await writeFile(file, c.a);
    execFileSync('git', ['init', '-q'], { cwd: project });
    if (c.a !== null) execFileSync('git', ['add', 'example.txt'], { cwd: project });
    const indexPath = join(project, '.git/index');
    const beforeIndex = c.a !== null ? await readFile(indexPath) : null;
    await begin({ project, paths: ['example.txt'], session });
    await writeFile(file, c.b); await seal(session); await writeFile(file, c.c);
    const report = await preview(session);
    await writePreviewHTML(report, join(out, `${c.name}.html`));
    let gitMerge = { status: 'NOT_COMPARED', reason: 'Creation/deletion needs additional lifecycle policy' };
    if (c.a !== null) {
      const paths = ['current', 'agent', 'original'].map(name => join(base, name));
      for (const [j, text] of [c.c, c.b, c.a].entries()) await writeFile(paths[j], text);
      try { gitMerge = { status: 'READY_TO_REVIEW', content: execFileSync('git', ['merge-file', '-p', ...paths], { encoding: 'utf8', timeout: 5000 }) }; }
      catch (e) { if (Number.isInteger(e.status) && e.status > 0 && e.status < 128) gitMerge = { status: 'CONFLICT' }; else throw e; }
    }
    const currentUnchanged = (await readFile(file, 'utf8')) === c.c;
    const indexUnchanged = beforeIndex === null || Buffer.compare(beforeIndex, await readFile(indexPath)) === 0;
    const proposed = report.entries[0].proposed;
    const baselineMatches = gitMerge.status === 'NOT_COMPARED' ? null : gitMerge.status === report.status && (gitMerge.status === 'CONFLICT' || gitMerge.content === proposed?.content);
    results.push({ name: c.name, expected: c.expected, actual: report.status, action: report.entries[0].status,
      correct: report.status === c.expected && (c.expectedContent === undefined || c.expectedContent === proposed?.content), currentUnchanged, indexUnchanged, gitMergeStatus: gitMerge.status, baselineMatches,
      preservedLaterHumanEdit: c.name === 'same-file-later-edit' ? proposed.content.includes('Human revised this copy') && !proposed.content.includes('AI experimental headline') : null,
      proposedHash: proposed ? createHash('sha256').update(JSON.stringify(proposed)).digest('hex') : null, html: `${c.name}.html` });
  }
} finally { await rm(root, { recursive: true, force: true }); }
const summary = { observedAt: new Date().toISOString(), scope: 'operator-authored synthetic preview comparison; no independent adoption',
  noApplyCommand: true, results,
  conclusion: 'The text results match Git merge-file. Potential difference is recording/review workflow, not merge capability. Nearby edits may still conflict. Product usefulness is not established.' };
await writeFile(join(out, 'comparison.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ output: out, cases: results.length, correct: results.filter(x => x.correct && x.currentUnchanged && x.indexUnchanged).length,
  gitComparableCases: results.filter(x => x.baselineMatches !== null).length, baselineAgreements: results.filter(x => x.baselineMatches).length }));
if (results.some(x => !x.correct || !x.currentUnchanged || !x.indexUnchanged || x.baselineMatches === false)) process.exitCode = 1;
