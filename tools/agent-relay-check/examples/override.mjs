#!/usr/bin/env node
// Authored diagnostic, using one disposable project and four fresh sessions.
import { parseArgs } from 'node:util';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createChallenge, instructionBlock, compare } from '../lib/protocol.mjs';
import { runCodex, runProcess } from '../lib/codex.mjs';

const {values} = parseArgs({options: {out: {type: 'string'}, live: {type: 'boolean'}, help: {type: 'boolean'}}});
if (values.help || !values.live || !values.out) {
  console.log('node examples/override.mjs --out NEW_DIRECTORY --live\nRuns four fresh Codex calls on synthetic instructions in one disposable Git project. Uses existing quota.');
  process.exitCode = values.help ? 0 : 1;
} else {
  const out = resolve(values.out);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try {
    await mkdir(out, {mode: 0o700});
    const project = join(out, 'project');
    await mkdir(project);
    const git = await runProcess('git', ['init', '-q', project], {timeoutMs: 10000, signal: controller.signal});
    if (git.exit_code !== 0) throw new Error('Unable to initialize the disposable Git project.');
    const reports = [];
    for (const name of ['normal', 'override', 'restored', 'absent']) {
      if (controller.signal.aborted) break;
      const challenge = createChallenge(['base_only', 'override_only']);
      const dir = join(out, name); await mkdir(dir, {mode: 0o700});
      await writeFile(join(dir, 'challenge.json'), JSON.stringify(challenge, null, 2), {flag: 'wx', mode: 0o600});
      // These files belong to this newly-created demo only, never the user's app.
      await rm(join(project, 'AGENTS.md'), {force: true});
      await rm(join(project, 'AGENTS.override.md'), {force: true});
      if (name !== 'absent') await writeFile(join(project, 'AGENTS.md'), instructionBlock(challenge, ['base_only']));
      if (name === 'override') await writeFile(join(project, 'AGENTS.override.md'), instructionBlock(challenge, ['override_only']));
      console.log(`Running ${name} (synthetic fixture, fresh session)…`);
      const report = await runCodex({project, challenge, signal: controller.signal});
      await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
      reports.push({name, report});
      console.log(report.markers.map((m) => `${m.key}: ${m.status}`).join(' | '));
      // Do not start another request when the preceding execution is uncertain.
      if (report.status === 'INCONCLUSIVE') break;
    }
    const summary = {
      type: 'authored synthetic demonstration; not independent adoption or a new bug',
      same_project_directory: true,
      fresh_challenge_per_case: true,
      cases: reports.map(({name, report}) => ({name, markers: report.markers.map(({key, status}) => ({key, status})),
        execution: report.execution, report: `${name}/report.json`})),
      comparisons: reports.slice(1).map((entry, i) => ({from: reports[i].name, to: entry.name,
        result: compare(reports[i].report, entry.report)})),
    };
    await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    process.exitCode = reports.length === 4 && reports.every(({report}) => report.status !== 'INCONCLUSIVE') ? 0 : 3;
  } catch (e) {
    console.error(`Demo stopped: ${e.code ?? e.message}`);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  }
}
