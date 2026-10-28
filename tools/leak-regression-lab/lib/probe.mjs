import {CheckError, equal, sha256, credentials, contractFingerprint} from './config.mjs';

const LIMIT = 1024 * 1024;
const denied = (r) => [401, 403, 404].includes(r.status) ||
  (r.status === 400 && r.json && [401, 403, 404].includes(Number(r.json.statusCode)) && typeof r.json.error === 'string');
const rowPath = (r) => {
  const q = new URLSearchParams({select: '*', [r.id_column]: `eq.${r.record_id}`});
  return `/rest/v1/${r.table}?${q}`;
};
const objectPath = (r, publicRoute = false) => `/storage/v1/object/${publicRoute ? 'public' : 'authenticated'}/${encodeURIComponent(r.bucket)}/${r.path.split('/').map(encodeURIComponent).join('/')}`;
const observed = (r, resource, kind) => {
  if (r.status !== 200) return false;
  if (kind === 'row') return Array.isArray(r.json) && r.json.some((x) => x?.[resource.id_column] === resource.record_id && Object.entries(resource.expect).every(([k, v]) => equal(x[k], v)));
  return r.digest === resource.sha256;
};
function classify(r, resource, kind) {
  if (observed(r, resource, kind)) return 'present';
  if (denied(r) || (kind === 'row' && r.status === 200 && Array.isArray(r.json) && r.json.length === 0)) return 'denied';
  return 'unknown';
}

export async function request(config, path, {token, publicKey, body, fetchImpl = fetch} = {}) {
  const url = new URL(path, config.origin);
  if (url.origin !== config.origin || !path.startsWith('/')) throw new CheckError('CROSS_ORIGIN_REFUSED');
  // Supabase's unauthenticated client still sends its anon/publishable credential.
  // Omitting it can produce a malformed-request400 rather than testing anon access.
  const headers = {apikey: publicKey, Authorization: `Bearer ${token ?? publicKey}`, 'Cache-Control': 'no-cache'};
  if (body) headers['Content-Type'] = 'application/json';
  const method = body ? 'POST' : 'GET';
  let response;
  try {
    response = await fetchImpl(url, {method, headers, body: body ? JSON.stringify(body) : undefined,
      redirect: 'error', signal: AbortSignal.timeout(config.timeout_ms), cache: 'no-store'});
    const length = Number(response.headers.get('content-length'));
    if (length > LIMIT) { await response.body?.cancel(); throw new CheckError('RESPONSE_TOO_LARGE'); }
    const reader = response.body?.getReader(); const chunks = []; let total = 0;
    if (reader) {
      for (;;) {
        const {done, value} = await reader.read(); if (done) break;
        total += value.length;
        if (total > LIMIT) { await reader.cancel(); throw new CheckError('RESPONSE_TOO_LARGE'); }
        chunks.push(value);
      }
    }
    const bytes = Buffer.concat(chunks); let json = null;
    try { json = JSON.parse(bytes.toString('utf8')); } catch { /* Binary/invalid JSON remains a typed unknown. */ }
    return {status: response.status, bytes: total, digest: sha256(bytes), json};
  } catch (e) {
    return {status: null, error: e instanceof CheckError ? e.code : 'NETWORK_OR_TIMEOUT', json: null};
  }
}

export async function inspect(config, env, {fetchImpl = fetch, now = () => new Date().toISOString()} = {}) {
  const secret = credentials(config, env);
  const report = {schema_version: 1, product: 'leak-regression-lab', version: '0.1.0', measured_at: now(),
    contract_sha256: contractFingerprint(config), environment: 'test', status: 'INCONCLUSIVE',
    coverage_complete: false, authentication: 'NOT_TESTED', cases: [],
    scope: ['known-row-read-isolation', 'known-private-object-read-isolation', 'public-object-route'],
    not_tested: ['write/delete', 'signed-URLs', 'cache-persistence', 'Realtime', 'RPC', 'browser-sessions', 'general-app-security']};
  const tokens = {}; const userIDs = [];
  for (const who of ['a', 'b']) {
    const r = await request(config, '/auth/v1/token?grant_type=password', {publicKey: secret.publicKey, body: secret.actors[who], fetchImpl});
    const data = r.json;
    if (r.status !== 200 || typeof data?.access_token !== 'string' || !data.access_token || typeof data?.user?.id !== 'string') {
      report.authentication = 'INCONCLUSIVE'; report.reason = 'AUTH_FAILED'; return report;
    }
    // A privileged/malformed account token must never stand in for an ordinary test user.
    try {
      const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64url'));
      if (payload.role !== 'authenticated' || payload.sub !== data.user.id) throw new Error();
    } catch { report.authentication = 'INCONCLUSIVE'; report.reason = 'NORMAL_USER_TOKEN_REQUIRED'; return report; }
    tokens[who] = data.access_token; userIDs.push(data.user.id);
  }
  if (userIDs[0] === userIDs[1]) { report.authentication = 'INCONCLUSIVE'; report.reason = 'DISTINCT_USERS_REQUIRED'; return report; }
  report.authentication = 'TWO_DISTINCT_NORMAL_USERS';
  for (const [group, kind] of [['rows', 'row'], ['objects', 'object']]) {
    for (const resource of config[group]) {
      const path = kind === 'row' ? rowPath(resource) : objectPath(resource);
      const owner = await request(config, path, {token: tokens[resource.owner], publicKey: secret.publicKey, fetchImpl});
      const ownerOK = observed(owner, resource, kind);
      const control = {resource: resource.id, surface: kind, actor: 'owner', route: kind === 'row' ? 'row' : 'authenticated-object',
        status: ownerOK ? 'PASS' : 'INCONCLUSIVE', http_status: owner.status,
        reason: ownerOK ? 'EXPECTED_TEST_DATA_RETURNED' : 'OWNER_CONTROL_NOT_AVAILABLE'};
      report.cases.push(control);
      const probes = [['other', path, tokens[resource.owner === 'a' ? 'b' : 'a']], ['anonymous', path, null]];
      if (kind === 'object') probes.push(['anonymous-public', objectPath(resource, true), null]);
      for (const [actor, targetPath, token] of probes) {
        const entry = {resource: resource.id, surface: kind, actor,
          route: actor === 'anonymous-public' ? 'public-object' : control.route,
          status: 'INCONCLUSIVE', http_status: null, reason: 'OWNER_CONTROL_NOT_AVAILABLE'};
        if (ownerOK) {
          const r = await request(config, targetPath, {token, publicKey: secret.publicKey, fetchImpl});
          const state = classify(r, resource, kind); entry.http_status = r.status;
          entry.status = state === 'present' ? 'FAIL' : state === 'denied' ? 'PASS' : 'INCONCLUSIVE';
          entry.reason = state === 'present' ? 'PRIVATE_TEST_DATA_RETURNED' : state === 'denied' ? 'ACCESS_DENIED' : (r.error ?? 'UNEXPECTED_RESPONSE');
        }
        report.cases.push(entry);
      }
    }
  }
  const states = report.cases.map((x) => x.status);
  report.coverage_complete = !states.includes('INCONCLUSIVE');
  report.status = states.includes('FAIL') ? 'FAIL' : states.includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
  report.counts = Object.fromEntries(['PASS', 'FAIL', 'INCONCLUSIVE'].map((s) => [s, states.filter((v) => v === s).length]));
  return report;
}

export function compare(before, after) {
  if (!before || !after || before.product !== 'leak-regression-lab' || after.product !== before.product || before.contract_sha256 !== after.contract_sha256) {
    throw new CheckError('DIFFERENT_CHECK_CONTRACT');
  }
  const key = (r) => `${r.resource}/${r.actor}/${r.route}`;
  for (const report of [before, after]) {
    if (report.schema_version !== 1 || !Array.isArray(report.cases) || report.cases.length < 14 || report.cases.length > 140 ||
        report.cases.some((r) => !r || !['PASS', 'FAIL', 'INCONCLUSIVE'].includes(r.status) || typeof r.resource !== 'string' || typeof r.actor !== 'string' || typeof r.route !== 'string') ||
        new Set(report.cases.map(key)).size !== report.cases.length) throw new CheckError('INVALID_OR_INCOMPLETE_REPORT');
    const states = report.cases.map((r) => r.status);
    const status = states.includes('FAIL') ? 'FAIL' : states.includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
    if (report.status !== status || report.coverage_complete !== !states.includes('INCONCLUSIVE')) throw new CheckError('INVALID_OR_INCOMPLETE_REPORT');
  }
  if (!equal(before.cases.map(key).sort(), after.cases.map(key).sort())) throw new CheckError('DIFFERENT_CASE_SET');
  const old = new Map(before.cases.map((r) => [`${r.resource}/${r.actor}/${r.route}`, r]));
  const changes = after.cases.map((r) => ({resource: r.resource, actor: r.actor, route: r.route,
    before: old.get(`${r.resource}/${r.actor}/${r.route}`)?.status ?? 'NOT_TESTED', after: r.status}));
  return {product: 'leak-regression-lab', before: before.status, after: after.status,
    coverage_complete: after.coverage_complete,
    regressions: changes.filter((r) => r.before === 'PASS' && r.after === 'FAIL'),
    resolved: changes.filter((r) => r.before === 'FAIL' && r.after === 'PASS'),
    incomplete: changes.filter((r) => ['INCONCLUSIVE', 'NOT_TESTED'].includes(r.before) || r.after === 'INCONCLUSIVE')};
}
