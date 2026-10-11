// Creates only a disposable localhost fixture. Never use an existing installation.
import { randomBytes } from 'node:crypto';
import { readFile, open, rm, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const [originArg = 'http://127.0.0.1:54193', outputArg = '.crash-lab/latestarr.local.json'] = process.argv.slice(2);
const base = new URL(originArg);
if (base.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
  throw new Error('Use a plain HTTP loopback origin for a fresh, disposable LatestArr instance.');
}
const origin = base.origin;
const output = resolve(outputArg);
const template = await readFile(new URL('./latestarr.template.json', import.meta.url), 'utf8');
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
const handle = await open(output, 'wx', 0o600);
let cookie = '';
let completed = false;
async function request(path, method = 'GET', data, status = 200) {
  const response = await fetch(`${origin}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (response.status !== status) throw new Error(`${method} ${path}: HTTP ${response.status}, expected ${status}`);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) cookie = cookies.map(value => value.split(';')[0]).join('; ');
  return response.json();
}
try {
  const providers = await request('/api/auth/providers');
  if (providers.needsSetup !== true || providers.local !== true) {
    throw new Error('Refusing an existing installation. Start a new disposable database first.');
  }
  const password = randomBytes(24).toString('base64url');
  const email = 'crash-lab@example.invalid';
  await request('/api/auth/bootstrap', 'POST', { email, password, displayName: 'Synthetic Crash Lab' }, 201);
  await request('/api/auth/login', 'POST', { email, password });
  // Put the first scheduled time at least 31 days away, then disable immediately.
  // Do not configure SMTP, sources, recipients, previews or sends.
  const future = new Date(Date.now() + 32 * 86400000);
  const cron = `0 0 ${future.getUTCDate()} ${future.getUTCMonth() + 1} *`;
  const { newsletter } = await request('/api/newsletters', 'POST', {
    name: 'ACL synthetic baseline', scheduleCron: cron, timezone: 'UTC',
    subjectTemplate: 'Synthetic baseline', lookbackDays: 7, skipWhenEmpty: true,
  }, 201);
  if (typeof newsletter?.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(newsletter.id)) {
    throw new Error('Unexpected newsletter ID; stop the disposable instance.');
  }
  const path = `/api/newsletters/${newsletter.id}`;
  const { newsletter: disabled } = await request(path, 'PATCH', { isEnabled: false });
  if (disabled.isEnabled !== false || disabled.smtpProfileId !== null) {
    throw new Error('Fixture did not become disabled and SMTP-free; stop the disposable instance.');
  }
  const contract = JSON.parse(template.replaceAll('LOCAL_ORIGIN', origin)
    .replaceAll('LOCAL_TEST_PASSWORD', password).replaceAll('NEWSLETTER_ID', newsletter.id)
    .replaceAll('FUTURE_CRON', cron));
  await handle.writeFile(JSON.stringify(contract, null, 2) + '\n');
  completed = true;
  console.log(`Created one disabled synthetic newsletter. Private contract: ${output}`);
  console.log('The contract, reports, traces and exported tests contain the generated test login. Keep them local.');
} finally {
  await handle.close();
  if (!completed) await rm(output);
}
