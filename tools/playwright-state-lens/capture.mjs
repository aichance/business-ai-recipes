#!/usr/bin/env node
import { readFile, stat, mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { createStateLens } from './lens.mjs';

const MAX_CHECKPOINTS = 50;
export const HELP = `State Lens: manually record your own app, without writing a test.

From a project with Node22+ and Playwright/Chromium already installed:
  node capture.mjs --url http://127.0.0.1:5173 --probe-file probe.json

probe.json contains one normal State Lens probe, or an array of1–16 probes.
Example: {"name":"draft","source":"localStorage","key":"draft","json":true}
Open your own app, perform its normal actions, then enter a short checkpoint
name here after each ready state. A blank name finishes; at most50 are recorded.
Only the first selected HTTP origin is observed. New tabs are not followed.
The new private HTML includes selected app data and screenshots; keep it local.
This observes state, does not check correctness, and does not replace assertions.
No dependency/browser installation, profile reuse or app action is automated.
`;

export function parseArguments(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { help: true };
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i], value = argv[i + 1];
    if (!['--url', '--probe-file'].includes(flag) || !value || value.startsWith('--') || flag in args) {
      throw new Error('Use exactly --url URL --probe-file FILE, or --help.');
    }
    args[flag] = value;
  }
  if (!args['--url'] || !args['--probe-file']) throw new Error('Both --url and --probe-file are required.');
  let url;
  try { url = new URL(args['--url']); } catch { throw new Error('The app URL must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP(S) app URL without embedded credentials.');
  }
  return { url: url.href, probeFile: resolve(args['--probe-file']) };
}

export async function readProbes(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 65536) throw new Error('Use a probe JSON file no larger than64KiB.');
  const bytes = await readFile(path);
  if (bytes.length > 65536) throw new Error('The probe file grew beyond64KiB.');
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('The probe file must contain valid JSON.'); }
  const probes = Array.isArray(value) ? value : [value];
  if (!probes.length || probes.length > 16 || probes.some(p => !p || typeof p !== 'object' || Array.isArray(p))) {
    throw new Error('Use one probe object or an array of1–16 probe objects.');
  }
  return probes;
}

export function installedChromium(cwd = process.cwd()) {
  const require = createRequire(join(resolve(cwd), 'package.json'));
  for (const name of ['playwright', '@playwright/test']) {
    let path;
    try { path = require.resolve(name); } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') continue;
      throw error;
    }
    const candidate = require(path).chromium;
    if (!candidate || typeof candidate.launch !== 'function') throw new Error('The installed Playwright does not expose Chromium.');
    return candidate;
  }
  throw new Error('Playwright was not found in this project. Use your existing Playwright project; nothing was installed.');
}

/** nextLabel is the terminal prompt; tests supply controlled synthetic actions. */
export async function captureSession({ url, probes, chromium, nextLabel, signal, outputBase = tmpdir() }) {
  let browser, context, page, lens, failure, reportPath = null, count = 0, stoppedBy = 'finished';
  const stop = new AbortController();
  const combined = signal ? AbortSignal.any([signal, stop.signal]) : stop.signal;
  const browserClosed = () => stop.abort('browser-closed');
  const pageClosed = () => stop.abort('page-closed');
  if (combined.aborted) return { reportPath, checkpoints: 0, stoppedBy: String(combined.reason || 'interrupted') };
  try {
    browser = await chromium.launch({ headless: false, timeout: 15000 });
    browser.on('disconnected', browserClosed);
    context = await browser.newContext({ viewport: { width: 1120, height: 780 } });
    page = await context.newPage();
    page.on('close', pageClosed);
    // The common constructor validates full probe semantics before navigation.
    lens = createStateLens(page, { probes, title: 'Your manually selected app checkpoints' });
    if (!combined.aborted) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    while (count < MAX_CHECKPOINTS && !combined.aborted) {
      let label;
      try { label = await nextLabel({ page, signal: combined, count }); }
      catch (error) { if (combined.aborted) break; throw error; }
      if (combined.aborted) break;
      if (label === null) { stoppedBy = 'input-closed'; break; }
      if (typeof label !== 'string') throw new Error('A checkpoint name must be text.');
      label = label.trim();
      if (!label) break;
      if (label.length > 160 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error('Use a short single-line checkpoint name (up to160 characters).');
      await lens.checkpoint(label);
      count += 1;
    }
    if (combined.aborted) stoppedBy = String(combined.reason || 'interrupted');
    else if (count === MAX_CHECKPOINTS) stoppedBy = 'checkpoint-limit';
  } catch (error) { failure = error; }
  try {
    if (lens?.report().checkpoints.length) {
      const directory = await mkdtemp(join(outputBase, 'state-lens-'));
      reportPath = join(directory, 'selected-state.html');
      await lens.writeHTML(reportPath);
    }
  } catch (error) {
    reportPath = null;
    failure = failure ? new AggregateError([failure, error], 'Capture and report writing failed.') : error;
  } finally {
    page?.off('close', pageClosed);
    browser?.off('disconnected', browserClosed);
    for (const resource of [context, browser]) {
      try { await resource?.close(); } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Capture cleanup also failed.') : error;
      }
    }
  }
  if (failure) { failure.reportPath = reportPath; throw failure; }
  return { reportPath, checkpoints: count, stoppedBy };
}

export function manualPrompt(input = process.stdin, output = process.stdout, interrupts = process) {
  const stop = new AbortController();
  const prompt = createInterface({ input, output });
  const interrupted = () => stop.abort('interrupted');
  const inputClosed = () => stop.abort('input-closed');
  interrupts.once('SIGINT', interrupted);
  prompt.once('SIGINT', interrupted);
  prompt.once('close', inputClosed);
  return {
    signal: stop.signal,
    nextLabel: ({ signal }) => prompt.question('Checkpoint name (blank finishes): ',
      { signal: AbortSignal.any([signal, stop.signal]) }),
    close() {
      stop.abort('prompt-closed');
      prompt.off('close', inputClosed);
      prompt.off('SIGINT', interrupted);
      prompt.close();
      interrupts.off('SIGINT', interrupted);
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) { console.log(HELP); return 0; }
  const probes = await readProbes(options.probeFile);
  const chromium = installedChromium();
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal for manual checkpoints; --help needs no terminal.');
  const prompt = manualPrompt();
  console.log('Use your own app and wait for each operation to finish before recording.');
  try {
    const result = await captureSession({ ...options, probes, chromium, signal: prompt.signal, nextLabel: prompt.nextLabel });
    if (result.reportPath) console.log(`Recorded ${result.checkpoints} checkpoint(s). Local HTML: ${result.reportPath}`);
    else console.log('No checkpoints recorded; no report written.');
    console.log(`Stopped: ${result.stoppedBy}. These are observations, not a PASS result.`);
    return 0;
  } finally {
    prompt.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(); }
  catch (error) {
    if (error.reportPath) console.error(`Partial local report: ${error.reportPath}`);
    console.error(`State Lens capture failed: ${error.message}`);
    process.exitCode = 1;
  }
}
