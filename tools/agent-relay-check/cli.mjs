#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';
import { createChallenge, validateChallenge, instructionBlock, question, receiptSchema, compare } from './lib/protocol.mjs';
import { runCodex } from './lib/codex.mjs';
import { inspectCodex } from './lib/inspect.mjs';

const HELP = `Agent Relay Check 0.1.3 — did this marker reach a fresh agent session?

inspect --project DIRECTORY [--timeout-seconds 120]
  No model answer/turn. Observe native startup source paths; estimate byte budget.
  Byte estimates support stable Codex0.163.0/0.164.0 and remain separate from native observations.
  Other loaders, changed files/config or mismatches are INCONCLUSIVE.
  Initializes installed Codex; may communicate/write its normal local metadata.
  Does NOT prove full-file delivery, actual marker receipt or rule compliance.

prepare --out DIRECTORY [--keys base_only,override_only]
  Offline. Write fresh challenge.json, instruction.md, question.txt and schema.
  Place the instruction block into the guidance path you want to test yourself.

run --project DIRECTORY --challenge FILE --out NEW_DIRECTORY --live
  Run installed Codex with a fresh session, readonly sandbox and gpt-6.1-sol/MAX.
  Uses existing Codex authentication/quota; may send project guidance to OpenAI.
  Keeps guidance settings; restricts tools, disables configured MCP and hooks.
  Tests startup guidance, NOT delivery through hooks, MCP or compaction.
  Marker-bearing files may be sent as guidance. Use only a project you can share.
  Optional: --timeout-seconds 120 (10–600). No automatic retry.

compare --before REPORT --after REPORT
  Offline. Compare marker observations; a difference is not proof of its cause.

Keep challenge/output outside the tested project. No project files are edited.
RECEIVED = exact marker; NOT_OBSERVED = null/different; INCONCLUSIVE = unusable run.
Inspect exits: 0 completed inspection (not a receipt/pass), 3 inconclusive, 1 command error.
Run exits: 0 received, 2 not observed, 3 inconclusive, 1 command/preflight error.
`;

export function outside(project, target) {
  const rel = relative(project, target);
  return rel !== '' && (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel));
}

async function json(path) {
  const meta = await stat(path);
  if (!meta.isFile() || meta.size > 1024 * 1024) throw new Error('Expected a JSON file smaller than 1 MiB.');
  return JSON.parse(await readFile(path, 'utf8'));
}

async function newDirectory(path) {
  const absolute = resolve(path);
  const parent = await realpath(dirname(absolute));
  const target = join(parent, absolute.split(/[\\/]/).at(-1));
  await mkdir(target, {mode: 0o700});
  return target;
}

export async function main(argv = process.argv.slice(2)) {
  const {values: v, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    help: {type: 'boolean', short: 'h'}, out: {type: 'string'}, keys: {type: 'string'},
    project: {type: 'string'}, challenge: {type: 'string'}, live: {type: 'boolean'},
    'timeout-seconds': {type: 'string'},
    before: {type: 'string'}, after: {type: 'string'},
  }});
  if (v.help || positionals.length === 0) { console.log(HELP); return 0; }
  if (positionals.length !== 1) throw new Error('Provide one command; see --help.');
  const command = positionals[0];
  const allowed = {
    prepare: ['out', 'keys'], run: ['out', 'project', 'challenge', 'live', 'timeout-seconds'],
    compare: ['before', 'after'], inspect: ['project', 'timeout-seconds'],
  }[command];
  if (!allowed || Object.keys(v).some((k) => !allowed.includes(k))) throw new Error('Unknown command or option for this command; see --help.');
  if (command === 'prepare') {
    if (!v.out) throw new Error('prepare requires --out NEW_DIRECTORY.');
    const challenge = createChallenge(v.keys?.split(','));
    const out = await newDirectory(v.out);
    for (const [name, text] of Object.entries({
      'challenge.json': JSON.stringify(challenge, null, 2) + '\n',
      'instruction.md': instructionBlock(challenge),
      'question.txt': question(challenge) + '\n',
      'receipt-schema.json': JSON.stringify(receiptSchema(challenge), null, 2) + '\n',
    })) await writeFile(join(out, name), text, {flag: 'wx', mode: 0o600});
    console.log(`Prepared ${out}\nCopy only instruction.md into your chosen guidance path. Keep challenge.json outside that project.`);
    return 0;
  }
  if (command === 'compare') {
    if (!v.before || !v.after) throw new Error('compare requires --before and --after reports.');
    console.log(JSON.stringify(compare(await json(v.before), await json(v.after)), null, 2));
    return 0;
  }
  if (command === 'inspect') {
    if (!v.project) throw new Error('inspect requires --project DIRECTORY.');
    const seconds = Number(v['timeout-seconds'] ?? '120');
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new Error('Timeout must be an integer from 10 to 600 seconds.');
    const project = await realpath(v.project);
    if (!(await stat(project)).isDirectory()) throw new Error('Project must be a directory.');
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      const report = await inspectCodex({project, timeoutMs: seconds * 1000, signal: controller.signal});
      console.log(JSON.stringify(report, null, 2));
      return report.status === 'INSPECTED' ? 0 : 3;
    } finally {
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    }
  }
  if (!v.live) throw new Error('run requires explicit --live. Read --help for the model call and configuration scope.');
  if (!v.project || !v.challenge || !v.out) throw new Error('run requires --project, --challenge and --out.');
  const seconds = Number(v['timeout-seconds'] ?? '120');
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new Error('Timeout must be an integer from 10 to 600 seconds.');
  const project = await realpath(v.project);
  if (!(await stat(project)).isDirectory()) throw new Error('Project must be a directory.');
  const challengePath = await realpath(v.challenge);
  const parent = await realpath(dirname(resolve(v.out)));
  if (!outside(project, challengePath) || !outside(project, parent)) throw new Error('Challenge and output must be outside the tested project (including symlink targets).');
  const challenge = validateChallenge(await json(challengePath));
  const out = await newDirectory(v.out);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    console.error('Running a fresh Codex guidance check; tool restrictions and MCP/hooks disabled for this run.');
    const report = await runCodex({project, challenge, workDir: out, timeoutMs: seconds * 1000, signal: controller.signal});
    await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    console.log(`${report.status}\n${report.markers.map((m) => `${m.key}: ${m.status}`).join('\n')}\nReport: ${join(out, 'report.json')}`);
    return report.status === 'RECEIVED' ? 0 : report.status === 'NOT_OBSERVED' ? 2 : 3;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Agent Relay Check: ${error.code ?? error.message}`);
    process.exitCode = 1;
  });
}
