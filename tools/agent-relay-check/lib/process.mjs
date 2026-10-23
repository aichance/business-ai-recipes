import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { win32 } from 'node:path';

const fileExists = async (path) => { try { return (await stat(path)).isFile(); } catch { return false; } };

// Resolve only an existing installation. Never invoke cmd.exe or execute a
// .cmd/.bat shim. Respect PATH order rather than picking a different install.
export async function resolveCodexInvocation(binary = 'codex', {
  platform = process.platform, env = process.env, exists = fileExists, node = process.execPath,
} = {}) {
  if (platform !== 'win32') return {command: binary, prefixArgs: []};
  const launcher = async (directory) => {
    const js = win32.join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (!await exists(js)) throw new Error('The selected Codex npm shim has no adjacent official launcher. Use a complete Codex installation.');
    return {command: node, prefixArgs: [js]};
  };
  if (binary !== 'codex') {
    if (/\.(cmd|bat)$/i.test(binary)) return launcher(win32.dirname(binary));
    if (/\.js$/i.test(binary)) return {command: node, prefixArgs: [binary]};
    return {command: binary, prefixArgs: []};
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path');
  for (let directory of (env[pathKey] ?? '').split(';')) {
    directory = directory.trim().replace(/^"(.*)"$/, '$1');
    // Avoid current-project search and ambiguous relative PATH entries.
    if (!win32.isAbsolute(directory)) continue;
    const exe = win32.join(directory, 'codex.exe');
    if (await exists(exe)) return {command: exe, prefixArgs: []};
    if (await exists(win32.join(directory, 'codex.cmd'))) return launcher(directory);
  }
  throw new Error('Codex executable or official npm launcher was not found on PATH. No installation or login was attempted.');
}

// Called once, only while the owned leader is live. Do not signal a reaped PID.
// The caller must ALSO observe its stdio close. This is bounded process-tree
// cleanup, not a Windows Job Object or containment of deliberately escaped work.
export async function terminateTree(child, {
  platform = process.platform, env = process.env, spawnImpl = spawn, timeoutMs = 1500,
} = {}) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return true;
  if (platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); return true; }
    catch (error) {
      if (error.code === 'ESRCH') return true;
      try { child.kill('SIGKILL'); } catch {}
      return false;
    }
  }
  const rootKey = Object.keys(env).find((key) => key.toLowerCase() === 'systemroot');
  const root = env[rootKey];
  if (!root || !win32.isAbsolute(root)) return false;
  return new Promise((resolve) => {
    let killer;
    try {
      killer = spawnImpl(win32.join(root, 'System32', 'taskkill.exe'),
        ['/PID', String(child.pid), '/T', '/F'], {shell: false, windowsHide: true, stdio: 'ignore'});
    } catch { resolve(false); return; }
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => {
      // The helper has no child process. Never retry the target numeric PID.
      if (killer.exitCode === null && killer.signalCode === null) { try { killer.kill('SIGKILL'); } catch {} }
      killer.unref();
      finish(false);
    }, timeoutMs);
    killer.once('error', () => finish(false));
    killer.once('close', (code) => finish(code === 0));
  });
}
