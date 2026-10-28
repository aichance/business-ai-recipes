import {CheckError, equal, sha256, credentials, contractFingerprint, ROW_PROJECTION, ROW_DENIAL_POLICY} from './config.mjs';

const LIMIT = 1024 * 1024;
// An authentication failure does not prove the intended anonymous/user policy ran.
const storageDenials = new Map([['not_found', 404], ['NoSuchKey', 404], ['NoSuchBucket', 404],
  ['unauthorized', 403], ['AccessDenied', 403]]);
function denied(r, kind, actor) {
  // A status alone can also describe an expired JWT, a bad signature or a
  // broken gateway. Only documented policy/missing-object responses count.
  if (kind === 'row') {
    if (r.json?.code !== '42501') return false;
    if (r.status === 403) return true;
    // PostgREST maps insufficient_privilege to 401 for its anonymous role.
    // This is only an anonymous row probe, after the owner positive control;
    // a user/Storage 401 or an authentication-error envelope is still unknown.
    return actor === 'anonymous' && r.status === 401 &&
      typeof r.json.message === 'string' && r.json.message.trim().length > 0 &&
      ['error', 'error_description', 'statusCode', 'httpStatusCode'].every((field) => !Object.hasOwn(r.json, field));
  }
  if (r.json?.error === 'Bucket not found') return r.status === 400 && Number(r.json.statusCode) === 404 &&
    r.json.code === undefined && r.json.httpStatusCode === undefined;
  const status = r.status === 400 ? Number(r.json?.statusCode ?? r.json?.httpStatusCode) : r.status;
  const codes = [r.json?.code, r.json?.error].filter((x) => typeof x === 'string');
  return [400, 403, 404].includes(r.status) && codes.length > 0 &&
    codes.every((code) => storageDenials.get(code) === status);
}
const rowPath = (r) => {
  // Request only fields this contract observes, preserving column-level grants.
  // Config validation restricts every selected name to a plain identifier.
  const fields = [...new Set([r.id_column, ...Object.keys(r.expect)])];
  const q = new URLSearchParams({select: fields.join(','), [r.id_column]: `eq.${r.record_id}`});
  return `/rest/v1/${r.table}?${q}`;
};
const objectPath = (r, publicRoute = false) => `/storage/v1/object/${publicRoute ? 'public' : 'authenticated'}/${encodeURIComponent(r.bucket)}/${r.path.split('/').map(encodeURIComponent).join('/')}`;
const observed = (r, resource, kind) => {
  if (r.status !== 200) return false;
  if (kind === 'row') return Array.isArray(r.json) && r.json.some((x) => x?.[resource.id_column] === resource.record_id && Object.entries(resource.expect).every(([k, v]) => equal(x[k], v)));
  return r.digest === resource.sha256;
};
function classify(r, resource, kind, actor) {
  if (observed(r, resource, kind)) return 'present';
  if (denied(r, kind, actor) || (kind === 'row' && r.status === 200 && Array.isArray(r.json) && r.json.length === 0)) return 'denied';
  return 'unknown';
}

// Decoding only rejects unsuitable input; the Auth server must verify supplied
// session JWTs. No decoded subject is trusted as the authenticated identity.
function ordinaryClaims(token) {
  try {
    if (typeof token !== 'string' || token.length > 16384) return null;
    const fields = token.split('.');
    if (fields.length !== 3 || !fields.every((s) => /^[A-Za-z0-9_-]+$/.test(s))) return null;
    const payload = JSON.parse(Buffer.from(fields[1], 'base64url'));
    if (payload?.role !== 'authenticated' || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 200) return null;
    return payload;
  } catch { return null; }
}

export async function request(config, path, {token, publicKey, body, fetchImpl = fetch} = {}) {
  const url = new URL(path, config.origin);
  if (url.origin !== config.origin || !path.startsWith('/')) throw new CheckError('CROSS_ORIGIN_REFUSED');
  // Only user JWTs and legacy anon JWTs belong in Authorization. Opaque
  // publishable keys use apikey only; treating them as JWTs can mask anon leaks.
  const headers = {apikey: publicKey, 'Cache-Control': 'no-cache'};
  if (token || !publicKey.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${token ?? publicKey}`;
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
  const report = {schema_version: 1, product: 'leak-regression-lab', version: '0.1.3', measured_at: now(),
    contract_sha256: contractFingerprint(config), environment: 'test', status: 'INCONCLUSIVE',
    row_projection: ROW_PROJECTION,
    row_denial_policy: ROW_DENIAL_POLICY,
    coverage_complete: false, authentication: 'NOT_TESTED', cases: [],
    scope: ['known-row-read-isolation', 'known-private-object-read-isolation', 'public-object-route'],
    not_tested: ['undeclared-row-fields', 'column-permission-matrix', 'write/delete', 'signed-URLs', 'cache-persistence', 'Realtime', 'RPC', 'browser-sessions', 'general-app-security']};
  const tokens = {}; const userIDs = [];
  for (const who of ['a', 'b']) {
    const actor = secret.actors[who];
    let r; let data;
    if (actor.accessToken) {
      const claims = ordinaryClaims(actor.accessToken);
      if (!claims) { report.authentication = 'INCONCLUSIVE'; report.reason = 'NORMAL_USER_TOKEN_REQUIRED'; return report; }
      const seconds = Date.now() / 1000;
      if (!Number.isFinite(claims.exp) || claims.exp <= seconds ||
          (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > seconds))) {
        report.authentication = 'INCONCLUSIVE'; report.reason = 'CURRENT_SESSION_TOKEN_REQUIRED'; return report;
      }
      r = await request(config, '/auth/v1/user', {publicKey: secret.publicKey, token: actor.accessToken, fetchImpl});
      data = {access_token: actor.accessToken, user: r.json};
    } else {
      r = await request(config, '/auth/v1/token?grant_type=password', {publicKey: secret.publicKey, body: actor, fetchImpl});
      data = r.json;
    }
    if (r.status !== 200 || typeof data?.access_token !== 'string' || !data.access_token || typeof data?.user?.id !== 'string') {
      report.authentication = 'INCONCLUSIVE'; report.reason = 'AUTH_FAILED'; return report;
    }
    // A privileged/malformed account token must never stand in for an ordinary test user.
    const payload = ordinaryClaims(data.access_token);
    if (!payload || payload.sub !== data.user.id || data.user.role !== 'authenticated') {
      report.authentication = 'INCONCLUSIVE'; report.reason = 'NORMAL_USER_TOKEN_REQUIRED'; return report;
    }
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
          const state = classify(r, resource, kind, actor); entry.http_status = r.status;
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
