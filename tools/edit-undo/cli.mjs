#!/usr/bin/env node
import { begin, seal, preview, writePreviewHTML } from './preview.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help') {
  console.log(`Edit Undo experimental preview — does not apply changes
  node cli.mjs begin --project DIR --session OUTSIDE_DIR --paths file.txt,src/file.js
  node cli.mjs seal --session DIR
  node cli.mjs preview --session DIR [--html OUTSIDE_FILE]
Record the AI window, then add your own edits, then preview its inverse.
This is a three-state text comparison, not automatic authorship detection.`);
} else {
  try {
    if (args.length % 2) throw new Error('Options require values');
    const opts = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--project', '--session', '--paths', '--html'].includes(args[i]) || opts[args[i]]) throw new Error(`Invalid option: ${args[i]}`);
      opts[args[i]] = args[i + 1];
    }
    if (!opts['--session']) throw new Error('--session is required');
    let result;
    if (command === 'begin') {
      if (!opts['--project'] || !opts['--paths']) throw new Error('--project and --paths are required');
      result = await begin({ project: opts['--project'], session: opts['--session'], paths: opts['--paths'].split(',') });
    } else if (command === 'seal') result = await seal(opts['--session']);
    else if (command === 'preview') {
      result = await preview(opts['--session']);
      if (opts['--html']) await writePreviewHTML(result, opts['--html']);
    } else throw new Error(`Unknown command: ${command}`);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'CONFLICT') process.exitCode = 2;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
