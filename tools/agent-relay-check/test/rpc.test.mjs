import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { RpcClient } from '../lib/rpc.mjs';

function child() {
  const c = new EventEmitter();
  c.stdin = new PassThrough(); c.stdout = new PassThrough(); c.stderr = new PassThrough();
  c.pid = undefined; c.exitCode = null; c.signalCode = null;
  c.kill = () => true;
  c.unref = () => { c.unreferenced = true; };
  return c;
}

test('deadline also bounds cleanup when the child never emits close', async () => {
  const fake = child();
  const rpc = new RpcClient('offline-fake', [], {timeoutMs: 20, cleanupTimeoutMs: 30, spawnImpl: () => fake});
  const begin = performance.now();
  await rpc.closed;
  assert.equal(rpc.failure, 'timeout');
  assert.equal(rpc.closeObserved, false);
  assert.equal(fake.unreferenced, true);
  assert(performance.now() - begin < 1000);
});

test('already exited leader with a held pipe is bounded, without re-signalling its PID', async () => {
  const fake = child(); fake.exitCode = 0;
  let attempts = 0; fake.kill = () => { attempts++; };
  const rpc = new RpcClient('offline-fake', [], {timeoutMs: 1000, cleanupTimeoutMs: 30, spawnImpl: () => fake});
  rpc.stop(); await rpc.closed;
  assert.equal(rpc.failure, 'cleanup_timeout');
  assert.equal(rpc.closeObserved, false);
  assert.equal(attempts, 0);
});

test('invalid response is inconclusive and normal observed close clears cleanup timer', async () => {
  const fake = child();
  const rpc = new RpcClient('offline-fake', [], {timeoutMs: 1000, cleanupTimeoutMs: 100, spawnImpl: () => fake});
  const request = rpc.request('initialize', {});
  fake.stdout.write('invalid json\n');
  await assert.rejects(request, /invalid_event_stream/);
  fake.emit('close', null); await rpc.closed;
  assert.equal(rpc.closeObserved, true);
  assert.equal(rpc.failure, 'invalid_event_stream');
});

test('unterminated final JSON frame cannot be silently ignored on close', async () => {
  const fake = child();
  const rpc = new RpcClient('offline-fake', [], {timeoutMs: 1000, cleanupTimeoutMs: 100, spawnImpl: () => fake});
  fake.stdout.write('{"method":"error"');
  rpc.stop(); fake.emit('close', null); await rpc.closed;
  assert.equal(rpc.failure, 'invalid_event_stream');
});
