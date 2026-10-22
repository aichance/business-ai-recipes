import { spawn } from 'node:child_process';

// Private stdio transport. It never writes responses, configuration or stderr to
// disk. One deadline covers initialization, configuration discovery and the turn.
export class RpcClient {
  constructor(command, args, {cwd, timeoutMs, signal, onNotification = () => {}, cleanupTimeoutMs = 2000, spawnImpl = spawn}) {
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.bytes = 0;
    this.stderr = '';
    this.failure = null;
    this.ended = false;
    this.stopping = false;
    this.closeObserved = false;
    this.cleanupTimeoutMs = cleanupTimeoutMs;
    this.onNotification = onNotification;
    this.child = spawnImpl(command, args, {cwd, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe']});
    this.closed = new Promise((resolve) => { this.resolveClosed = resolve; });
    this.timer = setTimeout(() => this.fail('timeout'), timeoutMs);
    this.cancel = () => this.fail('cancelled');
    this.signal = signal;
    signal?.addEventListener('abort', this.cancel, {once: true});
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (data) => this.consume(data));
    this.child.stderr.on('data', (data) => {
      this.stderr = (this.stderr + data.toString('utf8')).slice(-4096);
      this.bytes += data.length;
      if (this.bytes > 4 * 1024 * 1024) this.fail('output_limit');
    });
    this.child.stdin.on('error', () => { if (!this.stopping) this.fail('transport_error'); });
    this.child.on('error', () => this.fail('transport_error'));
    this.child.on('close', (code) => {
      this.ended = true;
      this.closeObserved = true;
      clearTimeout(this.timer);
      clearTimeout(this.cleanupTimer);
      if (this.buffer.trim()) this.fail('invalid_event_stream');
      signal?.removeEventListener('abort', this.cancel);
      if (!this.stopping) this.fail('unexpected_exit');
      this.resolveClosed(code);
    });
    if (signal?.aborted) this.cancel();
  }
  kill(sig) {
    if (this.child.pid) {
      try { process.kill(-this.child.pid, sig); } catch (e) {
        if (e.code !== 'ESRCH') {
          this.failure ??= 'termination_error';
          // Same owned, still-live child only; do not retry a reaped PID.
          if (!this.ended && this.child.exitCode === null && this.child.signalCode === null) {
            try { this.child.kill(sig); } catch { /* The bounded join below reports failure. */ }
          }
        }
      }
    }
  }
  fail(reason) {
    this.failure ??= reason;
    for (const {reject} of this.pending.values()) reject(new Error(this.failure));
    this.pending.clear();
    this.onFailure?.(new Error(this.failure));
    this.stop();
  }
  stop() {
    if (this.stopping) return;
    this.stopping = true;
    clearTimeout(this.timer);
    if (!this.ended) this.cleanupTimer = setTimeout(() => {
      this.failure ??= 'cleanup_timeout';
      for (const {reject} of this.pending.values()) reject(new Error(this.failure));
      this.pending.clear();
      this.onFailure?.(new Error(this.failure));
      this.child.stdin.destroy();
      this.child.stdout.destroy();
      this.child.stderr.destroy();
      this.child.unref();
      this.signal?.removeEventListener('abort', this.cancel);
      // This does NOT certify termination. closeObserved stays false and the
      // report is inconclusive; callers must not automatically restart it.
      this.resolveClosed(null);
    }, this.cleanupTimeoutMs);
    // The diagnostic owns this ephemeral server and its process group. Stop the
    // group once, while its leader is still live. Never signal a reaped PID from
    // the close callback (its numeric ID may already have been reused).
    if (!this.ended && this.child.exitCode === null && this.child.signalCode === null) this.kill('SIGKILL');
    this.child.stdin.destroy();
  }
  send(value) {
    if (this.failure || this.ended) throw new Error(this.failure ?? 'transport_closed');
    this.child.stdin.write(JSON.stringify(value) + '\n');
  }
  request(method, params) {
    if (this.failure) return Promise.reject(new Error(this.failure));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve, reject});
      try { this.send({id, method, params}); } catch (e) { this.pending.delete(id); reject(e); }
    });
  }
  consume(data) {
    this.bytes += Buffer.byteLength(data);
    if (this.bytes > 4 * 1024 * 1024) { this.fail('output_limit'); return; }
    this.buffer += data;
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { this.fail('invalid_event_stream'); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) { this.fail('invalid_event_stream'); return; }
      if ('id' in message && !message.method) {
        const pending = this.pending.get(message.id);
        if (!pending) { this.fail('unexpected_response'); return; }
        this.pending.delete(message.id);
        if ('error' in message) pending.reject(new Error('rpc_error'));
        else if ('result' in message) pending.resolve(message.result);
        else pending.reject(new Error('invalid_response'));
      } else if ('id' in message && message.method) {
        // The diagnostic never grants approvals or answers an elicitation.
        this.send({id: message.id, error: {code: -32601, message: 'This diagnostic does not support server requests.'}});
        this.fail('server_request');
      } else if (typeof message.method === 'string') {
        try { this.onNotification(message); } catch { this.fail('invalid_event_stream'); }
      } else { this.fail('invalid_event_stream'); return; }
    }
  }
}
