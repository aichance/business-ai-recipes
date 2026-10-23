import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { resolveCodexInvocation, terminateTree } from '../lib/process.mjs';
import { runProcess } from '../lib/codex.mjs';
import { RpcClient } from '../lib/rpc.mjs';

test('Windows uses the selected PATH installation, without executing a cmd shim', async () => {
  const root = 'C:\\Program Files\\npm';
  const exe = 'D:\\Other\\codex.exe';
  const js = root + '\\node_modules\\@openai\\codex\\bin\\codex.js';
  const files = new Set([root + '\\codex.cmd', js, exe]);
  const options = {platform: 'win32', env: {Path: 'relative;' + root + ';D:\\Other'}, node: 'C:\\node.exe', exists: async (p) => files.has(p)};
  assert.deepEqual(await resolveCodexInvocation('codex', options), {command: 'C:\\node.exe', prefixArgs: [js]});
  files.add(root + '\\codex.exe');
  assert.deepEqual(await resolveCodexInvocation('codex', options), {command: root + '\\codex.exe', prefixArgs: []});
  files.delete(root + '\\codex.exe'); files.delete(js);
  await assert.rejects(resolveCodexInvocation('codex', options), /no adjacent official launcher/);
});

test('Windows cleanup failure and helper timeout cannot certify termination', async () => {
  const leader = {pid: 123, exitCode: null, signalCode: null};
  const env = {SystemRoot: 'C:\\Windows'};
  let calls = 0;
  const spawnImpl = (command, args, options) => {
    calls++;
    assert.equal(command, 'C:\\Windows\\System32\\taskkill.exe');
    assert.deepEqual(args, ['/PID', '123', '/T', '/F']);
    assert.equal(options.shell, false);
    const helper = new EventEmitter();
    helper.exitCode = null; helper.signalCode = null;
    helper.kill = () => {}; helper.unref = () => {};
    return helper;
  };
  assert.equal(await terminateTree(leader, {platform: 'win32', env, spawnImpl, timeoutMs: 20}), false);
  assert.equal(calls, 1);
  await terminateTree({...leader, exitCode: 0}, {platform: 'win32', env, spawnImpl});
  assert.equal(calls, 1, 'never retarget a reaped PID');
});

test('RPC close alone cannot hide a pending or failed tree-cleanup helper', async () => {
  const fake = new EventEmitter();
  Object.assign(fake, {pid: 123, exitCode: null, signalCode: null,
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), unref() {}});
  let settle;
  const rpc = new RpcClient('fixture', [], {timeoutMs: 1000, spawnImpl: () => fake,
    terminate: () => new Promise((resolve) => { settle = resolve; })});
  rpc.stop(); fake.emit('close', 0);
  let joined = false; rpc.closed.then(() => { joined = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(joined, false);
  settle(false); await rpc.closed;
  assert.equal(rpc.failure, 'termination_error');
});

test('shell-free arguments preserve spaces and metacharacters', async () => {
  const value = 'path with spaces & "quotes" $(literal)';
  const result = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value]);
  assert.equal(result.exit_code, 0);
  assert.equal(result.stdout, value);
});

test('RPC helper success still waits for owned stdio close', async () => {
  const fake = new EventEmitter();
  Object.assign(fake, {pid: 123, exitCode: null, signalCode: null,
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), unref() {}});
  const rpc = new RpcClient('fixture', [], {timeoutMs: 1000, spawnImpl: () => fake, terminate: async () => true});
  rpc.stop();
  let joined = false; rpc.closed.then(() => { joined = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(joined, false);
  fake.emit('close', 0); await rpc.closed;
  assert.equal(rpc.failure, null);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForPid(path) {
  for (let i = 0; i < 500; i++) {
    try { return Number(await readFile(path, 'utf8')); } catch { await wait(30); }
  }
  throw new Error('Synthetic grandchild did not start.');
}
async function waitGone(pid) {
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await wait(30);
  }
  throw new Error('Synthetic grandchild is still alive after cleanup.');
}
const childSource = `
  const {spawn} = require('node:child_process');
  const code = "require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(()=>{},1000)";
  spawn(process.execPath, ['-e', code, process.argv[1]], {stdio:'ignore', shell:false});
  setInterval(()=>{},1000);
`;

for (const kind of ['timeout', 'cancelled']) test(`real ${kind} stops the owned process tree, including its grandchild`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relay tree '));
  const file = join(dir, 'grandchild pid.txt');
  const controller = new AbortController();
  // This timeout leaves enough room for both Windows processes to start.
  const result = runProcess(process.execPath, ['-e', childSource, file], {timeoutMs: 8000, signal: controller.signal});
  try {
    const pid = await waitForPid(file);
    if (kind === 'cancelled') controller.abort();
    const report = await result;
    assert.equal(report[kind], true);
    assert.equal(report.error, false);
    assert(report.duration_ms < 15000);
    await waitGone(pid);
  } finally { controller.abort(); await result; await rm(dir, {recursive: true, force: true}); }
});

test('real RPC cancellation closes the complete owned tree', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'relay rpc '));
  const file = join(dir, 'grandchild pid.txt');
  const controller = new AbortController();
  const rpc = new RpcClient(process.execPath, ['-e', childSource, file], {timeoutMs: 15000, signal: controller.signal});
  try {
    const pid = await waitForPid(file);
    controller.abort(); await rpc.closed;
    assert.equal(rpc.failure, 'cancelled');
    assert.equal(rpc.closeObserved, true);
    await waitGone(pid);
  } finally { rpc.stop(); await rpc.closed; await rm(dir, {recursive: true, force: true}); }
});
