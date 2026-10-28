import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {validateConfig, credentials, sha256} from '../lib/config.mjs';
import {inspect, request, compare} from '../lib/probe.mjs';
import {html} from '../lib/report.mjs';

const jwt = (v) => `header.${Buffer.from(JSON.stringify(v)).toString('base64url')}.test-signature`;
const pub = jwt({role: 'anon'});
const environment = {PUBLIC: pub, A_EMAIL: 'a@example.test', A_PASSWORD: 'test-password-a', B_EMAIL: 'b@example.test', B_PASSWORD: 'test-password-b'};
const config = () => validateConfig({schema_version: 1, environment: 'test', origin: 'http://127.0.0.1:12345', public_key_env: 'PUBLIC',
  actors: {a: {email_env: 'A_EMAIL', password_env: 'A_PASSWORD'}, b: {email_env: 'B_EMAIL', password_env: 'B_PASSWORD'}},
  rows: ['a', 'b'].map((owner) => ({id: `row-${owner}`, table: 'notes', id_column: 'id', record_id: `row-key-${owner}`, owner, expect: {text: `private-note-${owner}`}})),
  objects: ['a', 'b'].map((owner) => ({id: `file-${owner}`, bucket: 'private-files', path: `${owner}/private.txt`, owner, sha256: sha256(`private-file-${owner}`)}))});
const json = (v, status = 200) => new Response(JSON.stringify(v), {status, headers: {'content-type': 'application/json'}});

function backend(mode = 'secure') {
  const calls = [];
  const transport = async (url, options) => {
    calls.push({url: String(url), ...options}); const u = new URL(url);
    if (u.pathname === '/auth/v1/token') {
      const who = JSON.parse(options.body).email === environment.A_EMAIL ? 'a' : 'b';
      if (mode === 'auth-fail') return json({error: 'secret server diagnostics'}, 400);
      const id = mode === 'same-user' ? 'same-user' : `user-${who}`;
      return json({access_token: jwt({role: mode === 'privileged-token' ? 'service_role' : 'authenticated', sub: id}), user: {id, role: 'authenticated'}});
    }
    const token = options.headers.Authorization?.split(' ')[1];
    const who = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub?.split('-').at(-1) : null;
    if (u.pathname.startsWith('/rest/')) {
      const owner = u.searchParams.get('id').split('-').at(-1);
      if (mode === 'deny-all' || (mode === 'mixed' && owner === 'b')) return json([], 200);
      const found = [{id: `row-key-${owner}`, text: `private-note-${owner}`}];
      if (who === owner || mode === 'rows-leak' || mode === 'mixed') return json(found);
      if (mode === 'wrong-data') return json([{id: 'unrelated-record'}]);
      return json([]);
    }
    const owner = u.pathname.split('/').at(-2);
    const publicRoute = u.pathname.includes('/public/');
    if (who === owner || (!publicRoute && mode === 'objects-leak') || mode === 'public-leak') return new Response(`private-file-${owner}`);
    if (mode === 'storage-down') return json({error: 'temporary outage'}, 503);
    if (mode === 'wrong-data') return new Response('unrelated bytes');
    return json({statusCode: '404', error: 'not_found'}, 400);
  };
  return {calls, fetchImpl: transport};
}

test('scoped secure server: own reads work and both other/anonymous routes deny', async () => {
  const b = backend(); const r = await inspect(config(), environment, b);
  assert.equal(r.status, 'PASS'); assert.equal(r.coverage_complete, true);
  assert.deepEqual(r.counts, {PASS: 14, FAIL: 0, INCONCLUSIVE: 0});
  assert.equal(b.calls.length, 16);
  assert.ok(b.calls.slice(2).every((r) => r.method === 'GET'));
  assert.ok(b.calls.every((r) => r.redirect === 'error'));
  assert.equal(b.calls.find((x) => x.url.includes('/authenticated/') && x.headers.Authorization === `Bearer ${pub}`)?.headers.apikey, pub);
});

test('cross-account row leak is visible while Storage controls still pass', async () => {
  const r = await inspect(config(), environment, backend('rows-leak'));
  assert.equal(r.status, 'FAIL'); assert.equal(r.counts.FAIL, 4);
  assert.ok(r.cases.filter((x) => x.surface === 'object').every((x) => x.status === 'PASS'));
});

test('column-restricted reads work without granting unused fields and still expose row leaks', async () => {
  for (const mode of ['secure', 'rows-leak']) {
    const b = backend(mode); const projections = [];
    const r = await inspect(config(), environment, {fetchImpl: (url, options) => {
      const u = new URL(url);
      if (u.pathname.startsWith('/rest/')) {
        const fields = u.searchParams.get('select').split(','); projections.push(fields);
        if (fields.some((field) => !['id', 'text'].includes(field))) return json({code: '42501'}, 403);
      }
      return b.fetchImpl(url, options);
    }});
    assert.equal(projections.length, 6);
    assert.ok(projections.every((fields) => fields.includes('id') && fields.includes('text')));
    assert.deepEqual(r.counts, mode === 'secure'
      ? {PASS: 14, FAIL: 0, INCONCLUSIVE: 0} : {PASS: 10, FAIL: 4, INCONCLUSIVE: 0});
    assert.equal(r.row_projection, 'declared-id-and-expected-fields');
    assert.ok(r.not_tested.includes('undeclared-row-fields'));
  }
});

test('denying a declared field leaves owner controls inconclusive, never green', async () => {
  const b = backend(); let rowReads = 0;
  const r = await inspect(config(), environment, {fetchImpl: (url, options) => {
    if (new URL(url).pathname.startsWith('/rest/')) { rowReads++; return json({code: '42501'}, 403); }
    return b.fetchImpl(url, options);
  }});
  assert.equal(rowReads, 2);
  assert.equal(r.status, 'INCONCLUSIVE');
  assert.deepEqual(r.counts, {PASS: 8, FAIL: 0, INCONCLUSIVE: 6});
  assert.ok(r.cases.filter((c) => c.surface === 'row' && c.actor !== 'owner').every((c) => c.http_status === null));
});

test('an ID repeated in expected fields is requested once and invalid selector names are refused', async () => {
  const c = config(); c.rows.forEach((row) => { row.expect.id = row.record_id; });
  const b = backend(); let rowReads = 0;
  const r = await inspect(validateConfig(c), environment, {fetchImpl: (url, options) => {
    const u = new URL(url);
    if (u.pathname.startsWith('/rest/')) {
      rowReads++; const fields = u.searchParams.get('select').split(',');
      assert.equal(fields.filter((field) => field === 'id').length, 1);
      assert.equal(fields.length, 2);
    }
    return b.fetchImpl(url, options);
  }});
  assert.equal(rowReads, 6); assert.equal(r.status, 'PASS');
  for (const field of ['*', 'text,secret', 'related(secret)', 'secret:internal']) {
    const invalid = config(); invalid.rows[0].expect[field] = 'test';
    assert.throws(() => validateConfig(invalid), {code: 'INVALID_CONFIG'});
  }
});

test('opaque publishable keys stay in apikey while user JWTs stay in Authorization', async () => {
  const publicKey = 'sb_publishable_synthetic-test-key';
  const b = backend('public-leak');
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.apikey, publicKey);
    assert.notEqual(options.headers.Authorization, `Bearer ${publicKey}`);
    return b.fetchImpl(url, options);
  };
  const r = await inspect(config(), {...environment, PUBLIC: publicKey}, {fetchImpl});
  assert.equal(r.status, 'FAIL'); assert.equal(r.counts.FAIL, 6);
  const reads = b.calls.filter((c) => !c.url.includes('/auth/'));
  assert.equal(reads.filter((c) => !c.headers.Authorization).length, 6);
  assert.ok(reads.filter((c) => c.headers.Authorization).every((c) => c.headers.Authorization.startsWith('Bearer header.')));
});

test('anonymous 401 and embedded authentication errors cannot become a security pass', async () => {
  for (const status of [401, 400]) {
    const b = backend();
    const r = await inspect(config(), environment, {fetchImpl: (url, options) => {
      if (!String(url).includes('/auth/') && options.headers.Authorization === `Bearer ${pub}`) {
        return json({statusCode: '401', error: 'InvalidJWT'}, status);
      }
      return b.fetchImpl(url, options);
    }});
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.counts.INCONCLUSIVE, 6);
    assert.equal(r.coverage_complete, false);
  }
});

test('a late cross-user authentication failure or unknown denial status cannot become PASS', async () => {
  for (const status of [400, 403, 404]) {
    for (const error of ['InvalidJWT', 'InvalidSignature', 'TenantNotFound', 'unrecognized-error']) {
      const b = backend();
      const r = await inspect(config(), environment, {fetchImpl: (url, options) => {
        if (new URL(url).pathname.endsWith('/b/private.txt') &&
            options.headers.Authorization === `Bearer ${jwt({role: 'authenticated', sub: 'user-a'})}`) {
          return json({statusCode: String(status === 400 ? 403 : status), error}, status);
        }
        return b.fetchImpl(url, options);
      }});
      assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.coverage_complete, false);
      const cross = r.cases.find((x) => x.resource === 'file-b' && x.actor === 'other');
      assert.equal(cross.status, 'INCONCLUSIVE'); assert.equal(cross.reason, 'UNEXPECTED_RESPONSE');
    }
  }
});

test('only recognized Storage policy/missing-object codes qualify as denied', async () => {
  const accepted = [
    [400, {statusCode: '404', error: 'not_found'}],
    [400, {statusCode: '404', error: 'Bucket not found'}],
    [400, {httpStatusCode: 403, code: 'unauthorized'}],
    [403, {code: 'AccessDenied'}], [404, {code: 'NoSuchKey'}], [404, {code: 'NoSuchBucket'}],
  ];
  const rejected = [[403, {}], [404, null], [404, {error: 'not_found', code: 'InvalidJWT'}],
    [400, {statusCode: '403', error: 'not_found'}], [404, {error: 'Bucket not found'}],
    [400, {httpStatusCode: 404, error: 'Bucket not found'}], [400, {statusCode: 404, code: 'Bucket not found'}]];
  for (const [status, body] of [...accepted, ...rejected]) {
    const b = backend();
    const r = await inspect(config(), environment, {fetchImpl: (url, options) => {
      if (String(url).includes('/storage/') && options.headers.Authorization === `Bearer ${pub}`) return json(body, status);
      return b.fetchImpl(url, options);
    }});
    assert.equal(r.status, accepted.some((v) => v[1] === body) ? 'PASS' : 'INCONCLUSIVE');
  }
});

test('object policy and accidentally public bucket are separate observable failures', async () => {
  const r = await inspect(config(), environment, backend('objects-leak'));
  assert.equal(r.counts.FAIL, 4);
  const p = await inspect(config(), environment, backend('public-leak'));
  assert.equal(p.counts.FAIL, 6);
  assert.equal(p.cases.filter((x) => x.status === 'FAIL' && x.route === 'public-object').length, 2);
});

test('deny-all is inconclusive, not a secure pass', async () => {
  const b = backend('deny-all'); const r = await inspect(config(), environment, b);
  assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.counts.INCONCLUSIVE, 6);
  assert.equal(b.calls.filter((x) => x.url.includes('/rest/')).length, 2);
});

test('one incomplete surface does not erase a confirmed leak', async () => {
  const r = await inspect(config(), environment, backend('mixed'));
  assert.equal(r.status, 'FAIL'); assert.equal(r.coverage_complete, false);
  assert.ok(r.counts.FAIL > 0 && r.counts.INCONCLUSIVE > 0);
});

test('auth failure, same identity, privileged token never reach application probes', async () => {
  for (const mode of ['auth-fail', 'same-user', 'privileged-token']) {
    const b = backend(mode); const r = await inspect(config(), environment, b);
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.cases.length, 0);
    assert.ok(b.calls.every((x) => x.url.includes('/auth/')));
  }
});

test('unexpected rows/files and service errors stay inconclusive', async () => {
  for (const mode of ['wrong-data', 'storage-down']) {
    const r = await inspect(config(), environment, backend(mode));
    assert.equal(r.status, 'INCONCLUSIVE'); assert.equal(r.coverage_complete, false);
  }
});

test('shareable reports exclude fixture contents, credentials, identities and paths', async () => {
  const r = await inspect(config(), environment, backend('objects-leak'));
  const text = JSON.stringify(r) + html(r);
  for (const secret of [...Object.values(environment), 'private-note-a', 'private-file-a', 'private-files', 'a/private.txt', 'user-a', '127.0.0.1']) assert.equal(text.includes(secret), false, secret);
  assert.equal(html({...r, reason: '<script>alert(1)</script>'}).includes('<script>'), false);
});

test('dangerous origins, wrong resource contract and elevated keys are refused', () => {
  for (const origin of ['http://remote.example', 'https://u:p@example.test', 'https://example.test/path', 'https://example.test/?secret=x']) {
    assert.throws(() => validateConfig({...config(), origin}));
  }
  assert.throws(() => credentials(config(), {...environment, PUBLIC: jwt({role: 'service_role'})}));
  assert.throws(() => credentials(config(), {...environment, PUBLIC: 'sb_secret_fake'}));
  assert.throws(() => credentials(config(), {...environment, B_EMAIL: environment.A_EMAIL}));
  assert.throws(() => validateConfig({...config(), rows: [config().rows[0]]}));
});

test('bounded response reading and transport errors cannot turn into denials', async () => {
  const c = config();
  const huge = await request(c, '/rest/v1/notes', {publicKey: pub, fetchImpl: async () => new Response('x'.repeat(1024 * 1024 + 1))});
  assert.equal(huge.error, 'RESPONSE_TOO_LARGE');
  const down = await request(c, '/rest/v1/notes', {publicKey: pub, fetchImpl: async () => { throw new Error('private diagnosis'); }});
  assert.equal(down.error, 'NETWORK_OR_TIMEOUT'); assert.equal(down.status, null);
  await assert.rejects(request(c, '//outside.test', {publicKey: pub}), {code: 'CROSS_ORIGIN_REFUSED'});
});

test('real HTTP redirect does not forward credentials to another route', async (t) => {
  let forwarded = false;
  const server = createServer((req, res) => {
    if (req.url === '/first') { res.writeHead(302, {location: '/second'}); res.end(); }
    else { forwarded = true; res.end('private'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const r = await request({...config(), origin: `http://127.0.0.1:${server.address().port}`}, '/first', {publicKey: pub, token: 'test-only'});
  assert.equal(r.status, null); assert.equal(forwarded, false);
});

test('compare catches a regression and a repair only within the same test contract', async () => {
  const a = await inspect(config(), environment, backend());
  const b = await inspect(config(), environment, backend('public-leak'));
  assert.equal(compare(a, b).regressions.length, 6); assert.equal(compare(b, a).resolved.length, 6);
  assert.throws(() => compare(a, {...b, contract_sha256: 'different'}), {code: 'DIFFERENT_CHECK_CONTRACT'});
  assert.throws(() => compare(a, {...b, cases: []}), {code: 'INVALID_OR_INCOMPLETE_REPORT'});
  assert.throws(() => compare(a, {...b, coverage_complete: false}), {code: 'INVALID_OR_INCOMPLETE_REPORT'});
  assert.throws(() => compare(a, {...b, cases: b.cases.map((r, i) => i ? r : {...r, resource: 'replacement'})}), {code: 'DIFFERENT_CASE_SET'});
});

test('reports from the old SELECT-all policy cannot silently compare with declared-field reads', async () => {
  const c = config(); const r = await inspect(c, environment, backend());
  const legacy = {...r, version: '0.1.1',
    contract_sha256: sha256(JSON.stringify({origin: c.origin, rows: c.rows, objects: c.objects}))};
  delete legacy.row_projection;
  assert.notEqual(r.contract_sha256, legacy.contract_sha256);
  assert.throws(() => compare(legacy, r), {code: 'DIFFERENT_CHECK_CONTRACT'});
  assert.deepEqual(compare(r, r).regressions, []);
});
