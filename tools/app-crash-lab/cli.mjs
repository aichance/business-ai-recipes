#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runContract, VERSION } from './lib/runner.mjs';
import { startDemo } from './demo/server.mjs';

const help = `App Crash Lab ${VERSION}

  app-crash-lab demo [--out DIRECTORY] [--headed]
  app-crash-lab run CONTRACT.json [--base-url http://127.0.0.1:PORT] [--out DIRECTORY] [--headed]

Run your disposable local app first. Only the configured loopback origin is allowed.
Output: HTML/JSON, state differences, traces, screenshots and standalone Playwright tests.
Exit codes (run): 0 all checks passed; 1 contract failed; 2 inconclusive/config/infrastructure.
Demo succeeds only when the intentionally broken and fixed fixtures behave as advertised.
No signup, runtime LLM or API key. Requires Node22+, npm dependencies and Playwright Chromium.
Install browser: npx playwright install chromium
`;

try {
  const args = parseArgs({ allowPositionals: true, options: { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' }, out: { type: 'string' }, 'base-url': { type: 'string' }, headed: { type: 'boolean' } } });
  const [command, file, ...extra] = args.positionals;
  if (args.values.version) console.log(VERSION);
  else if (args.values.help || !command) console.log(help);
  else if (command === 'run' && file && !extra.length) {
    const contract = JSON.parse(await readFile(resolve(file), 'utf8'));
    if (args.values['base-url']) contract.baseURL = args.values['base-url'];
    const report = await runContract(contract, { out: args.values.out, headless: !args.values.headed, onResult: r => console.log(`${r.status.toUpperCase().padEnd(12)} ${r.check}${r.error ? ' — ' + r.error : ''}`) });
    console.log(`Report: ${join(report.out, 'index.html')}`);
    if (report.infrastructureError) console.error(report.infrastructureError);
    process.exitCode = report.exitCode;
  } else if (command === 'demo' && !file) {
    const root = resolve(args.values.out ?? `.crash-lab/demo-${Date.now()}`);
    const app = await startDemo();
    const manifest = [];
    try {
      const source = JSON.parse(await readFile(new URL('./examples/notes.json', import.meta.url), 'utf8'));
      for (const [mode, expected] of [['broken-reload', ['fail', 'pass']], ['broken-reject', ['pass', 'fail']], ['fixed', ['pass', 'pass']]]) {
        const contract = { ...source, baseURL: app.baseURL, path: '/?mode=' + mode, name: `Synthetic Notes / ${mode}` };
        const report = await runContract(contract, { out: join(root, mode), headless: !args.values.headed });
        const actual = report.results.map(r => r.status);
        const matched = !report.infrastructureError && JSON.stringify(expected) === JSON.stringify(actual);
        manifest.push({ mode, expected, actual, matched, report: `${mode}/index.html` });
        console.log(`${matched ? 'DEMO OK' : 'DEMO ERROR'}  ${mode}: ${actual.join(', ')}`);
        if (!matched) process.exitCode = 2;
      }
      await mkdir(root, { recursive: true });
      await writeFile(join(root, 'demo.json'), JSON.stringify(manifest, null, 2) + '\n');
      await writeFile(join(root, 'index.html'), `<!doctype html><meta charset="utf-8"><title>App Crash Lab demo</title><style>body{font:18px/1.7 system-ui;max-width:800px;margin:50px auto;padding:20px;background:#10131b;color:#edf0fa}a{color:#a5bcff}li{margin:24px 0}</style><h1>App Crash Lab</h1><p>Real test runs against deliberately broken synthetic fixtures. Same saved workflow. Two extra checks.</p><ul>${manifest.map(r => `<li><a href="${r.report}">${r.mode}</a> — reload: ${r.actual[0]}, rejected update: ${r.actual[1]}</li>`).join('')}</ul><p>The temporary demo server has stopped. To rerun the generated tests, start <code>npm run demo:serve</code> and update the embedded contract's baseURL to that server.</p>`);
      console.log(`Open: ${join(root, 'index.html')}`);
    } finally { await app.close(); }
  } else throw new Error('Unknown command or missing contract. Use --help.');
} catch (error) { console.error(error.message); process.exitCode = 2; }
