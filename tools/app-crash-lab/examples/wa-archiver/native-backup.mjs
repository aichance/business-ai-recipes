// Synthetic-only server-mode native backup diagnostic. No app source modifications.
// macOS/Linux; run only after other Next instances using --app-dir have stopped.
// It never deletes an existing Next lock or uses your current app database.
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';

const D = fileURLToPath(new URL('./', import.meta.url));
const args = process.argv.slice(2), owned = new Set();
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let out, browser, interrupted = false, exitCode = 2;
const report = { diagnosticVersion: 1, sourceSha: '7983cd4e73c6f34b23773be10872060d1e7efb0f', startedAt: new Date().toISOString(), status: 'infrastructure_error', phases: {}, notes: [] };
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  for (const child of owned) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
});
function check(condition, message) { if (!condition) throw new Error(message); }
function groupAlive(pid) { try { process.kill(-pid, 0); return true; } catch (e) { if (e.code === 'ESRCH') return false; throw e; } }
async function stop(child) {
  if (!child || !owned.has(child)) return;
  for (const [signal, limit] of [['SIGTERM', 12000], ['SIGKILL', 4000]]) {
    try { process.kill(-child.pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; }
    const deadline = Date.now() + limit;
    while (groupAlive(child.pid) && Date.now() < deadline) await sleep(100);
    if (!groupAlive(child.pid)) { owned.delete(child); return; }
  }
  throw new Error('Own process group did not terminate: ' + child.pid);
}
function start(appDir, executable, argv, env, logName) {
  check(!interrupted, 'Interrupted before child start');
  const log = createWriteStream(path.join(out, logName), { flags: 'wx' });
  const child = spawn(executable, argv, { cwd: appDir, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => { log.end(); resolve(code); }); });
  child.completed.catch(() => {});
  if (child.pid) owned.add(child);
  return child;
}
async function timed(promise, milliseconds, message) {
  let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function freePort(port) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
}
async function lockAbsent(appDir) {
  try { await fs.access(path.join(appDir, '.next/dev/lock')); throw new Error('Existing Next dev lock: stop its owner yourself; this draft will not touch it'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
async function json(origin, route, method = 'GET', data) {
  const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(120000) });
  return { status: response.status, value: await response.json() };
}
async function phase(appDir, name, port, endpoint) {
  await lockAbsent(appDir); await freePort(port);
  const folder = await fs.mkdtemp(path.join(out, name + '-db-')), db = path.join(folder, 'fresh.sqlite');
  const appRequire = createRequire(path.join(appDir, 'package.json'));
  const SQL = await appRequire('sql.js')({ locateFile: () => appRequire.resolve('sql.js/dist/sql-wasm.wasm') });
  const empty = new SQL.Database();
  try { empty.run('VACUUM'); await fs.writeFile(db, empty.export(), { flag: 'wx' }); } finally { empty.close(); }
  const env = { ...process.env, DATABASE_URL: 'file:' + db, NEXT_TELEMETRY_DISABLED: '1', NEXT_EXIT_TIMEOUT_MS: '10000' };
  const prisma = start(appDir, process.execPath, [path.join(appDir, 'node_modules/prisma/build/index.js'), 'db', 'push', '--skip-generate', '--schema', path.join(appDir, 'prisma/schema.prisma')], env, name + '-prisma.log');
  try { check(await timed(prisma.completed, 60000, 'Prisma timeout') === 0, 'Prisma db push failed'); } finally { await stop(prisma); }
  const child = start(appDir, process.execPath, [path.join(appDir, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], env, name + '-next.log');
  const origin = 'http://127.0.0.1:' + port, deadline = Date.now() + 240000;
  report.phases[name] = { port, database: db, nextPid: child.pid, origin };
  while (Date.now() < deadline) {
    check(!interrupted && child.exitCode === null && child.signalCode === null, 'Next exited or interrupted');
    try {
      const started = Date.now(), backup = await json(origin, '/api/backup'), messages = await json(origin, endpoint);
      if (backup.status === 200 && messages.status === 404) {
        report.phases[name].warmup = { backupStatus: backup.status, fixtureMessagesStatus: messages.status, milliseconds: Date.now() - started };
        return { child, origin };
      }
    } catch {}
    await sleep(500);
  }
  throw new Error('Next readiness timeout; inspect own phase logs');
}
async function pageFor(origin) {
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await context.route('**/*', route => { const url = new URL(route.request().url()); return url.origin === origin ? route.continue() : route.abort(); });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const guide = page.getByRole('dialog', { name: 'Interactive guide', exact: true });
  try { await guide.waitFor({ state: 'visible', timeout: 5000 }); await guide.getByRole('button', { name: 'Skip', exact: true }).click(); }
  catch (e) { if (e.name !== 'TimeoutError') throw e; }
  return { context, page };
}
async function settings(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog.waitFor();
  check((await dialog.innerText()).includes('Chats live on the server via /api'), 'UI is not server storage mode');
  return dialog;
}
async function shot(page, chatId, replyId, name, parentBody, expectedBody) {
  const row = page.locator('[data-mid="' + replyId + '"]');
  await page.locator('[data-chat-id="' + chatId + '"]').click();
  await row.waitFor({ state: 'visible', timeout: 30000 });
  await row.scrollIntoViewIfNeeded();
  const text = await row.innerText();
  check(text.includes(expectedBody), 'The rendered reply row is missing its ordinary body');
  const visible = text.includes(parentBody);
  await fs.writeFile(path.join(out, name + '-row.txt'), text);
  await page.screenshot({ path: path.join(out, name + '.png'), fullPage: false });
  return visible;
}
try {
  check(process.platform !== 'win32', 'This process-group helper supports macOS/Linux only');
  const outputArg = option('--output-root'); check(outputArg, 'Required: --output-root /absolute/writable/results-folder');
  await fs.mkdir(path.resolve(outputArg), { recursive: true });
  out = await fs.mkdtemp(path.join(path.resolve(outputArg), 'wa-roundtrip-'));
  const appArg = option('--app-dir'); check(appArg, 'Required: --app-dir /absolute/installed/fixed-app');
  const appDir = await fs.realpath(appArg), sourcePort = Number(option('--source-port', '54673')), targetPort = Number(option('--target-port', '54674'));
  check([sourcePort, targetPort].every(p => Number.isInteger(p) && p >= 1024 && p <= 65535 && p !== 54672) && sourcePort !== targetPort, 'Invalid/non-dedicated ports (54672 is protected)');
  const { chromium } = createRequire(import.meta.url)('@playwright/test');
  const manifest = JSON.parse(await fs.readFile(path.join(D, 'source-files.json'), 'utf8'));
  check(manifest.upstream_sha === report.sourceSha && manifest.all_git_blobs_verified === true && manifest.files.length === 222, 'Unverified source manifest');
  const changed = [];
  for (const file of manifest.files) {
    const bytes = await fs.readFile(path.join(appDir, file.path)).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (bytes === null || sha(bytes) !== file.sha256) changed.push(file.path);
  }
  check(changed.length === 0 || args.includes('--allow-source-changes'), 'Fixed-source mismatch; use --allow-source-changes only for a deliberate local regression check: ' + changed.join(', '));
  report.sourceVerification = { baseline: report.sourceSha, verifiedOriginalFiles: manifest.files.length - changed.length, changedFiles: changed, allowChanges: args.includes('--allow-source-changes'), unchangedPinnedSource: changed.length === 0 };
  const versions = {};
  for (const pkg of ['prisma', 'next']) versions[pkg] = JSON.parse(await fs.readFile(path.join(appDir, 'node_modules', pkg, 'package.json'), 'utf8')).version;
  check(versions.prisma === '6.19.3' && versions.next === '16.4.2', 'Unexpected installed versions');
  const helperRequire = createRequire(import.meta.url);
  versions.playwright = helperRequire('@playwright/test/package.json').version;
  versions.sqlJs = JSON.parse(await fs.readFile(path.join(appDir, 'node_modules/sql.js/package.json'), 'utf8')).version;
  report.environment = { node: process.version, appDir, versions }; report.output = out;
  const seed = JSON.parse(await fs.readFile(path.join(D, 'synthetic-seed.json'), 'utf8'));
  const contract = JSON.parse(await fs.readFile(path.join(D, 'preservation.json'), 'utf8'));
  const chat = seed.chats[0], parent = chat.messages.find(m => m.id === 'acl-wa-parent-v1');
  const replyInput = contract.setup.find(s => s.path?.endsWith('/messages') && s.data?.replyToId === parent.id)?.data;
  check(seed.chats.length === 1 && parent && replyInput, 'Unexpected synthetic fixture');
  const endpoint = '/api/chats/' + encodeURIComponent(chat.id) + '/messages';
  const source = await phase(appDir, 'source', sourcePort, endpoint);
  check((await json(source.origin, endpoint)).status === 404, 'Source fixture already exists');
  const seeded = await json(source.origin, '/api/backup', 'POST', seed);
  check(seeded.status === 200 && seeded.value.chatsCreated === 1 && seeded.value.messagesImported === 2, 'Source seed not confirmed');
  const sent = await json(source.origin, endpoint, 'POST', replyInput);
  check(sent.status === 200 && sent.value.message?.replyTo?.id === parent.id, 'Normal reply creation did not establish baseline');
  const replyId = sent.value.message.id, before = await json(source.origin, endpoint);
  check(before.status === 200 && before.value.messages.length === 3, 'Source DTO unavailable');
  const beforeMessages = before.value.messages, sourceReply = beforeMessages.find(m => m.id === replyId);
  check(sourceReply?.replyTo?.id === parent.id && sourceReply.body === replyInput.body, 'Source full DTO lacks expected reply');
  await fs.writeFile(path.join(out, 'source-messages.json'), JSON.stringify(before.value, null, 2));
  browser = await chromium.launch();
  report.environment.chromium = browser.version();
  const sourceUI = await pageFor(source.origin);
  check(await shot(sourceUI.page, chat.id, replyId, 'source-reply', parent.body, replyInput.body), 'Source quote is not visible');
  const sourceDialog = await settings(sourceUI.page), downloads = [];
  sourceUI.page.on('download', download => downloads.push(download));
  const waiting = sourceUI.page.waitForEvent('download');
  await sourceDialog.getByRole('button', { name: 'Download backup (.json)', exact: true }).click();
  const download = await waiting, backupFile = path.join(out, 'downloaded-backup.json');
  await download.saveAs(backupFile); check(!(await download.failure()), 'Download failed');
  const bytes = await fs.readFile(backupFile); check(bytes.length > 0 && bytes.length <= 1048576, 'Unexpected backup size');
  JSON.parse(bytes.toString('utf8')); check(downloads.length === 1, 'Expected exactly one UI download');
  report.backup = { sha256: sha(bytes), bytes: bytes.length, downloadCount: downloads.length, originalBytesUploaded: false };
  await sourceUI.context.close(); await stop(source.child); await lockAbsent(appDir);
  const target = await phase(appDir, 'target', targetPort, endpoint);
  const absent = await json(target.origin, endpoint), emptyBackup = await json(target.origin, '/api/backup');
  check(absent.status === 404 && emptyBackup.status === 200 && equal(emptyBackup.value.chats, []), 'Target not an independently empty DB');
  report.targetBefore = { fixtureStatus: absent.status, chats: emptyBackup.value.chats };
  const targetUI = await pageFor(target.origin), targetDialog = await settings(targetUI.page);
  const choosing = targetUI.page.waitForEvent('filechooser');
  await targetDialog.getByRole('button', { name: 'Restore from backup', exact: true }).click();
  const chooser = await choosing, restoring = targetUI.page.waitForResponse(r => r.url() === target.origin + '/api/backup' && r.request().method() === 'POST');
  await chooser.setFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: bytes });
  const restored = await restoring; report.restore = { status: restored.status(), result: await restored.json() };
  report.backup.originalBytesUploaded = true;
  check(restored.ok() && report.restore.result.messagesImported === 3 && report.restore.result.chatsCreated === 1, 'UI restore did not confirm the synthetic fixture');
  // The POST response means the server finished; do not hide data loss behind a success-count toast assertion.
  await targetUI.page.keyboard.press('Escape'); await targetDialog.waitFor({ state: 'hidden' });
  await targetUI.page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 });
  const after = await json(target.origin, endpoint);
  await fs.writeFile(path.join(out, 'target-messages.json'), JSON.stringify(after.value, null, 2));
  check(after.status === 200 && Array.isArray(after.value.messages) && after.value.messages.length === 3, 'Restored fixture DTO unavailable or incomplete');
  const afterMessages = after.value.messages;
  const targetReply = afterMessages.find(m => m.id === replyId);
  const ordinary = list => list.map(({ replyTo, ...rest }) => rest);
  report.comparisons = { fullMessagesDTO: equal(beforeMessages, afterMessages), ordinaryFields: equal(ordinary(beforeMessages), ordinary(afterMessages)), replyTo: equal(sourceReply.replyTo, targetReply?.replyTo), sourceReplyTo: sourceReply.replyTo, targetReplyTo: targetReply?.replyTo ?? null };
  report.measurementStatus = report.comparisons.fullMessagesDTO ? 'pass' : 'preservation_failure';
  report.ordinaryControl = { matched: report.comparisons.ordinaryFields, before: ordinary(beforeMessages), after: ordinary(afterMessages) };
  report.replyControl = { matched: report.comparisons.replyTo, before: sourceReply.replyTo, after: targetReply?.replyTo ?? null };
  const dtoLoss = !report.comparisons.fullMessagesDTO;
  try {
    report.targetQuoteVisible = await shot(targetUI.page, chat.id, replyId, 'target-reply-after-reload', parent.body, replyInput.body);
    report.targetUIStatus = 'verified';
  } catch (error) {
    report.targetQuoteVisible = null;
    report.targetUIStatus = 'unverified';
    report.targetUIError = String(error?.stack ?? error);
    // A verified DTO mismatch survives a later screenshot/selector failure.
    // With no data mismatch, unavailable UI is an infrastructure result.
    if (!dtoLoss) throw error;
  }
  report.loss = dtoLoss || report.targetQuoteVisible === false;
  report.status = report.loss ? 'preservation_failure' : 'pass'; exitCode = report.loss ? 1 : 0;
  await targetUI.context.close();
} catch (error) { report.error = String(error?.stack ?? error); exitCode = 2; }
finally {
  try { await browser?.close(); } catch (e) { report.notes.push('Browser cleanup: ' + e); exitCode = 2; }
  for (const child of [...owned]) try { await stop(child); } catch (e) { report.notes.push('Own process cleanup: ' + e); exitCode = 2; }
  report.executionStatus = exitCode === 2 ? 'infrastructure_error' : 'completed';
  if (exitCode === 2) report.status = report.measurementStatus === 'preservation_failure' ? 'preservation_failure' : 'infrastructure_error';
  report.exitCode = exitCode; report.completedAt = new Date().toISOString();
  if (out) await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.exitCode = exitCode;
  console.log(JSON.stringify({ status: report.status, exitCode, output: out }));
}
