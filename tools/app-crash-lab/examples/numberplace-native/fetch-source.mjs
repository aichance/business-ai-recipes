import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const url = 'https://nas6.net/NumberPlace000.htm';
const pin = process.env.NUMBERPLACE_EXPECT_SHA256 || '663372bbae5ce8a6903035551d150b19ab12438d4f45d14c438b986e1a38bc9e';
if (!/^[a-f0-9]{64}$/.test(pin)) throw new Error('Expected a lowercase source SHA-256');
const destination = resolve(process.argv[2] || '.crash-lab/numberplace-upstream/NumberPlace000.htm');
let existing;
try { existing = await readFile(destination); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (existing) {
  if (createHash('sha256').update(existing).digest('hex') !== pin) throw new Error('Existing file differs; review it instead of overwriting');
} else {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Source HTTP${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== pin) throw new Error('Upstream changed; review the new source and hash before running');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: 'wx' });
}
console.log(destination);
