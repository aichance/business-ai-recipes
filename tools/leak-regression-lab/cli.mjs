#!/usr/bin/env node
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import {validateConfig, CheckError} from './lib/config.mjs';
import {inspect, compare} from './lib/probe.mjs';
import {html} from './lib/report.mjs';

const HELP = `Leak Regression Lab0.1.2 — Node22+, no dependencies or model calls
  node cli.mjs check --config test-config.json --out NEW_DIR --live
  node cli.mjs check --env .env.test --config test-config.json --out NEW_DIR --live
  node --env-file=.env.test cli.mjs check --config test-config.json --out NEW_DIR --live
  node cli.mjs compare --before BEFORE/report.json --after AFTER/report.json
Uses two normal test users and a publishable/anon key from named environment variables.
Choose password login or existing Supabase test-user access tokens; see examples.
Read-only application probes; session input verifies users with Auth GET requests.
Only authorized test environments and known synthetic rows/objects. No auto-repair.
Exit0=all scoped controls pass;2=observed exposure;3=inconclusive;1=refused/setup.
Read the README before --live. This does not certify general application security.`;

export async function main(args = process.argv.slice(2)) {
  try {
    if (!args.length || args.includes('--help')) { console.log(HELP); return 0; }
    const command = args.shift();
    const {values} = parseArgs({args, strict: true, options: {
      config: {type: 'string'}, out: {type: 'string'}, live: {type: 'boolean', default: false},
      before: {type: 'string'}, after: {type: 'string'},
      env: {type: 'string'},
    }});
    if (command === 'compare' && values.before && values.after && !values.live && !values.config && !values.out && !values.env) {
      const result = compare(JSON.parse(await readFile(resolve(values.before), 'utf8')), JSON.parse(await readFile(resolve(values.after), 'utf8')));
      console.log(JSON.stringify(result, null, 2)); return result.regressions.length ? 2 : result.coverage_complete && result.incomplete.length === 0 ? 0 : 3;
    }
    if (command !== 'check' || !values.live || !values.config || !values.out || values.before || values.after) throw new CheckError('EXPLICIT_CHECK_CONFIG_OUT_AND_LIVE_REQUIRED');
    const config = validateConfig(JSON.parse(await readFile(resolve(values.config), 'utf8')));
    const out = resolve(values.out);
    await mkdir(out, {mode: 0o700});
    if (values.env) loadEnvFile(resolve(values.env));
    const result = await inspect(config, process.env);
    await writeFile(resolve(out, 'report.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    await writeFile(resolve(out, 'index.html'), html(result), {flag: 'wx', mode: 0o600});
    console.log(JSON.stringify({status: result.status, coverage_complete: result.coverage_complete, counts: result.counts ?? null}));
    return result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 2 : 3;
  } catch (e) {
    // Error messages from network/server/file paths may contain private values.
    console.error(e instanceof CheckError ? e.code : e.code === 'EEXIST' ? 'NEW_OUTPUT_DIRECTORY_REQUIRED' : 'SETUP_OR_INPUT_ERROR');
    return 1;
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
