import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { runContract, VERSION } from '@aichance/app-crash-lab';
import { auditMedia } from './media-audit.mjs';

function args(values) {
  const options = { baseURL: 'http://127.0.0.1:59819', out: null, sourceSHA256: 'af289841ee78c711bf08122fad9e34f38abefe33c4586d8129ff6dc8c8037039' };
  for (let i = 0; i < values.length; i += 2) {
    const key = { '--base-url': 'baseURL', '--out': 'out', '--source-sha256': 'sourceSHA256' }[values[i]];
    if (!key || !values[i + 1]) throw Error('Use --base-url URL --out NEW_DIRECTORY [--source-sha256 HASH]');
    options[key] = values[i + 1];
  }
  const url = new URL(options.baseURL);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname), 'Numeric loopback HTTP only');
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Origin only');
  assert.match(options.sourceSHA256, /^[0-9a-f]{64}$/); assert.ok(options.out, '--out must name a new directory');
  return { ...options, baseURL: url.origin, out: resolve(options.out) };
}
const options = args(process.argv.slice(2));
assert.equal(VERSION, '0.12.0-dev.2', 'This measured pack uses the published prerelease');
await mkdir(dirname(options.out), { recursive: true });
await mkdir(options.out, { recursive: false });
const saveJSON = (name, data) => writeFile(join(options.out, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const result = { startedAt: new Date().toISOString(), baseURL: options.baseURL, runner: VERSION, checks: [] };
try {
  const response = await fetch(options.baseURL, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); let bytes = 0; const hash = createHash('sha256');
  for await (const chunk of response.body) { bytes += chunk.length; assert.ok(bytes <= 2500000, 'Bounded source response'); hash.update(chunk); }
  result.servedIndexSHA256 = hash.digest('hex');
  assert.equal(result.servedIndexSHA256, options.sourceSHA256, 'Unexpected source; inspect the new source before explicitly selecting its hash');
  await saveJSON('source-check.json', { ...result, sourceBytes: bytes });
  for (const [file, exit] of [['preservation.json', 0], ['roundtrip.json', 0], ['changed-text-control.json', 1]]) {
    const contract = JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8')); contract.baseURL = options.baseURL;
    const report = await runContract(contract, { out: join(options.out, file.replace('.json', '')) });
    const observed = { contract: file, expectedExit: exit, actualExit: report.exitCode, results: report.results.map(r => ({ check: r.check, status: r.status, phase: r.phase })) };
    result.checks.push(observed); console.log(JSON.stringify(observed));
    assert.equal(report.exitCode, exit, JSON.stringify(observed));
    assert.equal(report.infrastructureError, undefined);
    assert.equal(report.results.length, contract.checks.length);
    assert.ok(report.results.every(r => r.status === (exit ? 'fail' : 'pass')), 'Intentional control must fail as an application comparison, not setup/infrastructure');
  }
  result.media = await auditMedia(options.baseURL, JSON.parse(await readFile(new URL('media-backup.json', import.meta.url), 'utf8')), saveJSON);
  result.suiteChecksPassed = true;
  result.allOriginalDataAndTypesPreserved = false;
  result.summary = 'Board reload/rejection/real backup PASS; changed-text and changed-audio controls detected. Original audio bytes/metadata preserved but Blob MIME parameters change on first import.';
  console.log(result.summary);
} catch (error) { result.suiteChecksPassed = false; result.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { result.completedAt = new Date().toISOString(); await saveJSON('summary.json', result); }
